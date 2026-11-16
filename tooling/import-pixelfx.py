"""Import six pinned PixelFX effects. Requires Node and Pillow 12.0.0.

python tooling/import-pixelfx.py --download-only   # fetch locked source for review
python tooling/import-pixelfx.py --offline         # render reviewed cached source
python tooling/import-pixelfx.py --offline --verify # compare to committed products

Source and render intermediates stay in ignored _handoff. No upstream install,
gallery fonts, skill, service, or game runtime dependency is included.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
LOCK = json.loads((ROOT / 'tooling/import-pixelfx-sources.json').read_text())
CACHE = ROOT / '_handoff/pixelfx-source' / LOCK['commit']
RENDER = ROOT / '_handoff/pixelfx-render'
OUT = ROOT / 'public/assets/effects/pixelfx'
SELECTION = [
    ('fire', 'fire/fire-ring', 84, 'ground'),
    ('ice', 'ice/snowflake-burst', 90, 'ground'),
    ('lightning', 'lightning/zap-hit', 80, 'body'),
    ('wind', 'nature/tornado', 100, 'ground'),
    ('arcane', 'arcane/mana-burst', 90, 'ground'),
    ('healing', 'holy/heal-aoe', 84, 'ground'),
]

def sha(data):
    return hashlib.sha256(data).hexdigest()

def document(data):
    return (json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode('utf-8')

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--offline', action='store_true')
    ap.add_argument('--verify', action='store_true')
    ap.add_argument('--download-only', action='store_true')
    args = ap.parse_args()
    sources = []
    for entry in LOCK['files']:
        path = CACHE / entry['path']
        url = f"https://raw.githubusercontent.com/patch-gg/pixelfx/{LOCK['commit']}/{entry['path']}"
        if not path.exists():
            if args.offline:
                raise RuntimeError(f'Missing cached source: {path}')
            req = urllib.request.Request(url, headers={'User-Agent': 'hi-story-pixelfx-import/1'})
            with urllib.request.urlopen(req, timeout=30) as response:
                data = response.read()
            blob = hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()
            if blob != entry['gitBlobSha1']:
                raise RuntimeError(f'Upstream blob mismatch: {entry["path"]}')
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        data = path.read_bytes()
        if hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest() != entry['gitBlobSha1']:
            raise RuntimeError(f'Cached source mismatch: {path}')
        sources.append({**entry, 'sha256': sha(data), 'bytes': len(data), 'url': url})
    print(f'Verified {len(sources)} pinned source files.')
    if args.download_only:
        return

    # A local target keeps the optional converter out of the project/runtime dependencies.
    sys.path.insert(0, str(ROOT / '_handoff/pixelfx-python'))
    from PIL import Image, ImageDraw, __version__ as pillow_version
    if pillow_version != '12.0.0':
        raise RuntimeError('Use Pillow 12.0.0 for reproducible lossless output.')
    subprocess.run(['node', str(ROOT / 'tooling/import-pixelfx-render.mjs'), str(CACHE), str(RENDER)], check=True)
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {
        'version': 'pixelfx-combat-assets/1',
        'source': {'repository': LOCK['repository'], 'commit': LOCK['commit'], 'license': 'MIT',
                   'licenseUrl': 'assets/effects/pixelfx/LICENSE', 'noticeUrl': 'assets/effects/pixelfx/NOTICE.md'},
        'export': {'tool': 'tooling/import-pixelfx.py', 'pillow': pillow_version, 'format': 'lossless WebP',
                   'render': 'upstream renderFrames: native fps, default options/seed, actor false, bg none',
                   'pixelCopy': 'Unmodified straight-alpha RGBA from renderFrames.clear; no canvas alpha-premultiplication',
                   'frames': 'Every native sample including final frame for one-shots; one period for loops',
                   'timing': 'Native fps; frame duration rounded to 6 decimal milliseconds, no speed changes in asset',
                   'playback': 'once; UI may scale playback duration independently'},
        'effects': {},
    }
    verification = {'version': 'pixelfx-verification/1', 'sourceCommit': LOCK['commit'], 'effects': {}}
    previews = []
    for kind, effect_id, display_height, anchor in SELECTION:
        meta = json.loads((RENDER / f'{kind}.json').read_text())
        w, h, count, fps = meta['width'], meta['height'], meta['frameCount'], meta['fps']
        raw = (RENDER / f'{kind}.rgba').read_bytes()
        assert len(raw) == w * h * 4 * count
        columns = math.ceil(math.sqrt(count * h / w))
        rows = math.ceil(count / columns)
        sheet = Image.new('RGBA', (w * columns, h * rows))
        frames, frame_checks, frame_images = [], [], []
        for i in range(count):
            pixels = raw[i*w*h*4:(i+1)*w*h*4]
            frame = Image.frombytes('RGBA', (w, h), pixels)
            frame_images.append(frame)
            x, y = (i % columns) * w, (i // columns) * h
            sheet.paste(frame, (x, y))  # no alpha mask: preserve straight RGBA
            frames.append({'rect': [x, y, w, h], 'durationMs': round(1000 / fps, 6)})
            alpha = frame.getchannel('A')
            frame_checks.append({'rgbaSha256': sha(pixels), 'visiblePixels': sum(a > 0 for a in alpha.getdata()),
                                 'alphaBounds': alpha.getbbox()})
        preview = max(range(count), key=lambda i: frame_checks[i]['visiblePixels'])
        temp = RENDER / f'{kind}.webp'
        sheet.save(temp, format='WEBP', lossless=True, quality=100, method=6, exact=True)
        encoded = temp.read_bytes()
        decoded = Image.open(temp).convert('RGBA')
        if decoded.tobytes() != sheet.tobytes():
            raise RuntimeError(f'Lossless pixel mismatch: {kind}')
        # Verify every extracted frame, including alpha, against the source render.
        for i, frame in enumerate(frames):
            x, y, fw, fh = frame['rect']
            if sha(decoded.crop((x, y, x+fw, y+fh)).tobytes()) != frame_checks[i]['rgbaSha256']:
                raise RuntimeError(f'Frame pixel mismatch: {kind}/{i}')
        publish(kind + '.webp', encoded, args.verify)
        source = next(s for s in sources if s['path'] == f'src/fx/{effect_id}.js')
        manifest['effects'][kind] = {
            'url': f'assets/effects/pixelfx/{kind}.webp', 'width': sheet.width, 'height': sheet.height,
            'frames': frames, 'pivot': meta['pivot'], 'anchor': anchor, 'displayHeight': display_height,
            'previewFrame': preview, 'durationMs': round(sum(f['durationMs'] for f in frames), 6),
            'sha256': sha(encoded), 'bytes': len(encoded),
            'source': {'id': effect_id, 'url': source['url'], 'sha256': source['sha256'],
                       'fps': fps, 'durationSeconds': meta['duration'], 'loop': meta['loop'],
                       'options': meta['options'], 'actorRendered': False},
        }
        verification['effects'][kind] = {'frames': frame_checks, 'sheetRgbaSha256': sha(sheet.tobytes()),
                                          'frameCount': count, 'byteLength': len(encoded), 'sha256': sha(encoded),
                                          'pixelRoundTrip': True}
        previews.append((kind, frame_images, preview))
        print(f'{kind}: {effect_id}, {count} frames, {w}x{h}, {len(encoded)} bytes; lossless pixels verified')
    publish('manifest.json', document(manifest), args.verify)
    publish('verification.json', document(verification), args.verify)
    publish('sources.json', document({'repository': LOCK['repository'], 'commit': LOCK['commit'], 'files': sources}), args.verify)
    publish('LICENSE', (CACHE / 'LICENSE').read_bytes(), args.verify)
    publish('NOTICE.md', (CACHE / 'NOTICE.md').read_bytes(), args.verify)
    publish('README.md', ('''# PixelFX combat selection

Six effects rendered from https://github.com/patch-gg/pixelfx at
`5294518ce7c72e48b6100a744596e0acf57f2826`. See `manifest.json` for effect IDs,
native sampling, options, pivots and byte hashes; `sources.json` locks every
upstream file used by the offline renderer. `verification.json` records every
source-rendered RGBA frame hash and its lossless WebP round trip.

Code and effects: MIT, Copyright (c) 2026 Patch and Hugo Duprez. Preserve LICENSE
and NOTICE.md with this selection. Upstream NOTICE.md also credits the MIT
Hollow Crown code (Copyright (c) 2026 rehan-remade). That actor choreography is
not invoked to render this selection.

The upstream NOTICE.md refers to `gallery/fonts/NOTICE.md`. No gallery font is
included here: Patch Pixel is outside the upstream repository's MIT license.
The six sprite sheets contain no demo actor, gallery UI, or text rendered with
that font. They are visual feedback only, not area/duration/damage game rules.

Reproduce from the project root with Node and Pillow 12.0.0:
`python tooling/import-pixelfx.py --download-only`, review the locked source,
then `python tooling/import-pixelfx.py --offline`. To verify committed products,
run `python tooling/import-pixelfx.py --offline --verify`.

Sprites preserve complete native samples with straight alpha and no cropping,
recoloring, or time scaling. Wind contains one period of the original loop;
game playback is once. Playback speed and final fade belong to presentation.
''').encode('utf-8'), args.verify)
    # A review artifact only, never a game asset.
    contact = Image.new('RGB', (1200, 6 * 190), '#102a23')
    draw = ImageDraw.Draw(contact)
    for row, (kind, images, preview) in enumerate(previews):
        draw.text((12, row*190+8), f'{kind} - {manifest["effects"][kind]["source"]["id"]}', fill='#ffe1a6')
        picks = sorted(set([0, preview, len(images)//3, len(images)*2//3, len(images)-1]))
        for column, i in enumerate(picks):
            frame = images[i].copy()
            frame.thumbnail((224, 150), Image.Resampling.NEAREST)
            x, y = 12+column*236, row*190+32
            contact.paste(frame, (x, y), frame)
            draw.text((x, row*190+172), f'frame {i}', fill='#bde5d3')
    contact.save(RENDER / 'contact.png')
    print(f'{"Verified" if args.verify else "Wrote"} {len(SELECTION)} effects; review: {RENDER / "contact.png"}')

def publish(name, data, verify):
    target = OUT / name
    if verify:
        if not target.exists() or target.read_bytes() != data:
            raise RuntimeError(f'Published artifact differs: {target}')
    else:
        target.write_bytes(data)

if __name__ == '__main__':
    main()
