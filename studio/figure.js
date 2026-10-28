// SPDX-License-Identifier: GPL-3.0-only
// Original POSE Atlas articulated shells over the Mannequin.js skeleton.
import * as THREE from "three";
import { Female } from "./vendor/mannequin/bodies/Female.js";
import { Male } from "./vendor/mannequin/bodies/Male.js";
import { NEUTRAL, applyValues, constrainFingers } from "./presets.js";

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
  // Align chest, pelvis and legs on one neutral sagittal axis. The stock -2
  // torso offset plus separated shells made the pelvis look thrust forward.
  model.torso.position.x = 0;
  model.l_leg.position.set(0, -3.2, female ? -3.45 : -3.3);
  model.r_leg.position.set(0, -3.2, female ? 3.45 : 3.3);
  model.neck.position.x = 0;
  model.head.position.x = 0.25;
  // Remove stock surfaces entirely. Skeleton and anatomical angle setters remain upstream.
  for (const joint of Object.values(all)) {
    joint.image.removeFromParent();
    joint.image = new THREE.Group();
    joint.imageWrapper.add(joint.image);
  }
  const white = new THREE.MeshStandardMaterial({
    color: 0xf2f0ec,
    roughness: 0.48,
    metalness: 0.04,
  });
  const jointMat = new THREE.MeshStandardMaterial({
    color: 0xd6dadb,
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
  // Smooth elliptical profiles, joined at the waist instead of stacked spheres.
  function shell(key, profile) {
    const curve = new THREE.CatmullRomCurve3(
      profile.map(([y, depth, width]) => new THREE.Vector3(y, depth, width)),
      false,
      "catmullrom",
      0.3,
    );
    const vertices = [],
      indices = [],
      rings = 48,
      sides = 36;
    for (let i = 0; i <= rings; i++) {
      const p = curve.getPoint(i / rings);
      for (let j = 0; j <= sides; j++) {
        const a = (j / sides) * Math.PI * 2;
        vertices.push(
          Math.cos(a) * Math.max(0.005, p.y),
          p.x,
          Math.sin(a) * Math.max(0.005, p.z),
        );
      }
    }
    for (let i = 0; i < rings; i++)
      for (let j = 0; j < sides; j++) {
        const a = i * (sides + 1) + j,
          b = a + 1,
          c = a + sides + 1,
          d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return mesh(key, [1, 1, 1], [0, 0, 0], false, geometry);
  }
  shell("pelvis", [
    [-5.2, 0.05, 0.05],
    [-4, 2.1, 2.7],
    [-2, 3.05, female ? 4.55 : 4.1],
    [0.5, 3.0, female ? 4.4 : 4.0],
    [3, 2.45, 3.25],
    [4.5, 2.2, 3.0],
    [4.7, 0.05, 0.05],
  ]);
  mesh("torso", [2.25, 2.4, 2.85], [0, 0, 0], true);
  shell("torso", [
    [-1.1, 0.05, 0.05],
    [-0.8, 2.25, 3.0],
    [2, 2.4, female ? 3.1 : 3.45],
    [5, 2.85, female ? 3.7 : 4.2],
    [9, 3.25, female ? 4.7 : 5.35],
    [12, 3.0, female ? 5.05 : 5.8],
    [14, 2.4, female ? 4.3 : 4.85],
    [15.9, 1.35, 1.8],
    [16.1, 0.05, 0.05],
  ]);
  mesh("neck", [1.3, 2.4, 1.3], [0, 2, 0], true);
  const headGeometry = new THREE.SphereGeometry(1, 36, 28);
  const hp = headGeometry.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const y = hp.getY(i),
      taper = y < 0 ? 1 + y * 0.2 : 1;
    hp.setXYZ(i, hp.getX(i) * taper, y, hp.getZ(i) * taper);
  }
  headGeometry.computeVertexNormals();
  mesh("head", [3.45, 4.7, 3.1], [0.3, 2.5, 0], false, headGeometry);
  function limb(key, length, upper, lower) {
    shell(key, [
      [0.15, 0.05, 0.05],
      [0.6, upper * 0.65, upper * 0.65],
      [2, upper, upper],
      [length * 0.42, upper * 0.95, upper * 0.95],
      [length - 2, lower, lower],
      [length - 0.6, lower * 0.65, lower * 0.65],
      [length - 0.15, 0.05, 0.05],
    ]);
  }
  for (const s of ["l", "r"]) {
    mesh(s + "_arm", [2.0, 2.0, 2.0], [0, 0, 0], true);
    limb(s + "_arm", 11, female ? 1.75 : 2.05, 1.35);
    mesh(s + "_elbow", [1.5, 1.5, 1.5], [0, 0, 0], true);
    limb(s + "_elbow", 11, 1.5, 0.88);
    mesh(s + "_wrist", [0.9, 0.9, 0.9], [0, 0, 0], true);
    mesh(s + "_wrist", [0.65, 1.35, 1.15], [0, 1.2, 0]);
    mesh(s + "_leg", [2.25, 2.25, 2.25], [0, 0, 0], true);
    limb(s + "_leg", 15, female ? 2.5 : 2.4, 1.65);
    mesh(s + "_knee", [1.65, 1.65, 1.65], [0, 0, 0], true);
    limb(s + "_knee", 14, 1.9, 1.05);
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
  constrainFingers(model);
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
