# Adult human display mannequins

`female.glb` and `male.glb` are adult MakeHuman/MPFB meshes with the bundled
`game_engine` rig and its authored skin weights. Core mesh, morph targets and
rig data are **CC0-1.0**. See `LICENSE-CC0.txt`, `manifest.json`, and the upstream
[asset/output license](https://github.com/makehumancommunity/mpfb2/blob/6ff1eb358f6c1959ced77e79e6dd2406d9a71f49/LICENSE.md).
They are generated human figures, not scans of a real person, certified crash
simulation dummies, SHF products, or Dummy 13 assets.

POSE Atlas modifications: adult female/male proportions, neutral straight-limb
A-pose, closed eye sockets, smoothed nipple detail, one subdivision level, smooth
normals, ivory material, no texture maps or facial animation. Each GLB is about
3 MiB, with 56,494 vertices before glTF splitting and 112,976 triangles. This is
a continuous display-mannequin surface, not a simulated garment. Extreme bends
can still compress the skin; no collision or corrective blendshape solver is
included. Unmodified actors share browser geometry; edited female shapes own a separate geometry.

The browser remaps the supplied weights to the existing angle controls in
`studio/human.js`; the spine, neck and head have separate controls; toes share ankles.
Runtime revision `makehuman-v3` uses dual-quaternion skinning and preserves the
source clavicle weights with display-only shoulder helpers. GPU deformation and
CPU picking/bounds use the same dual-quaternion blend. This reduces large-angle
volume collapse; it does not remove all bulging or provide collision constraints.
It keeps the existing named joints, limits, photo fitting and URL scene API.
The default material is `ivory`; `white` changes its finish. If assets fail to
load, the editor reports the simplified procedural fallback.

Rebuild from the repository root (Blender 4.2+; tested with 5.2.1):

```sh
git clone https://github.com/makehumancommunity/mpfb2.git output/model-research/mpfb2
git -C output/model-research/mpfb2 checkout 6ff1eb358f6c1959ced77e79e6dd2406d9a71f49
blender --background --factory-startup --python scripts/build-human-models.py -- output/model-research/mpfb2
```

The build creates an extension repository in the temporary Blender process; it
does not save user preferences. The browser uses only same-origin GLB files, not
Blender, Python, a generation service, or a third-party model CDN. Regenerated
binaries may vary with Blender version; update checksums after review.

## Optional static female body shapes

`female-bust.bin` and `female-bust.json` contain sparse position deltas from nine authored MakeHuman cupsize/firmness combinations. A 3 × 3 interpolation grid includes the original 0.75 / 0.75 body exactly. Only chest-region vertices are transferred; the shipped GLBs, rig, limbs and post-adjusted eyes remain unchanged. Checksums bind the deltas to the original female GLB. The targets are covered by the same CC0 license. These are appearance controls, not bra measurements or dynamic physics.

Rebuild after obtaining the pinned MPFB checkout above:

```sh
blender --background --factory-startup --python scripts/build-bust-morphs.py -- output/model-research/mpfb2
python3 scripts/pack-bust-morphs.py
```

Generated intermediate GLBs stay under ignored `output/bust-morphs/`; only the compact deltas ship. Packing validates vertex correspondence in the chest and rejects unexpected edits elsewhere below the head.
