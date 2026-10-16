"""Write layered RGBA .aseprite and GIF previews from the deterministic renderer export.

Format reference: https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md
No Aseprite/Spine code or assets are bundled. PNGs are encoded output from our own renderer.
"""
import hashlib
import json
from pathlib import Path
import struct
import sys
import zlib
from PIL import Image

def chunk(kind, data):
    return struct.pack('<IH', len(data) + 6, kind) + data

def string(value):
    data = value.encode('utf-8')
    return struct.pack('<H', len(data)) + data

def encode(directory, output):
    source = json.loads((directory / 'layers.json').read_text())
    names = list(dict.fromkeys(layer['name'] for frame in source['frames'] for layer in frame['layers']))
    tags = source['tags']
    tag_data = struct.pack('<H8x', len(tags))
    for tag in tags:
        tag_data += struct.pack('<HHBH6x3BB', tag['from'], tag['to'], 0, 0 if tag['loop'] else 1, 92, 142, 112, 0) + string(tag['name'])
    body, cache, linked = bytearray(), {}, 0
    for index, frame in enumerate(source['frames']):
        chunks = []
        if index == 0:
            for name in names:
                chunks.append(chunk(0x2004, struct.pack('<6HB3x', 3 | 16, 0, 0, 96, 96, 0, 255) + string(name)))
            chunks.append(chunk(0x2018, tag_data))
        for rank, layer in enumerate(frame['layers']):
            im = Image.open(directory / layer['file']).convert('RGBA')
            assert im.size == (96, 96)
            box = im.getbbox()
            if not box:
                continue
            x, y, right, bottom = box
            pixels = im.crop(box).tobytes()
            key = (layer['name'], box, hashlib.sha256(pixels).digest())
            common = struct.pack('<HhhBHh5x', names.index(layer['name']), x, y, 255, 1 if key in cache else 2, rank - names.index(layer['name']))
            if key in cache:
                payload = common + struct.pack('<H', cache[key])
                linked += 1
            else:
                payload = common + struct.pack('<HH', right - x, bottom - y) + zlib.compress(pixels, 9)
                cache[key] = index
            chunks.append(chunk(0x2005, payload))
        data = b''.join(chunks)
        body += struct.pack('<IHHH2xI', len(data) + 16, 0xF1FA, len(chunks), frame['durationMs'], len(chunks)) + data
    header = bytearray(128)
    struct.pack_into('<I5HIH', header, 0, 128 + len(body), 0xA5E0, len(source['frames']), 96, 96, 32, 1, 100)
    header[34:36] = bytes([1, 1])
    (output / 'traveler.aseprite').write_bytes(header + body)
    # Preserve exact per-frame timing, including a short strike and longer recovery.
    for tag in tags:
        if tag['name'] not in ('stand-SE', 'walk-SE', 'talk-SE', 'attack-SE'):
            continue
        images, durations = [], []
        for frame in source['frames'][tag['from']:tag['to'] + 1]:
            native = Image.open(directory / frame['file']).convert('RGBA')
            im = Image.new('RGB', (384, 384), '#e9e2d5')
            up = native.resize((384, 384), Image.Resampling.NEAREST)
            im.paste(up, mask=up.getchannel('A'))
            images.append(im)
            durations.append(frame['durationMs'])
        images[0].save(output / (tag['name'].split('-')[0] + '.gif'), save_all=True, append_images=images[1:], duration=durations, loop=0, disposal=2, optimize=False)
    return {'frames': len(source['frames']), 'layers': len(names), 'tags': len(tags), 'linkedCels': linked}

if __name__ == '__main__':
    print(json.dumps(encode(Path(sys.argv[1]), Path(sys.argv[2])), ensure_ascii=False))
