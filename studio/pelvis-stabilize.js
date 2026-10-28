// SPDX-License-Identifier: GPL-3.0-only
// Optional chest-orientation stabilizer for pelvis edits.
// It preserves only an orientation, not position, balance or collision.
import * as THREE from "three";
import { jointAxes, readAngles, writeAngles } from "./presets.js";

const ANGULAR_TOLERANCE = THREE.MathUtils.degToRad(1);
const RAD_TO_DEG = 180 / Math.PI;

export function captureChest(model) {
  model.updateMatrixWorld(true);
  return model.chest.getWorldQuaternion(new THREE.Quaternion()).normalize();
}

// Shortest signed world-space rotation vector represented by a quaternion.
function rotationVector(q) {
  if (q.w < 0) q = new THREE.Quaternion(-q.x, -q.y, -q.z, -q.w);
  const length = Math.hypot(q.x, q.y, q.z);
  if (length < 1e-12) return new THREE.Vector3();
  const angle = 2 * Math.atan2(length, THREE.MathUtils.clamp(q.w, -1, 1));
  return new THREE.Vector3(q.x, q.y, q.z).multiplyScalar(angle / length);
}

/**
 * Restore the captured chest world orientation using only bounded waist and
 * chest controls. The waist control moves its two spine segments together.
 * Returns residual angular error in degrees. Other joint controls are untouched.
 * Ranges are artistic constraints, so a target can legitimately be unreachable.
 */
export function stabilizeChest(model, target) {
  if (
    !target?.isQuaternion ||
    ![target.x, target.y, target.z, target.w].every(Number.isFinite) ||
    target.lengthSq() < 1e-12
  )
    throw Error("Invalid chest target");
  const desired = target.clone().normalize();
  const axes = ["waist", "chest"].flatMap((key) =>
    jointAxes(key).map((axis) => ({ key, ...axis })),
  );
  const initial = Object.fromEntries(
    ["waist", "chest"].map((key) => [key, readAngles(model, key)]),
  );
  let values = axes.map((a) => initial[a.key][a.property]);

  function apply(v) {
    for (let i = 0; i < axes.length; i++) {
      const a = axes[i];
      writeAngles(model, a.key, { [a.property]: v[i] });
    }
  }
  function current() {
    model.updateMatrixWorld(true);
    return model.chest.getWorldQuaternion(new THREE.Quaternion()).normalize();
  }
  function error(q) {
    return desired.angleTo(q);
  }

  let orientation = current(),
    distance = error(orientation),
    best = [...values];
  // Use a much tighter solver threshold than the exposed 1° reachability
  // threshold, and preserve the best state if clamping prevents progress.
  for (let iteration = 0; iteration < 36 && distance > 0.0005; iteration++) {
    orientation = current();
    const e = rotationVector(
      desired.clone().multiply(orientation.clone().invert()),
    );
    const columns = axes.map((a, i) => {
      const h = values[i] + 0.2 <= a.max ? 0.2 : -0.2;
      const probe = [...values];
      probe[i] = THREE.MathUtils.clamp(values[i] + h, a.min, a.max);
      const actual = probe[i] - values[i];
      if (Math.abs(actual) < 1e-9) return new THREE.Vector3();
      apply(probe);
      const delta = current().multiply(orientation.clone().invert());
      return rotationVector(delta).divideScalar(actual);
    });
    apply(values);
    // Damped least squares Jᵀ(JJᵀ + λI)⁻¹ Δω. Angles are in
    // degrees; angular residual is radians, and J has radians/degree.
    const matrix = Array.from({ length: 3 }, (_, r) =>
      Array.from({ length: 3 }, (_, c) =>
        columns.reduce(
          (sum, col) => sum + col.getComponent(r) * col.getComponent(c),
          r === c ? 1e-7 : 0,
        ),
      ),
    );
    const d = e.applyMatrix3(
      new THREE.Matrix3().set(...matrix.flat()).invert(),
    );
    let improved = false;
    for (const rate of [1, 0.5, 0.2]) {
      const trial = values.map((value, i) =>
        THREE.MathUtils.clamp(
          value + rate * THREE.MathUtils.clamp(columns[i].dot(d), -8, 8),
          axes[i].min,
          axes[i].max,
        ),
      );
      apply(trial);
      const score = error(current());
      if (score < distance - 1e-9) {
        values = trial;
        best = [...trial];
        distance = score;
        improved = true;
        break;
      }
    }
    if (!improved) break;
  }
  apply(best);
  const residual = error(current());
  return {
    errorRadians: residual,
    errorDegrees: residual * RAD_TO_DEG,
    reachable: residual <= ANGULAR_TOLERANCE,
  };
}
