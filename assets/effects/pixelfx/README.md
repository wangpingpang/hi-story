# PixelFX combat selection

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
