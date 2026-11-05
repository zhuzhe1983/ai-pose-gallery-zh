// Validate shipped skins, their provenance checksums and normalized joint weights.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
for (const folder of ['humans', 'articulated']) {
const root = new URL(`../studio/assets/${folder}/`, import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', root)));
for (const [name, expected] of Object.entries(manifest.assets)) {
  const bytes = fs.readFileSync(new URL(name, root));
  assert.equal(bytes.length, expected.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256, name);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const binStart = 20 + jsonLength + 8;
  const bones = gltf.skins[0].joints;
  for (const bone of ['pelvis', 'upperarm_l', 'lowerarm_r', 'thigh_l', 'calf_r', 'head'])
    assert.ok(bones.some(id => gltf.nodes[id].name === bone), `${name}: ${bone}`);
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    const weights = gltf.accessors[primitive.attributes.WEIGHTS_0];
    const joints = gltf.accessors[primitive.attributes.JOINTS_0];
    assert.equal(weights.count, gltf.accessors[primitive.attributes.POSITION].count);
    assert.equal(weights.componentType, 5126);
    const wView = gltf.bufferViews[weights.bufferView], jView = gltf.bufferViews[joints.bufferView];
    const jSize = joints.componentType === 5121 ? 1 : 2;
    assert.ok([5121,5123].includes(joints.componentType));
    for (let v = 0; v < weights.count; v++) {
      let total = 0;
      for (let c = 0; c < 4; c++) {
        const w = bytes.readFloatLE(binStart + (wView.byteOffset || 0) + (weights.byteOffset || 0) + v * (wView.byteStride || 16) + c * 4);
        const jOffset = binStart + (jView.byteOffset || 0) + (joints.byteOffset || 0) + v * (jView.byteStride || jSize * 4) + c * jSize;
        const j = jSize === 1 ? bytes.readUInt8(jOffset) : bytes.readUInt16LE(jOffset);
        assert.ok(Number.isFinite(w) && w >= 0 && w <= 1 && j < bones.length, `${name}: vertex ${v}`);
        total += w;
      }
      assert.ok(Math.abs(total - 1) < 1e-5, `${name}: unnormalized vertex ${v}`);
    }
  }
}
}
const root = new URL('../studio/assets/humans/',import.meta.url);
const meta = JSON.parse(fs.readFileSync(new URL('female-bust.json',root)));
const delta = fs.readFileSync(new URL('female-bust.bin',root));
assert.equal(meta.schema,'pose-atlas/bust-morphs@1');
assert.equal(meta.license,'CC0-1.0');
assert.deepEqual(meta.sizeStops,[0,.75,1]);assert.deepEqual(meta.firmnessStops,[0,.75,1]);
assert.equal(meta.targets.length,9);assert.equal(meta.targets[4],'baseline');
assert.equal(delta.length,meta.affected*112);assert.equal(delta.length,meta.bytes);
assert.equal(createHash('sha256').update(delta).digest('hex'),meta.sha256);
assert.equal(createHash('sha256').update(fs.readFileSync(new URL('female.glb',root))).digest('hex'),meta.base_sha256);
const indices = new Set();
for(let i=0;i<meta.affected;i++) {
  const vertex=delta.readUInt32LE(i*4);assert.ok(vertex<meta.vertices);indices.add(vertex);
  for(let target=0;target<9;target++) for(let axis=0;axis<3;axis++) {
    const v=delta.readFloatLE(meta.affected*4+(target*meta.affected*3+i*3+axis)*4);
    assert.ok(Number.isFinite(v)&&Math.abs(v)<.3,'Bounded morph deltas in metres');
    if(target===4) assert.equal(v,0,'Exact default mesh');
  }
}
assert.equal(indices.size,meta.affected);
console.log('Human assets: CC0 provenance, bones, normalized weights and nine body-shape targets verified.');
