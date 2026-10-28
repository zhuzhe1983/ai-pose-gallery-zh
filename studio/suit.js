// SPDX-License-Identifier: GPL-3.0-only
// A continuous fitted surface, skinned to the existing rig. No cloth simulation.
import * as THREE from "three";
import { MarchingCubes } from "three/addons/objects/MarchingCubes.js";
import { NEUTRAL, applyValues } from "./presets.js";

const KEYS = [
  "pelvis",
  "torso",
  "neck",
  "l_arm",
  "l_elbow",
  "l_wrist",
  "r_arm",
  "r_elbow",
  "r_wrist",
  "l_leg",
  "l_knee",
  "l_ankle",
  "r_leg",
  "r_knee",
  "r_ankle",
];
const geometryCache = new Map();
const blend = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function buildGeometry(model) {
  const female = model.feminine,
    primitives = [],
    segments = [];
  const inverse = model.matrixWorld.clone().invert();
  const joint = (key) =>
    new THREE.Vector3()
      .setFromMatrixPosition(model[key].matrixWorld)
      .applyMatrix4(inverse);
  function ellipsoid(key, center, radii) {
    const matrix = new THREE.Matrix4().multiplyMatrices(
      inverse,
      model[key].imageWrapper.matrixWorld,
    );
    const origin = new THREE.Vector3(...center).applyMatrix4(matrix);
    const rotation = new THREE.Matrix3()
      .setFromMatrix4(matrix)
      .transpose().elements;
    const [rx, ry, rz] = radii;
    primitives.push({
      key,
      origin,
      radius: Math.max(...radii),
      distance(x, y, z) {
        x -= origin.x;
        y -= origin.y;
        z -= origin.z;
        const a = rotation[0] * x + rotation[3] * y + rotation[6] * z,
          b = rotation[1] * x + rotation[4] * y + rotation[7] * z,
          c = rotation[2] * x + rotation[5] * y + rotation[8] * z;
        const k0 = Math.hypot(a / rx, b / ry, c / rz),
          k1 = Math.hypot(a / (rx * rx), b / (ry * ry), c / (rz * rz));
        return (k0 * (k0 - 1)) / Math.max(k1, 0.00001);
      },
    });
  }
  ellipsoid("pelvis", [0, -0.6, 0], [3.1, 4.6, female ? 4.9 : 4.35]);
  ellipsoid("pelvis", [-1.5, -1.4, -2.25], [2.15, 2.9, 2.6]);
  ellipsoid("pelvis", [-1.5, -1.4, 2.25], [2.15, 2.9, 2.6]);
  ellipsoid(
    "torso",
    [0, 0.8, 0],
    [female ? 2.15 : 2.5, 5, female ? 2.95 : 3.4],
  );
  ellipsoid(
    "torso",
    [0, 8.6, 0],
    [female ? 2.85 : 3.15, 7.4, female ? 4.35 : 5.5],
  );
  for (const side of [-1, 1])
    ellipsoid(
      "torso",
      [
        female ? 2.35 : 2.55,
        female ? 10.2 : 10.9,
        side * (female ? 2.3 : 2.65),
      ],
      [female ? 2.15 : 1.2, female ? 2.65 : 2.55, female ? 2.3 : 2.85],
    );
  ellipsoid("torso", [0, 15.5, 0], [1.7, 3, 1.8]);
  ellipsoid("neck", [0, 0.8, 0], [1.48, 2.1, 1.48]);
  function segment(start, end, parent, radii) {
    const a = joint(start),
      b = joint(end),
      v = b.clone().sub(a),
      len2 = v.lengthSq();
    const item = { start, end, parent, a, b, v, len2, radii };
    item.project = (x, y, z) =>
      ((x - a.x) * v.x + (y - a.y) * v.y + (z - a.z) * v.z) / len2;
    item.distance = (x, y, z) => {
      const t = THREE.MathUtils.clamp(item.project(x, y, z), 0, 1),
        scaled = t * (radii.length - 1),
        index = Math.min(radii.length - 2, Math.floor(scaled)),
        f = scaled - index;
      const radius =
        radii[index] +
        (radii[index + 1] - radii[index]) * (f * f * (3 - 2 * f));
      return (
        Math.hypot(x - a.x - t * v.x, y - a.y - t * v.y, z - a.z - t * v.z) -
        radius
      );
    };
    segments.push(item);
    primitives.push({
      ...item,
      origin: a.clone().add(b).multiplyScalar(0.5),
      radius: Math.sqrt(len2) / 2 + Math.max(...radii),
    });
  }
  for (const s of ["l", "r"]) {
    segment(
      s + "_arm",
      s + "_elbow",
      "torso",
      female ? [1.65, 1.95, 1.7, 1.5] : [2.05, 2.7, 2.2, 1.7],
    );
    segment(
      s + "_elbow",
      s + "_wrist",
      s + "_arm",
      female ? [1.5, 1.7, 1.35, 0.95] : [1.7, 2.1, 1.6, 1.1],
    );
    segment(
      s + "_leg",
      s + "_knee",
      "pelvis",
      female ? [2.95, 3.2, 2.6, 1.8] : [3.15, 3.5, 2.8, 1.95],
    );
    segment(
      s + "_knee",
      s + "_ankle",
      s + "_leg",
      female ? [1.8, 2.3, 1.8, 1.05] : [1.95, 2.65, 2, 1.25],
    );
  }
  const box = new THREE.Box3();
  for (const p of primitives) {
    box.expandByPoint(p.origin.clone().addScalar(p.radius + 1.5));
    box.expandByPoint(p.origin.clone().addScalar(-p.radius - 1.5));
  }
  const center = box.getCenter(new THREE.Vector3()),
    half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const surface = new MarchingCubes(
    64,
    new THREE.MeshStandardMaterial(),
    false,
    false,
    40000,
  );
  surface.isolation = 0;
  const n = surface.size;
  for (let iz = 0; iz < n; iz++)
    for (let iy = 0; iy < n; iy++)
      for (let ix = 0; ix < n; ix++) {
        const x = center.x + ((ix / n) * 2 - 1) * half.x,
          y = center.y + ((iy / n) * 2 - 1) * half.y,
          z = center.z + ((iz / n) * 2 - 1) * half.z;
        let distance = 100;
        for (const p of primitives)
          distance = blend(distance, p.distance(x, y, z), 0.9);
        surface.field[ix + iy * n + iz * n * n] = -distance;
      }
  surface.update();
  const count = surface.count,
    geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      surface.geometry.attributes.position.array.slice(0, count * 3),
      3,
    ),
  );
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(
      surface.geometry.attributes.normal.array.slice(0, count * 3),
      3,
    ),
  );
  geometry.applyMatrix4(
    new THREE.Matrix4().compose(center, new THREE.Quaternion(), half),
  );
  surface.geometry.dispose();
  surface.material.dispose();
  const vertices = geometry.attributes.position,
    indices = [],
    weights = [];
  for (let i = 0; i < count; i++) {
    const x = vertices.getX(i),
      y = vertices.getY(i),
      z = vertices.getZ(i);
    const closest = segments
      .map((s) => ({ s, d: s.distance(x, y, z) }))
      .sort((a, b) => a.d - b.d)[0];
    const bodyDistance = Math.min(
      ...primitives.filter((p) => p.key).map((p) => p.distance(x, y, z)),
    );
    let map;
    if (closest.d < bodyDistance + 0.35) {
      const s = closest.s,
        t = s.project(x, y, z);
      if (t < 0.2) {
        const weight = 0.5 + 0.5 * smooth(0, 0.2, t);
        map = { [s.parent]: 1 - weight, [s.start]: weight };
      } else if (t > 0.8) {
        const weight = 0.5 * smooth(0.8, 1, t);
        map = { [s.start]: 1 - weight, [s.end]: weight };
      } else map = { [s.start]: 1 };
    } else {
      const p = new THREE.Vector3(x, y, z)
        .applyMatrix4(model.matrixWorld)
        .applyMatrix4(model.torso.imageWrapper.matrixWorld.clone().invert());
      const torsoWeight = smooth(-1.8, 2.8, p.y),
        neckWeight = smooth(15.4, 18.4, p.y);
      map = {
        pelvis: 1 - torsoWeight,
        torso: torsoWeight * (1 - neckWeight),
        neck: neckWeight,
      };
    }
    const entries = Object.entries(map)
        .filter(([_k, w]) => w > 0)
        .slice(0, 4),
      sum = entries.reduce((s, [_k, w]) => s + w, 0);
    for (let j = 0; j < 4; j++) {
      indices.push(entries[j] ? KEYS.indexOf(entries[j][0]) : 0);
      weights.push(entries[j] ? entries[j][1] / sum : 0);
    }
  }
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(indices, 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(weights, 4),
  );
  geometry.userData.sharedPoseSuit = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createSuit(model) {
  const keys = [...KEYS, "body", "head", "l_ankle", "r_ankle"],
    saved = new Map(keys.map((k) => [k, model[k].quaternion.clone()]));
  // Build/bind with the arms away from the chest. A down-arm rest surface would
  // fuse sleeves to the rib cage and stretch that accidental bridge on raising.
  applyValues(model, {
    ...NEUTRAL,
    "l_arm.straddle": 65,
    "r_arm.straddle": 65,
    "l_elbow.bend": 0,
    "r_elbow.bend": 0,
    "l_leg.straddle": 24,
    "r_leg.straddle": 24,
  });
  model.pelvis.quaternion.identity();
  model.updateMatrixWorld(true);
  let garment;
  try {
    const key = model.feminine ? "female" : "male";
    if (!geometryCache.has(key)) geometryCache.set(key, buildGeometry(model));
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xe8e2d5,
      roughness: 0.63,
      metalness: 0,
      sheen: 0.55,
      sheenColor: 0xffffff,
      sheenRoughness: 0.72,
    });
    garment = new THREE.SkinnedMesh(geometryCache.get(key), material);
    garment.name = "Fitted stretch suit";
    garment.castShadow = true;
    garment.receiveShadow = true;
    garment.frustumCulled = false;
    garment.userData.joint = "torso";
    garment.userData.suit = true;
    garment.userData.jointKeys = KEYS;
    model.add(garment);
    model.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(KEYS.map((k) => model[k]));
    garment.bind(skeleton, model.matrixWorld.clone());
  } finally {
    for (const [key, q] of saved) model[key].quaternion.copy(q);
    model.updateMatrixWorld(true);
  }
  return garment;
}
