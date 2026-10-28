// SPDX-License-Identifier: GPL-3.0-only
import * as THREE from "three";
import { constrainJoint } from "./presets.js";
import { solveDragIK } from "./drag-ik.js";

export function captureFeet(model) {
  model.updateMatrixWorld(true);
  model.userData.footLocks = Object.fromEntries(
    ["l", "r"].map((side) => {
      const foot = model[side + "_ankle"];
      return [
        side,
        {
          position: foot.getWorldPosition(new THREE.Vector3()).toArray(),
          rotation: foot.getWorldQuaternion(new THREE.Quaternion()).toArray(),
        },
      ];
    }),
  );
  model.userData.footError = 0;
  model.userData.footAngleError = 0;
  return model.userData.footLocks;
}

// Hold ankle positions via the same bounded IK as direct dragging, then restore
// each foot's world orientation as far as the ankle limits permit. This does not
// enforce sole contact or collision, and unreachable anchors remain explicit.
export function solveFeet(model) {
  const locks = model.userData.footLocks;
  if (!locks) return 0;
  let worst = 0,
    worstAngle = 0;
  for (const side of ["l", "r"]) {
    const key = side + "_ankle",
      foot = model[key];
    const target = new THREE.Vector3().fromArray(locks[side].position);
    solveDragIK(model, key, target, { iterations: 60, tolerance: 0.0004 });
    model.updateMatrixWorld(true);
    const desired = new THREE.Quaternion().fromArray(locks[side].rotation);
    foot.quaternion
      .copy(foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert())
      .multiply(desired);
    constrainJoint(model, key);
    model.updateMatrixWorld(true);
    worst = Math.max(
      worst,
      foot.getWorldPosition(new THREE.Vector3()).distanceTo(target),
    );
    worstAngle = Math.max(
      worstAngle,
      desired.angleTo(foot.getWorldQuaternion(new THREE.Quaternion())),
    );
  }
  model.userData.footError = worst;
  model.userData.footAngleError = worstAngle;
  return worst;
}
