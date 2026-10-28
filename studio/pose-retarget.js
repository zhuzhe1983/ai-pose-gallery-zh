// SPDX-License-Identifier: GPL-3.0-only
// Constrained landmark retargeting, not a calibrated 3D reconstruction.
import * as THREE from "three";
import {
  NEUTRAL,
  applyValues,
  readAngles,
  writeAngles,
  jointAxes,
  constrainFigure,
} from "./presets.js";
import { pointConfidence } from "./pose-detection.js";

const V = () => new THREE.Vector3();
const pos = (o) => o.getWorldPosition(V());
const midpoint = (a, b) => a.clone().add(b).multiplyScalar(0.5);
const direction = (a, b) => b.clone().sub(a).normalize();
const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
const clamp = THREE.MathUtils.clamp;
export const BODY_POINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

export function validateDetection(result) {
  if (
    !result ||
    !Number.isFinite(result.width) ||
    !Number.isFinite(result.height) ||
    result.width < 1 ||
    result.height < 1 ||
    !Array.isArray(result.people) ||
    result.people.length > 6
  )
    throw Error("poseInvalidResult");
  for (const person of result.people) {
    for (const field of [
      "landmarks",
      "worldLandmarks",
      ...(person.originalLandmarks ? ["originalLandmarks"] : []),
    ]) {
      const points = person[field];
      if (
        !Array.isArray(points) ||
        points.length !== 33 ||
        points.some(
          (p) =>
            !p ||
            ![p.x, p.y, p.z].every(Number.isFinite) ||
            [p.x, p.y, p.z].some((n) => Math.abs(n) > 100) ||
            (p.visibility !== undefined &&
              (!Number.isFinite(p.visibility) ||
                p.visibility < 0 ||
                p.visibility > 1)) ||
            (p.presence !== undefined &&
              (!Number.isFinite(p.presence) ||
                p.presence < 0 ||
                p.presence > 1)),
        )
      )
        throw Error("poseInvalidResult");
    }
  }
  return result;
}
export function usablePerson(person) {
  const c = (i) => pointConfidence(person.landmarks[i]);
  return (
    [11, 12, 23, 24].every((i) => c(i) >= 0.25) &&
    BODY_POINTS.filter((i) => c(i) >= 0.45).length >= 6
  );
}
function targetPoints(person, width, height) {
  const { landmarks: lm, worldLandmarks: world } = person;
  const torsoWorld = midpoint(
    new THREE.Vector3(world[11].x, world[11].y, world[11].z),
    new THREE.Vector3(world[12].x, world[12].y, world[12].z),
  ).distanceTo(
    midpoint(
      new THREE.Vector3(world[23].x, world[23].y, world[23].z),
      new THREE.Vector3(world[24].x, world[24].y, world[24].z),
    ),
  );
  const original = person.originalLandmarks || lm;
  const shoulder = {
    x: (original[11].x + original[12].x) / 2,
    y: (original[11].y + original[12].y) / 2,
  };
  const hip = {
    x: (original[23].x + original[24].x) / 2,
    y: (original[23].y + original[24].y) / 2,
  };
  const pixelTorso = Math.hypot(
    (shoulder.x - hip.x) * width,
    (shoulder.y - hip.y) * height,
  );
  const metersPerPixel = clamp(
    torsoWorld / Math.max(20, pixelTorso),
    0.0001,
    0.02,
  );
  return world.map(
    (p, i) =>
      new THREE.Vector3(
        p.x + (lm[i].x - original[i].x) * width * metersPerPixel,
        -p.y - (lm[i].y - original[i].y) * height * metersPerPixel,
        -p.z,
      ),
  );
}

function basisQuaternion(x, y, z) {
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(x, y, z),
  );
}
function orientTorso(model, points) {
  const left = midpoint(points[11], points[23]),
    right = midpoint(points[12], points[24]);
  const z = direction(left, right); // rig +Z is anatomical right
  const y = direction(
    midpoint(points[23], points[24]),
    midpoint(points[11], points[12]),
  );
  const x = y.clone().cross(z).normalize();
  if (x.length() < 0.5) return;
  y.copy(z).cross(x).normalize();
  model.body.quaternion.copy(basisQuaternion(x, y, z));
}

// Coordinate descent uses only joint world transforms, never mesh vertices.
async function fitAngles(model, keys, cost, seeds, signal) {
  const dimensions = keys.flatMap((key) =>
    jointAxes(key).map((axis) => ({ key, ...axis })),
  );
  const snapshot = () =>
    Object.fromEntries(keys.map((key) => [key, readAngles(model, key)]));
  const apply = (state) => {
    for (const key of keys) writeAngles(model, key, state[key]);
  };
  let best = snapshot(),
    bestCost = Infinity;
  for (const seed of seeds) {
    signal?.throwIfAborted();
    apply(seed);
    let score = cost();
    for (const step of [24, 10, 4, 1.5, 0.5]) {
      for (let cycle = 0; cycle < 3; cycle++) {
        let improved = false;
        for (const { key, property, min, max } of dimensions) {
          const initial = readAngles(model, key)[property];
          let chosen = initial;
          for (const delta of [-step, step]) {
            const candidate = clamp(initial + delta, min, max);
            writeAngles(model, key, { [property]: candidate });
            const value = cost();
            if (value < score - 1e-8) {
              score = value;
              chosen = candidate;
              improved = true;
            }
          }
          writeAngles(model, key, { [property]: chosen });
        }
        if (!improved) break;
      }
    }
    if (score < bestCost) {
      bestCost = score;
      best = snapshot();
    }
    await pause();
  }
  apply(best);
  return bestCost;
}

export async function retargetPerson(
  model,
  person,
  { width, height, signal } = {},
) {
  const points = targetPoints(person, width, height);
  const confident = (i) => pointConfidence(person.landmarks[i]) >= 0.35;
  applyValues(model, NEUTRAL);
  model.quaternion.identity();
  model.pelvis.quaternion.identity();
  orientTorso(model, points);
  const skipped = [],
    errors = [];
  // Both segment directions resolve most of the twist ambiguity. Weak/occluded
  // endpoints retain the neutral limb instead of trusting a hallucinated ankle/wrist.
  for (const [side, armIndices, legIndices] of [
    ["l", [11, 13, 15], [23, 25, 27]],
    ["r", [12, 14, 16], [24, 26, 28]],
  ]) {
    for (const [part, hinge, end, indices] of [
      ["arm", "elbow", "wrist", armIndices],
      ["leg", "knee", "ankle", legIndices],
    ]) {
      const [a, b, c] = indices,
        upper = `${side}_${part}`,
        lower = `${side}_${hinge}`,
        tip = `${side}_${end}`;
      if (!indices.every(confident)) {
        skipped.push(upper);
        continue;
      }
      const u = direction(points[a], points[b]),
        v = direction(points[b], points[c]);
      if (
        points[a].distanceTo(points[b]) < 0.025 ||
        points[b].distanceTo(points[c]) < 0.025
      ) {
        skipped.push(upper);
        continue;
      }
      const bend = clamp(
        THREE.MathUtils.radToDeg(Math.acos(clamp(u.dot(v), -1, 1))),
        0,
        150,
      );
      writeAngles(model, lower, { bend });
      // Analytic starting frame from the measured bend plane, then project into
      // supported Euler ranges and optimize those actual, limited controls.
      const perpendicular = v.clone().addScaledVector(u, -u.dot(v));
      if (perpendicular.length() > 0.04) {
        const x = perpendicular.normalize().negate(),
          y = u.clone(),
          z = x.clone().cross(y).normalize();
        const world = basisQuaternion(x, y, z).multiply(
          model[upper].imageWrapper.quaternion.clone().invert(),
        );
        const parent = model[upper].parent.getWorldQuaternion(
          new THREE.Quaternion(),
        );
        model[upper].quaternion.copy(parent.invert().multiply(world));
        writeAngles(model, upper, readAngles(model, upper));
      }
      const initial = readAngles(model, upper);
      const cost = () => {
        const aa = pos(model[upper]),
          bb = pos(model[lower]),
          cc = pos(model[tip]);
        const du = direction(aa, bb),
          dv = direction(bb, cc);
        return du.distanceToSquared(u) + dv.distanceToSquared(v);
      };
      const seeds = [{ [upper]: initial }];
      for (const raise of part === "arm" ? [0, 90, 175] : [0, 90, 140])
        seeds.push({
          [upper]: { raise, straddle: part === "arm" ? 60 : 25, turn: 0 },
        });
      const error = await fitAngles(model, [upper], cost, seeds, signal);
      errors.push({ part: upper, directionError: Math.sqrt(error / 2) });
    }
  }
  // Head tilt/nod and feet can be refined without touching the fitted limbs.
  if ([0, 7, 8, 11, 12].every(confident)) {
    const up = direction(
      midpoint(points[11], points[12]),
      midpoint(points[7], points[8]),
    );
    const forward = direction(midpoint(points[7], points[8]), points[0]);
    const cost = () => {
      const q = model.head.getWorldQuaternion(new THREE.Quaternion());
      return (
        new THREE.Vector3(0, 1, 0).applyQuaternion(q).distanceToSquared(up) +
        0.65 *
          new THREE.Vector3(1, 0, 0)
            .applyQuaternion(q)
            .distanceToSquared(forward)
      );
    };
    await fitAngles(
      model,
      ["head"],
      cost,
      [{ head: { nod: 0, tilt: 0, turn: 0 } }],
      signal,
    );
  }
  for (const [side, heel, toe] of [
    ["l", 29, 31],
    ["r", 30, 32],
  ]) {
    if (![heel, toe].every(confident)) continue;
    const key = `${side}_ankle`,
      target = direction(points[heel], points[toe]);
    const cost = () =>
      new THREE.Vector3(1, 0, 0)
        .applyQuaternion(
          model[key].imageWrapper.getWorldQuaternion(new THREE.Quaternion()),
        )
        .distanceToSquared(target);
    await fitAngles(
      model,
      [key],
      cost,
      [{ [key]: { bend: 0, tilt: 0, turn: 0 } }],
      signal,
    );
  }
  constrainFigure(model);
  return { skipped, errors };
}
