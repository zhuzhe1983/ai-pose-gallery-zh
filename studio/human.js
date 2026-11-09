// SPDX-License-Identifier: GPL-3.0-only
// CC0 MakeHuman geometry and painted weights, bound to the editor's angle rig.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { attachDualQuaternionSkinning } from "./dual-quaternion.js";
import { NEUTRAL, applyValues, constrainFingers } from "./presets.js";
export { applyHumanClothing, clearHumanClothing } from "./clothing.js";

const cache = new Map();
const nativeNames = {
  body: "pelvis",
  pelvis: "pelvis",
  waist: "spine_01",
  waist_mid: "spine_02",
  chest: "spine_03",
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
      let bustMorphs = null;
      if (sex === 'female') {
        try {
          const [metaResponse, dataResponse] = await Promise.all([
            fetch(new URL('./assets/humans/female-bust.json', import.meta.url)),
            fetch(new URL('./assets/humans/female-bust.bin', import.meta.url)),
          ]);
          if (!metaResponse.ok || !dataResponse.ok) throw Error('Bust shapes unavailable');
          const meta = await metaResponse.json(), bytes = await dataResponse.arrayBuffer();
          if (meta.schema !== 'pose-atlas/bust-morphs@1' || meta.targets?.length !== 9 ||
            JSON.stringify(meta.sizeStops) !== '[0,0.75,1]' || JSON.stringify(meta.firmnessStops) !== '[0,0.75,1]' ||
            meta.vertices !== source.geometry.attributes.position.count || bytes.byteLength !== meta.affected * 112)
            throw Error('Invalid bust shapes');
          const indices = new Uint32Array(bytes.slice(0, meta.affected * 4));
          if ([...indices].some(i => i >= meta.vertices)) throw Error('Invalid shape vertex');
          const corners = [], transform = new THREE.Matrix3().setFromMatrix4(source.matrixWorld), v = new THREE.Vector3();
          for (let c = 0; c < 9; c++) {
            const delta = new Float32Array(bytes.slice(meta.affected * 4 + c * meta.affected * 12, meta.affected * 4 + (c + 1) * meta.affected * 12));
            for (let i = 0; i < delta.length; i += 3) {
              v.fromArray(delta, i).applyMatrix3(transform).multiplyScalar(UNIT).toArray(delta, i);
            }
            corners.push(delta);
          }
          bustMorphs = {indices, corners};
        } catch (error) { console.warn('Body shape controls unavailable', error); }
      }
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
        bustMorphs,
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
  const torsoBind = model.chest.getWorldQuaternion(new THREE.Quaternion());
  for (const side of ["l", "r"]) {
    const key = `clavicle_${side}`,
      helper = new THREE.Bone();
    helper.name = key;
    model.chest.add(helper);
    helper.position.copy(model.chest.worldToLocal(asset.joints[key].clone()));
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
    model.chest.getWorldQuaternion(torsoInverse).invert();
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
    joint: "chest",
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
  model.userData.canShape = Boolean(asset.bustMorphs);
  model.userData.mesh = "makehuman-v3";
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

export function setHumanSkinTint(model, color) {
  const skin = model.children.find((o) => o.userData.human);
  if (!skin) return false;
  skin.material.color.set(color || "#edd4c2");
  skin.material.sheen = 0.22;
  return true;
}

// Static, authored size/firmness shapes. Each customized actor owns its geometry;
// untouched actors continue sharing the exact previous default mesh.
export function setHumanShape(model, size = .75, sag = 0) {
  if (![size,sag].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1))
    throw Error('Invalid body shape');
  const asset = cache.get(model.userData.sex), skin = model.children.find(o => o.userData.human);
  if (!skin || !asset || model.userData.sex !== 'female') return false;
  if (size === .75 && sag === 0) {
    if (skin.geometry !== asset.geometry) skin.geometry.dispose();
    skin.geometry = asset.geometry;
  } else {
    if (!asset.bustMorphs) throw Error('Body shape controls unavailable');
    if (skin.geometry === asset.geometry) {
      skin.geometry = asset.geometry.clone();
      skin.geometry.userData.sharedHuman = false;
    }
    // Piecewise bilinear interpolation through the authored 3 × 3 grid.
    // Including the old default as an exact grid point avoids residual dents
    // from subtracting a four-corner approximation of that default.
    const axisWeights = v => v <= .75 ? [1-v/.75,v/.75,0] : [0,(1-v)/.25,(v-.75)/.25];
    const sw = axisWeights(size), fw = axisWeights(.75 * (1-sag));
    const weights = fw.flatMap(f => sw.map(s => s*f));
    const positions = skin.geometry.attributes.position, base = asset.geometry.attributes.position.array;
    positions.array.set(base);
    const {indices,corners} = asset.bustMorphs;
    for (let i=0;i<indices.length;i++) for (let axis=0;axis<3;axis++) {
      let delta=0;
      for (let c=0;c<9;c++) delta += corners[c][i*3+axis]*weights[c];
      positions.array[indices[i]*3+axis] += delta;
    }
    positions.needsUpdate = true;
    skin.geometry.computeVertexNormals();
    skin.geometry.computeBoundingBox();
    skin.geometry.computeBoundingSphere();
  }
  skin.userData.boundsPose = null;
  model.userData.bustSize = size;
  model.userData.bustSag = sag;
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
