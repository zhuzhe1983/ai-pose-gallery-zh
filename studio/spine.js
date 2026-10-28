// SPDX-License-Identifier: GPL-3.0-only
import * as THREE from "three";

// Keep Mannequin's limb axes, but restore all three native spine pivots.
// The waist control drives spine_01 + spine_02 equally; chest drives spine_03.
export function addSpine(model) {
  model.waist = model.torso; // legacy object alias; public angles use presets.js
  function segment(parent, name) {
    const node = new THREE.Group();
    node.name = name;
    node.image = new THREE.Group();
    node.imageWrapper = new THREE.Group();
    node.imageWrapper.add(node.image);
    node.add(node.imageWrapper);
    node.position.y = 5.5;
    parent.imageWrapper.add(node);
    return node;
  }
  model.waist_mid = segment(model.waist, "spine_02");
  model.chest = segment(model.waist_mid, "spine_03");
  for (const node of [model.neck, model.l_arm, model.r_arm]) {
    model.chest.imageWrapper.add(node);
    node.position.y -= 11;
    node.parentJoint = model.chest;
  }
}

// @1/@2 have one torso quaternion. Distribute that rotation along the new
// chain; anatomical clamping follows during import. Old framing can shift.
export function migrateSpineScene(raw) {
  const scene = structuredClone(raw);
  if (!["pose-atlas/studio@1", "pose-atlas/studio@2"].includes(scene?.schema))
    return scene;
  for (const figure of scene.figures || []) {
    const q = figure.joints?.torso;
    if (
      !Array.isArray(q) ||
      q.length !== 4 ||
      !q.every(Number.isFinite) ||
      Math.abs(Math.hypot(...q) - 1) > 0.01
    )
      throw Error("Invalid legacy torso");
    const rotation = new THREE.Quaternion().fromArray(q).normalize();
    figure.joints.waist = new THREE.Quaternion().slerp(rotation, 0.3).toArray();
    figure.joints.waist_mid = [...figure.joints.waist];
    figure.joints.chest = new THREE.Quaternion().slerp(rotation, 0.4).toArray();
    delete figure.joints.torso;
  }
  if (scene.joint === "torso") scene.joint = "chest";
  scene.schema = "pose-atlas/studio@3";
  return scene;
}
