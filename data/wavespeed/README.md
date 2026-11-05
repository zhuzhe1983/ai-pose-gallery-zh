# WaveSpeed pose references

Imported from [WaveSpeed AI Pose Gallery](https://wavespeed.ai/free-tools/ai-pose-gallery), checked 2026-11-06.

All 491 poses across 15 categories, with front, three-quarter and side views in both mannequin and line-art styles: 2946 original images. These are reference images, not downloadable 3D meshes or verified reconstructions. The three images in a group can contain inconsistencies.

The source gallery permits personal and commercial reference use and says not to resell the images alone as a pose pack. These images remain subject to the source's terms; the repository's code license does not relicense them. This project is not affiliated with or endorsed by WaveSpeed AI.

`catalog.json` lists category slugs and their small category indexes. `selection.json` records the original English names, asset identifiers and Chinese/Japanese labels. `sources.json` records each local path, original URL and SHA-256 hash. `img/` and `line/` preserve the original WebP bytes; `thumbs/` contains resized JPEGs. The first nine sitting poses retain their previously published PNG links for compatibility. Old UUID-named originals cover only that initial batch; use each source record's `path` to verify the full collection.

Names: `ws_{category}_{pose}_{view}.webp`, lowercase ASCII, at most 64 characters. Views: `f` front, `d` three-quarter, `s` side. Categories: `stand`, `fashion`, `glam`, `boudoir`, `couple`, `daily`, `chair`, `sit`, `kneel`, `lie`, `upper`, `duo`, `sport`, `dance`, `hero`. Pose abbreviations are documented in the [agent skill](../../skills/ai-pose-gallery/SKILL.md).

Reproduce from the registered selection using `python3 scripts/import-wavespeed.py` with Pillow installed. Downloads are cached, dimensions checked, and original files hashed. Names were translated with a local text model and reviewed for pose terminology.
