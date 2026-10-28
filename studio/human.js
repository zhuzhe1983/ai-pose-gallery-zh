// SPDX-License-Identifier: GPL-3.0-only
// CC0 MakeHuman geometry and painted weights, bound to the editor's angle rig.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { attachDualQuaternionSkinning } from "./dual-quaternion.js";
import { NEUTRAL, applyValues, constrainFingers } from "./presets.js";

const cache = new Map();
const nativeNames = {
  body: "pelvis",
  pelvis: "pelvis",
  torso: "spine_01",
  neck: "neck_01",
  head: "head",
};
for (const side of ["l", "r"]) {
  for (const [control, native] of Object.entries({
    arm: "upperarm",
    elbow: "lowerarm",
    wrist: "hand",
    leg: "thigh",
    knee: "calf",
    ankle: "foot",
  }))
    nativeNames[`${side}_${control}`] = `${native}_${side}`;
  ["thumb", "index", "middle", "ring", "pinky"].forEach((finger, i) => {
    ["", "_mid", "_tip"].forEach((suffix, j) => {
      nativeNames[`${side}_finger_${i}${suffix}`] =
        `${finger}_0${j + 1}_${side}`;
    });
  });
}
const controlKeys = Object.keys(nativeNames);
nativeNames.clavicle_l = "clavicle_l";
nativeNames.clavicle_r = "clavicle_r";
const keys = Object.keys(nativeNames);
const nativeToControl = Object.fromEntries(
  Object.entries(nativeNames).map(([k, n]) => [n, k]),
);
Object.assign(nativeToControl, {
  Root: "body",
  spine_02: "torso",
  spine_03: "torso",
  clavicle_l: "clavicle_l",
  clavicle_r: "clavicle_r",
  ball_l: "l_ankle",
  ball_r: "r_ankle",
});
const UNIT = 50; // editor internal units; public height stays in metres
const BIND = {
  ...NEUTRAL,
  "l_arm.straddle": 45,
  "r_arm.straddle": 45,
  "l_elbow.bend": 0,
  "r_elbow.bend": 0,
  "l_leg.straddle": (Math.atan(0.08) * 180) / Math.PI,
  "r_leg.straddle": (Math.atan(0.08) * 180) / Math.PI,
};

export async function preloadHumans() {
  const loader = new GLTFLoader();
  if (cache.size === 2) return;
  const assets = await Promise.all(
    ["female", "male"].map(async (sex) => {
      const gltf = await loader.loadAsync(
        new URL(`./assets/humans/${sex}.glb`, import.meta.url).href,
      );
      gltf.scene.updateMatrixWorld(true);
      const surfaces = [];
      gltf.scene.traverse((o) => {
        if (o.isSkinnedMesh) surfaces.push(o);
      });
      if (surfaces.length !== 1) throw Error("Expected one human skin");
      const source = surfaces[0];
      const geometry = source.geometry
        .clone()
        .applyMatrix4(source.matrixWorld)
        .scale(UNIT, UNIT, UNIT);
      const joints = {};
      for (const [key, name] of Object.entries(nativeNames)) {
        const bone = source.skeleton.bones.find((b) => b.name === name);
        if (!bone) throw Error(`Missing human bone ${name}`);
        joints[key] = bone
          .getWorldPosition(new THREE.Vector3())
          .multiplyScalar(UNIT);
      }
      // Keep the scene origin at the pelvis, as in legacy scenes and the move gizmo.
      const origin = joints.body.clone();
      geometry.translate(-origin.x, -origin.y, -origin.z);
      for (const point of Object.values(joints)) point.sub(origin);
      const sourceIndex = geometry.attributes.skinIndex;
      const sourceWeight = geometry.attributes.skinWeight;
      const indices = new Uint16Array(sourceIndex.count * 4);
      const weights = new Float32Array(indices.length);
      for (let v = 0; v < sourceIndex.count; v++) {
        const merged = new Map();
        for (let c = 0; c < 4; c++) {
          const name =
            source.skeleton.bones[sourceIndex.getComponent(v, c)].name;
          const key = nativeToControl[name];
          if (!key) throw Error(`Unmapped human bone ${name}`);
          const index = keys.indexOf(key);
          merged.set(
            index,
            (merged.get(index) || 0) + sourceWeight.getComponent(v, c),
          );
        }
        const sorted = [...merged].sort((a, b) => b[1] - a[1]);
        const total = sorted.reduce((sum, [, w]) => sum + w, 0);
        sorted.forEach(([index, weight], c) => {
          indices[v * 4 + c] = index;
          weights[v * 4 + c] = weight / total;
        });
      }
      geometry.setAttribute(
        "skinIndex",
        new THREE.Uint16BufferAttribute(indices, 4),
      );
      geometry.setAttribute(
        "skinWeight",
        new THREE.Float32BufferAttribute(weights, 4),
      );
      geometry.userData.sharedHuman = true;
      geometry.computeBoundingBox();
      const asset = {
        geometry,
        joints,
        height: geometry.boundingBox.max.y - geometry.boundingBox.min.y,
      };
      gltf.scene.traverse((o) => {
        o.geometry?.dispose();
        for (const material of [].concat(o.material || [])) material.dispose();
      });
      source.skeleton.dispose();
      return [sex, asset];
    }),
  );
  for (const [sex, asset] of assets) cache.set(sex, asset);
}

export function attachHuman(model, joints) {
  const asset = cache.get(model.userData.sex);
  if (!asset) return false;
  const geometries = new Set(),
    materials = new Set();
  for (const joint of Object.values(joints)) {
    joint.image.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      for (const m of [].concat(o.material || [])) materials.add(m);
    });
    joint.image.clear();
    joint.scale.setScalar(1);
  }
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  model.scale.setScalar(1);
  model.position.set(0, 0, 0);
  applyValues(model, BIND);
  model.l_fingers.bend = model.r_fingers.bend = 0;
  constrainFingers(model);
  // Set each anatomical pivot in parent order, preserving the public angle axes.
  model.updateMatrixWorld(true);
  for (const key of controlKeys) {
    const joint = joints[key];
    joint.position.copy(joint.parent.worldToLocal(asset.joints[key].clone()));
    joint.updateMatrixWorld(true);
  }
  // Preserve the source clavicle weights instead of merging them into the chest.
  // These display-only helper bones distribute shoulder rotation without changing
  // the public joint positions or the editor's angle/scene protocol.
  const skinJoints = { ...joints },
    shoulders = [];
  const torsoBind = model.torso.getWorldQuaternion(new THREE.Quaternion());
  for (const side of ["l", "r"]) {
    const key = `clavicle_${side}`,
      helper = new THREE.Bone();
    helper.name = key;
    model.torso.add(helper);
    helper.position.copy(model.torso.worldToLocal(asset.joints[key].clone()));
    helper.updateMatrixWorld(true);
    skinJoints[key] = helper;
    shoulders.push({
      helper,
      arm: joints[`${side}_arm`],
      armBindInverse: joints[`${side}_arm`]
        .getWorldQuaternion(new THREE.Quaternion())
        .invert(),
    });
  }
  const torsoInverse = new THREE.Quaternion(),
    armRotation = new THREE.Quaternion();
  const updateShoulders = () => {
    model.torso.getWorldQuaternion(torsoInverse).invert();
    for (const { helper, arm, armBindInverse } of shoulders) {
      arm.getWorldQuaternion(armRotation);
      armRotation
        .premultiply(torsoInverse)
        .multiply(armBindInverse)
        .multiply(torsoBind);
      helper.quaternion.identity().slerp(armRotation, 0.3);
      helper.updateMatrixWorld(true);
    }
  };
  const material = new THREE.MeshPhysicalNodeMaterial({
    color: 0xe8e2d5,
    roughness: 0.58,
    metalness: 0,
    sheen: 0.25,
    sheenColor: new THREE.Color(0xfff8e8),
    sheenRoughness: 0.8,
  });
  const surface = new THREE.SkinnedMesh(asset.geometry, material);
  const skeleton = new THREE.Skeleton(keys.map((key) => skinJoints[key]));
  model.add(surface);
  surface.bind(skeleton, model.matrixWorld);
  surface.castShadow = surface.receiveShadow = true;
  surface.frustumCulled = false;
  surface.userData = {
    human: true,
    suit: true,
    joint: "torso",
    jointKeys: keys,
    updateShoulders,
  };
  attachDualQuaternionSkinning(surface);
  const raycast = surface.raycast;
  surface.raycast = function (...args) {
    humanBounds(model);
    return raycast.apply(this, args);
  };
  model.userData.human = true;
  model.userData.mesh = "makehuman-v2";
  applyValues(model, NEUTRAL);
  model.l_fingers.bend = model.r_fingers.bend = 10;
  constrainFingers(model);
  model.scale.setScalar(model.userData.height / asset.height);
  return true;
}

export function setHumanMaterial(model, outfit) {
  const skin = model.children.find((o) => o.userData.human);
  if (!skin) return false;
  skin.material.color.setHex(outfit === "white" ? 0xf2f0ec : 0xe8e2d5);
  skin.material.sheen = outfit === "white" ? 0.1 : 0.25;
  return true;
}

export function humanBounds(model) {
  const skin = model.children.find((o) => o.userData.human);
  if (!skin) return null;
  model.updateMatrixWorld(true);
  skin.userData.updateShoulders();
  const pose = skin.skeleton.bones
    .map((bone) =>
      [
        ...bone.position.toArray(),
        ...bone.quaternion.toArray(),
        ...bone.scale.toArray(),
      ].join(","),
    )
    .join(";");
  if (skin.userData.boundsPose !== pose) {
    skin.skeleton.update();
    skin.userData.updateSkinning();
    skin.computeBoundingBox();
    skin.boundingSphere ||= new THREE.Sphere();
    skin.boundingBox.getBoundingSphere(skin.boundingSphere);
    skin.userData.boundsPose = pose;
  }
  return skin.boundingBox.clone().applyMatrix4(skin.matrixWorld);
}
