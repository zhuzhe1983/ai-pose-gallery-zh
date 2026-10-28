// SPDX-License-Identifier: GPL-3.0-only
// Original POSE Atlas articulated shells over the Mannequin.js skeleton.
import * as THREE from "three";
import { Female } from "./vendor/mannequin/bodies/Female.js";
import { Male } from "./vendor/mannequin/bodies/Male.js";
import { NEUTRAL, applyValues } from "./presets.js";

export function bones(model) {
  const result = {};
  for (const key of [
    "body",
    "pelvis",
    "torso",
    "neck",
    "head",
    ...["l", "r"].flatMap((s) =>
      ["arm", "elbow", "wrist", "leg", "knee", "ankle"].map((p) => `${s}_${p}`),
    ),
  ])
    result[key] = model[key];
  for (const s of ["l", "r"])
    for (let i = 0; i < 5; i++) {
      const key = `${s}_finger_${i}`;
      result[key] = model[key];
      result[key + "_mid"] = model[key].mid;
      result[key + "_tip"] = model[key].tip;
    }
  return result;
}
export function createFigure(sex, height) {
  const model = sex === "male" ? new Male(height) : new Female(height);
  const all = bones(model),
    female = sex === "female";
  // Remove stock surfaces entirely. Skeleton and anatomical angle setters remain upstream.
  for (const joint of Object.values(all)) {
    joint.image.removeFromParent();
    joint.image = new THREE.Group();
    joint.imageWrapper.add(joint.image);
  }
  const white = new THREE.MeshStandardMaterial({
    color: 0xf1f0eb,
    roughness: 0.48,
    metalness: 0.04,
  });
  const jointMat = new THREE.MeshStandardMaterial({
    color: 0xc7ccd1,
    roughness: 0.6,
    metalness: 0.08,
  });
  const sphere = new THREE.SphereGeometry(1, 28, 20);
  function mesh(key, scale, pos = [0, 0, 0], joint = false, geometry = sphere) {
    const m = new THREE.Mesh(geometry, (joint ? jointMat : white).clone());
    m.scale.set(...scale);
    m.position.set(...pos);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.joint = key.includes("finger")
      ? key.slice(0, 2) + "wrist"
      : key === "neck"
        ? "head"
        : key === "pelvis"
          ? "body"
          : key;
    all[key].image.add(m);
    return m;
  }
  mesh("pelvis", [female ? 3.5 : 3.2, 3.6, female ? 5 : 4.6], [0, -0.6, 0]);
  mesh("torso", [2.6, 2.6, 2.6], [0, 0.4, 0], true);
  mesh("torso", [female ? 2.7 : 3, 4.3, female ? 3.6 : 4], [0, 4.4, 0]);
  mesh("torso", [female ? 3.1 : 3.4, 5.7, female ? 5.1 : 5.9], [0, 10.7, 0]);
  mesh("neck", [1.5, 2.3, 1.5], [0.3, 2, 0], true);
  mesh("head", [3.5, 4.8, 3.2], [0.5, 2.6, 0]);
  function limb(key, length, radius) {
    mesh(
      key,
      [1, 1, 1],
      [0, length / 2, 0],
      false,
      new THREE.CapsuleGeometry(radius, length - 2 * radius - 0.8, 6, 24),
    );
  }
  for (const s of ["l", "r"]) {
    mesh(s + "_arm", [2.35, 2.35, 2.35], [0, 0, 0], true);
    limb(s + "_arm", 11, female ? 1.65 : 1.95);
    mesh(s + "_elbow", [1.5, 1.5, 1.5], [0, 0, 0], true);
    limb(s + "_elbow", 11, 1.35);
    mesh(s + "_wrist", [0.9, 0.9, 0.9], [0, 0, 0], true);
    mesh(s + "_wrist", [0.65, 1.35, 1.15], [0, 1.2, 0]);
    mesh(s + "_leg", [2.65, 2.65, 2.65], [0, 0, 0], true);
    limb(s + "_leg", 15, female ? 2.45 : 2.35);
    mesh(s + "_knee", [2, 2, 2], [0, 0, 0], true);
    limb(s + "_knee", 14, 1.75);
    mesh(s + "_ankle", [1.35, 1.35, 1.35], [0, 0, 0], true);
    mesh(s + "_ankle", [3.4, 1.35, 1.65], [1.6, 1.2, 0]);
    for (let i = 0; i < 5; i++)
      for (const suffix of ["", "_mid", "_tip"]) {
        const k = `${s}_finger_${i}${suffix}`,
          len = all[k].yVal;
        mesh(k, [0.27, Math.max(0.28, len * 0.58), 0.27], [0, len * 0.48, 0]);
        mesh(k, [0.23, 0.23, 0.23], [0, 0, 0], true);
      }
  }
  white.dispose();
  jointMat.dispose();
  model.userData = { sex, height };
  applyValues(model, NEUTRAL);
  model.l_fingers.bend = 10;
  model.r_fingers.bend = 10;
  // Calibrate height once in a neutral pose; changes of pose must not resize the figure.
  model.position.set(0, 0, 0);
  model.scale.setScalar(1);
  model.updateMatrixWorld(true);
  const size = new THREE.Box3()
    .setFromObject(model)
    .getSize(new THREE.Vector3());
  model.scale.setScalar(height / size.y);
  groundFigure(model);
  return model;
}
export function groundFigure(model) {
  model.position.y = 0;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  model.position.y = -0.7 - box.min.y + 0.003;
  model.updateMatrixWorld(true);
}
export function disposeFigure(model) {
  model.removeFromParent();
  const geometries = new Set(),
    materials = new Set();
  model.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) for (const m of [].concat(o.material)) materials.add(m);
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}
