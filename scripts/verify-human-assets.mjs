// Validate shipped skins, their provenance checksums and normalized joint weights.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root = new URL('../studio/assets/humans/', import.meta.url);
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
console.log('Human assets: CC0 manifest checksums, required bones and all skin weights verified.');
