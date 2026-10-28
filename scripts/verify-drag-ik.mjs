#!/usr/bin/env node
// Real-mesh IK regressions: target reachability, singular starts and limits.
import path from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(
  process.env.POSE_PLAYWRIGHT_MODULE
    ? pathToFileURL(path.resolve(process.env.POSE_PLAYWRIGHT_MODULE)).href
    : "playwright"
);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    process.env.POSE_STUDIO_URL || "http://127.0.0.1:8767/studio/",
  );
  await page.waitForFunction(() => window.poseStudio, undefined, {
    polling: 100,
    timeout: 60000,
  });
  await page.evaluate(() => poseStudio.ready);
  const result = await page.evaluate(async () => {
    const THREE = await import("three"),
      { scene } = await import("./vendor/mannequin/scene.js"),
      { solveDragIK } = await import("./drag-ik.js"),
      { readAngles, writeAngles, jointAxes } = await import("./presets.js");
    const check = (v, m) => {
      if (!v) throw Error(m);
    };
    const rows = [],
      durations = [];
    for (const sex of ["female", "male"])
      for (const scale of [0.8, 1.2]) {
        poseStudio.reset({ sex });
        poseStudio.setFigure("A", { scale });
        poseStudio.addFigure({ sex: sex === "male" ? "female" : "male" });
        const [model, other] = scene.children.filter((o) => o.body && o.pelvis);
        const otherBefore = poseStudio.getState().figures[1];
        for (const side of ["l", "r"])
          for (const part of ["wrist", "elbow", "ankle", "knee"]) {
            const isArm = ["wrist", "elbow"].includes(part),
              upper = `${side}_${isArm ? "arm" : "leg"}`,
              hinge = `${side}_${isArm ? "elbow" : "knee"}`,
              endpoint = `${side}_${part}`;
            const initial = isArm
              ? { raise: 8, straddle: 12, turn: 0 }
              : { raise: 0, straddle: 6, turn: 0 };
            writeAngles(model, upper, initial);
            writeAngles(model, hinge, { bend: 0 });
            // Generate a genuinely reachable point via a known in-range pose.
            writeAngles(
              model,
              upper,
              isArm
                ? { raise: 42, straddle: 28, turn: 10 }
                : { raise: 25, straddle: 14, turn: 8 },
            );
            if (["wrist", "ankle"].includes(part))
              writeAngles(model, hinge, { bend: isArm ? 45 : 52 });
            model.updateMatrixWorld(true);
            const target = model[endpoint].getWorldPosition(
              new THREE.Vector3(),
            );
            writeAngles(model, upper, initial);
            writeAngles(model, hinge, { bend: 0 });
            model.updateMatrixWorld(true);
            const bodyBefore = model.body.quaternion.clone(),
              otherSide = side === "l" ? "r" : "l";
            const oppositeBefore =
              model[`${otherSide}_${isArm ? "arm" : "leg"}`].quaternion.clone();
            const start = performance.now(),
              r = solveDragIK(model, endpoint, target);
            durations.push(performance.now() - start);
            check(
              r.error < 0.005,
              `${sex} ${scale} ${endpoint} reachable error ${r.error}`,
            );
            check(r.reachable === r.error <= 0.002, "accurate reached flag");
            check(
              r.rootMoved === false,
              "limb drag does not move the figure root",
            );
            check(
              model.body.quaternion.angleTo(bodyBefore) < 1e-7,
              "root unchanged",
            );
            check(
              model[`${otherSide}_${isArm ? "arm" : "leg"}`].quaternion.angleTo(
                oppositeBefore,
              ) < 1e-7,
              "other side unchanged",
            );
            for (const k of r.affected)
              for (const a of jointAxes(k)) {
                const v = readAngles(model, k)[a.property];
                check(
                  Number.isFinite(v) && v >= a.min - 1e-8 && v <= a.max + 1e-8,
                  `${k} ${a.property} limit`,
                );
              }
            rows.push({ sex, scale, endpoint, error: r.error });
          }
        // World-space torso targets work under scene rotation and both model scales.
        model.rotation.set(0, 0.75, 0);
        model.updateMatrixWorld(true);
        const centralParts = [
          "body",
          "pelvis",
          "waist",
          "chest",
          "neck",
          "head",
          "l_arm",
          "r_arm",
          "l_leg",
          "r_leg",
        ];
        for (const key of centralParts) {
          model.updateMatrixWorld(true);
          const startPosition = model[key].getWorldPosition(
            new THREE.Vector3(),
          );
          const noChange = solveDragIK(model, key, startPosition);
          check(
            !noChange.rootMoved && noChange.error < 1e-7,
            `${key} unchanged target`,
          );
          const target = startPosition
            .clone()
            .add(new THREE.Vector3(0.04, 0.03, -0.03));
          const central = solveDragIK(model, key, target);
          check(
            central.error < 0.002,
            `${sex} ${scale} ${key} world-space error ${central.error}`,
          );
          if (["body", "pelvis", "l_leg", "r_leg"].includes(key))
            check(
              central.rootMoved && central.affected.length === 0,
              `${key} uses root translation`,
            );
          for (const affected of central.affected)
            for (const a of jointAxes(affected)) {
              const v = readAngles(model, affected)[a.property];
              check(
                Number.isFinite(v) && v >= a.min - 1e-8 && v <= a.max + 1e-8,
                `torso IK ${affected}.${a.property}`,
              );
            }
          rows.push({
            sex,
            scale,
            endpoint: key,
            error: central.error,
            rootMoved: central.rootMoved,
          });
        }
        // A target created by a feasible torso rotation must not need root translation.
        for (const [key, source] of [
          ["waist", "pelvis"],
          ["chest", "waist"],
          ["neck", "chest"],
          ["head", "neck"],
          ["l_arm", "chest"],
          ["r_arm", "chest"],
        ]) {
          for (const joint of ["pelvis", "waist", "chest"])
            writeAngles(model, joint, { bend: 0, tilt: 0, turn: 0 });
          writeAngles(model, "neck", { nod: 0, tilt: 0, turn: 0 });
          const bendAxis = source === "neck" ? "nod" : "bend";
          writeAngles(model, source, { [bendAxis]: 15 });
          model.updateMatrixWorld(true);
          const target = model[key].getWorldPosition(new THREE.Vector3());
          writeAngles(model, source, { [bendAxis]: 0 });
          model.updateMatrixWorld(true);
          const local = solveDragIK(model, key, target);
          check(
            local.error < 0.002 && !local.rootMoved,
            `${key} should reach attainable point by bending torso: ${local.error}`,
          );
        }
        const savedPosition = model.position.clone();
        const extreme = solveDragIK(model, "pelvis", [50, 0, 0]);
        check(
          extreme.rootMoved && !extreme.reachable && extreme.error > 1,
          "root bounds yield unreachable result",
        );
        check(
          model.position.toArray().every((v) => Math.abs(v) <= 10),
          "root position respects editor limits",
        );
        model.position.copy(savedPosition);
        model.updateMatrixWorld(true);
        check(
          JSON.stringify(poseStudio.getState().figures[1]) ===
            JSON.stringify(otherBefore),
          "other figure unchanged",
        );
        const before = model.l_arm.quaternion.clone();
        const far = solveDragIK(model, "l_wrist", [20, 20, 20]);
        check(
          Number.isFinite(far.error) && far.error > 1 && !far.reachable,
          "unreachable reporting",
        );
        for (const k of far.affected)
          for (const a of jointAxes(k)) {
            const v = readAngles(model, k)[a.property];
            check(
              Number.isFinite(v) && v >= a.min - 1e-8 && v <= a.max + 1e-8,
              "unreachable limits",
            );
          }
        const invalidBefore = model.l_arm.quaternion.clone();
        for (const [key, target] of [
          ["unsupported", [0, 0, 0]],
          ["l_wrist", [NaN, 0, 0]],
          ["l_wrist", [0, 0]],
        ]) {
          let rejected = false;
          try {
            solveDragIK(model, key, target);
          } catch {
            rejected = true;
          }
          check(rejected, "invalid rejected");
        }
        check(
          model.l_arm.quaternion.angleTo(invalidBefore) < 1e-7,
          "invalid is non-mutating",
        );
      }
    return {
      cases: rows.length,
      maxError: Math.max(...rows.map((r) => r.error)),
      maxMs: Math.max(...durations),
      meanMs: durations.reduce((a, b) => a + b, 0) / durations.length,
      rows,
    };
  });
  if (errors.length) throw Error(errors.join("\n"));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
