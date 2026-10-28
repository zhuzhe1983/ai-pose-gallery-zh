# Studio source and licenses

The standalone posing studio in this directory is provided under GPL-3.0-only
(see `LICENSE`). Its editable JavaScript and CSS source is shipped alongside the
page. This notice does not change the image collection's original rights.

- [Mannequin.js](https://github.com/boytchev/mannequin.js), Pavel Boytchev,
  npm `mannequin-js@5.2.3`, GPL-3.0. Source and license: `vendor/mannequin/`.
  Modification on 2026-10-28: replace its automatic scene initialization with a
  scene-only shim so POSE Atlas can own the WebGPU renderer. All other vendored
  mannequin files are unchanged. The embedded font retains its original notice.
- [Three.js](https://github.com/mrdoob/three.js), `three@0.186.1`, MIT.
  Source and license: `vendor/three/`. Vendored files are unchanged.

Reproduce these dependencies from the pinned npm packages using
`npm ci --ignore-scripts && npm run vendor:studio`. The public page loads the
checked-in files from this site; it does not depend on an external CDN.

POSE Atlas adds original articulated surfaces (`figure.js`), fixed-order angle
controls, a new multilingual UI, hand-authored presets and a PNG/scene API.
No stock editor interface or SHF-branded model is included. Generated captures
are output images; this source-code license does not automatically license the
gallery collection or apply to independent artwork made using the references.
