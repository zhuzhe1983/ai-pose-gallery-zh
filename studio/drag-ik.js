// SPDX-License-Identifier: GPL-3.0-only
// Position-only inverse kinematics for dragging a limb joint in world space.
// The editor's existing joint-angle limits are respected; this does not infer
// palm/sole orientation, enforce collisions, or solve body-surface contact.
import * as THREE from "three";
import { readAngles, writeAngles, jointAxes } from "./presets.js";

const endpoint = /^(l|r)_(wrist|elbow|ankle|knee)$/;
const centralChains = {
  body: [],
  pelvis: [],
  waist: ["pelvis"],
  chest: ["pelvis", "waist"],
  neck: ["pelvis", "waist", "chest"],
  head: ["pelvis", "waist", "chest", "neck"],
  l_arm: ["pelvis", "waist", "chest"],
  r_arm: ["pelvis", "waist", "chest"],
  l_leg: [],
  r_leg: [],
};

/**
 * Move a selected limb joint or torso pivot towards a world-space target.
 * Limbs use rotations only; torso pivots use bounded upstream rotations first,
 * then translate the figure for any remaining target distance.
 *
 * @param {THREE.Object3D} model editor mannequin
 * @param {string} key selected joint (torso, shoulder, hip, elbow, wrist, knee or ankle)
 * @param {THREE.Vector3 | number[]} worldTarget target in world metres
 * @param {{iterations?:number,tolerance?:number,lockPelvis?:boolean}} options
 * @returns {{actual:number[], error:number, reachable:boolean, affected:string[], rootMoved:boolean}}
 *
 * Limb endpoints do not move the root. Callers decide how to handle
 * automatic grounding, mirrored editing and foot anchors. Distances can remain
 * non-zero even for a target within limb length: anatomical limits also apply.
 */
export function solveDragIK(model, key, worldTarget, options = {}) {
  const match = typeof key === "string" && key.match(endpoint);
  const central = typeof key === "string" && Object.hasOwn(centralChains, key);
  if ((!match && !central) || !model?.[key])
    throw Error("Unsupported drag target");
  const coordinates = Array.isArray(worldTarget)
    ? worldTarget
    : worldTarget?.isVector3
      ? worldTarget.toArray()
      : null;
  if (
    !coordinates ||
    coordinates.length !== 3 ||
    !coordinates.every(Number.isFinite)
  )
    throw Error("Invalid drag target");
  if (
    options.lockPelvis !== undefined &&
    typeof options.lockPelvis !== "boolean"
  )
    throw Error("Invalid pelvis lock option");
  const iterations = options.iterations ?? 34,
    tolerance = options.tolerance ?? 0.002;
  if (
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    iterations > 100 ||
    !Number.isFinite(tolerance) ||
    tolerance <= 0 ||
    tolerance > 0.1
  )
    throw Error("Invalid IK options");
  const side = match?.[1],
    part = match?.[2];
  const upper = match
    ? `${side}_${part === "wrist" || part === "elbow" ? "arm" : "leg"}`
    : null;
  const hinge = match ? `${side}_${part === "wrist" ? "elbow" : "knee"}` : null;
  const affected = central
    ? centralChains[key].filter(
        (joint) => !(options.lockPelvis && joint === "pelvis"),
      )
    : part === "wrist" || part === "ankle"
      ? [upper, hinge]
      : [upper];
  const axes = affected.flatMap((joint) =>
    jointAxes(joint).map((a) => ({ ...a, joint })),
  );
  const target = new THREE.Vector3(...coordinates),
    point = new THREE.Vector3();
  if (affected.some((joint) => !model[joint]))
    throw Error("Missing limb joints");
  const currentValues = () =>
    axes.map(({ joint, property }) => readAngles(model, joint)[property]);
  const apply = (values) => {
    const byJoint = {};
    axes.forEach(
      ({ joint, property }, i) =>
        ((byJoint[joint] ??= {})[property] = values[i]),
    );
    for (const [joint, value] of Object.entries(byJoint))
      writeAngles(model, joint, value);
  };
  const position = (out) => {
    model.updateMatrixWorld(true);
    return model[key].getWorldPosition(out);
  };
  const original = currentValues();
  const originalPosition = model.position.clone();
  // Weak damping stabilizes twist about a limb axis when the point alone does
  // not constrain it. An accepted step must reduce world-space position error.
  function optimize(start, steps) {
    let values = [...start];
    apply(values);
    let current = position(point).clone(),
      error = current.distanceTo(target),
      best = [...values];
    for (let step = 0; step < steps && error > tolerance * 0.35; step++) {
      const delta = target.clone().sub(current),
        columns = [];
      for (let i = 0; i < axes.length; i++) {
        const increment = values[i] + 0.25 <= axes[i].max ? 0.25 : -0.25;
        const probe = [...values];
        probe[i] += increment;
        apply(probe);
        columns.push(
          position(point).clone().sub(current).divideScalar(increment),
        );
      }
      apply(values);
      const matrix = Array.from({ length: 3 }, (_, row) =>
        Array.from({ length: 3 }, (_, col) =>
          columns.reduce(
            (n, v) => n + v.getComponent(row) * v.getComponent(col),
            row === col ? 1e-7 : 0,
          ),
        ),
      );
      const inverse = new THREE.Matrix3().set(...matrix.flat()).invert();
      const solve = delta.applyMatrix3(inverse);
      const direction = columns.map((column) => column.dot(solve));
      // Uniform scaling preserves the descent direction; per-axis clipping can
      // cancel the knee/hip compensation and stall even on a reachable target.
      const largest = Math.max(...direction.map(Math.abs));
      const scale = largest > 9 ? 9 / largest : 1;
      let improved = false;
      for (const rate of [1, 0.5, 0.2, 0.08]) {
        const candidate = values.map((v, i) =>
          THREE.MathUtils.clamp(
            v + rate * scale * direction[i],
            axes[i].min,
            axes[i].max,
          ),
        );
        apply(candidate);
        const next = position(point).clone(),
          distance = next.distanceTo(target);
        if (Number.isFinite(distance) && distance < error - 1e-9) {
          values = candidate;
          current = next;
          error = distance;
          best = [...values];
          improved = true;
          break;
        }
      }
      if (!improved) break;
    }
    return { values: best, error };
  }
  try {
    let result = axes.length
      ? optimize(original, iterations)
      : { values: original, error: position(point).distanceTo(target) };
    // At a straight hinge the Jacobian has essentially zero radial derivative.
    // Seed a small physically valid bend to unlock a reachable inward target.
    if (match && affected.length === 2 && result.error > tolerance) {
      const index = axes.findIndex(
        (a) => a.joint === hinge && a.property === "bend",
      );
      if (index >= 0 && original[index] < 20) {
        const seed = [...original];
        seed[index] = Math.min(
          axes[index].max,
          Math.max(axes[index].min, original[index] + 15),
        );
        const alternative = optimize(seed, Math.min(iterations, 24));
        if (alternative.error < result.error - 1e-7) result = alternative;
      }
    }
    apply(result.values);
    let actual = position(point).toArray(),
      error = point.distanceTo(target),
      rootMoved = false;
    if (central && error > tolerance * 0.35) {
      // The node position cannot be changed by its own rotation. Move the
      // model root by the remaining world-space delta, converted into its
      // parent's coordinates. Clamp to the editor's existing ±10 m bounds.
      const desiredRoot = model
        .getWorldPosition(new THREE.Vector3())
        .add(target.clone().sub(point));
      if (model.parent) model.parent.worldToLocal(desiredRoot);
      model.position.copy(desiredRoot).clampScalar(-10, 10);
      rootMoved = model.position.distanceTo(originalPosition) > 1e-9;
      actual = position(point).toArray();
      error = point.distanceTo(target);
    }
    if (!Number.isFinite(error)) throw Error("IK result is not finite");
    return {
      actual,
      error,
      reachable: error <= tolerance,
      affected,
      rootMoved,
    };
  } catch (error) {
    apply(original);
    model.position.copy(originalPosition);
    model.updateMatrixWorld(true);
    throw error;
  }
}
