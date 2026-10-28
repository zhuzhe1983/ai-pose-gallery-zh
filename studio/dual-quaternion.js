// SPDX-License-Identifier: GPL-3.0-only
// Rigid dual-quaternion blending, with matching GPU and CPU deformation.
// Keeps volume at large joint rotations; does not solve surface collisions.
import * as THREE from "three";
const { Fn, attribute, buffer, vec3, vec4, cross, dot, select, normalLocal } =
  THREE.TSL;

export function attachDualQuaternionSkinning(skin) {
  const data = new Float32Array(skin.skeleton.bones.length * 8);
  const transform = new THREE.Matrix4(),
    inverse = new THREE.Matrix4();
  const q = new THREE.Quaternion(),
    p = new THREE.Vector3(),
    scale = new THREE.Vector3();
  const update = () => {
    skin.userData.updateShoulders?.();
    inverse.copy(skin.matrixWorld).invert();
    skin.skeleton.bones.forEach((bone, i) => {
      transform
        .copy(inverse)
        .multiply(bone.matrixWorld)
        .multiply(skin.skeleton.boneInverses[i])
        .multiply(skin.bindMatrix);
      transform.decompose(p, q, scale);
      const j = i * 8,
        x = q.x,
        y = q.y,
        z = q.z,
        w = q.w,
        tx = p.x,
        ty = p.y,
        tz = p.z;
      data.set(
        [
          x,
          y,
          z,
          w,
          0.5 * (tx * w + ty * z - tz * y),
          0.5 * (-tx * z + ty * w + tz * x),
          0.5 * (tx * y - ty * x + tz * w),
          -0.5 * (tx * x + ty * y + tz * z),
        ],
        j,
      );
    });
    return data;
  };
  const dq = buffer(
    data,
    "vec4",
    skin.skeleton.bones.length * 2,
  ).onObjectUpdate(update);
  skin.material.positionNode = Fn(() => {
    const ids = attribute("skinIndex", "uvec4"),
      weights = attribute("skinWeight", "vec4");
    const first = dq.element(ids.x.mul(2));
    const real = vec4(0).toVar(),
      dual = vec4(0).toVar();
    for (const c of ["x", "y", "z", "w"]) {
      const index = ids[c].mul(2),
        r = dq.element(index),
        d = dq.element(index.add(1));
      const weight = weights[c].mul(select(dot(first, r).lessThan(0), -1, 1));
      real.addAssign(r.mul(weight));
      dual.addAssign(d.mul(weight));
    }
    const length = real.length().max(1e-8).toVar();
    real.divAssign(length);
    dual.divAssign(length);
    const rotate = (v) =>
      v.add(cross(real.xyz, cross(real.xyz, v).add(v.mul(real.w))).mul(2));
    normalLocal.assign(rotate(attribute("normal", "vec3")));
    const translation = dual.xyz
      .mul(real.w)
      .sub(real.xyz.mul(dual.w))
      .add(cross(real.xyz, dual.xyz))
      .mul(2);
    return rotate(attribute("position", "vec3")).add(translation);
  })();
  // CPU picking, framing and grounding must use exactly the same skinning.
  skin.applyBoneTransform = function (index, target) {
    const ids = this.geometry.attributes.skinIndex,
      weights = this.geometry.attributes.skinWeight;
    const first = ids.getComponent(index, 0) * 8;
    let x = 0,
      y = 0,
      z = 0,
      w = 0,
      dx = 0,
      dy = 0,
      dz = 0,
      dw = 0;
    for (let c = 0; c < 4; c++) {
      const j = ids.getComponent(index, c) * 8;
      const sign =
        data[first] * data[j] +
          data[first + 1] * data[j + 1] +
          data[first + 2] * data[j + 2] +
          data[first + 3] * data[j + 3] <
        0
          ? -1
          : 1;
      const a = weights.getComponent(index, c) * sign;
      x += data[j] * a;
      y += data[j + 1] * a;
      z += data[j + 2] * a;
      w += data[j + 3] * a;
      dx += data[j + 4] * a;
      dy += data[j + 5] * a;
      dz += data[j + 6] * a;
      dw += data[j + 7] * a;
    }
    const n = Math.max(Math.hypot(x, y, z, w), 1e-8);
    x /= n;
    y /= n;
    z /= n;
    w /= n;
    dx /= n;
    dy /= n;
    dz /= n;
    dw /= n;
    const vx = target.x,
      vy = target.y,
      vz = target.z;
    const cx = y * vz - z * vy + w * vx,
      cy = z * vx - x * vz + w * vy,
      cz = x * vy - y * vx + w * vz;
    return target.set(
      vx + 2 * (y * cz - z * cy) + 2 * (w * dx - dw * x + y * dz - z * dy),
      vy + 2 * (z * cx - x * cz) + 2 * (w * dy - dw * y + z * dx - x * dz),
      vz + 2 * (x * cy - y * cx) + 2 * (w * dz - dw * z + x * dy - y * dx),
    );
  };
  skin.userData.updateSkinning = update;
  skin.userData.skinning = "dual-quaternion";
  update();
}
