#!/usr/bin/env node
// Real browser rig regression; needs the local server and Playwright.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(
  process.env.POSE_PLAYWRIGHT_MODULE
    ? pathToFileURL(path.resolve(process.env.POSE_PLAYWRIGHT_MODULE)).href
    : "playwright"
);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(),
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
    const { scene } = await import("./vendor/mannequin/scene.js");
    const { captureChest, stabilizeChest } = await import(
      "./pelvis-stabilize.js"
    );
    const { bones } = await import("./figure.js");
    const { jointAxes, readAngles } = await import("./presets.js");
    const check = (ok, msg) => {
      if (!ok) throw Error(msg);
    };
    const model = () => scene.children.find((o) => o.body && o.pelvis);
    const result = [];
    for (const sex of ["female", "male"])
      for (const pelvic of [
        { bend: 20 },
        { tilt: 15 },
        { turn: 35 },
        { bend: 15, tilt: 10, turn: 18 },
      ]) {
        poseStudio.reset({ sex });
        poseStudio.setJoint("A", "waist", { bend: 8, tilt: -5, turn: 7 });
        poseStudio.setJoint("A", "chest", { bend: -4, tilt: 4, turn: -8 });
        let m = model(),
          target = captureChest(m);
        poseStudio.setJoint("A", "pelvis", pelvic);
        const other = Object.fromEntries(
          Object.entries(bones(m))
            .filter(([k]) => !["waist", "waist_mid", "chest"].includes(k))
            .map(([k, v]) => [k, v.quaternion.toArray()]),
        );
        const out = stabilizeChest(m, target);
        check(
          out.reachable && out.errorDegrees < 1,
          `${sex}: ${JSON.stringify(pelvic)} ${JSON.stringify(out)}`,
        );
        for (const [k, q] of Object.entries(other))
          check(
            bones(m)
              [k].quaternion.toArray()
              .every(
                (v, i) => Object.is(v, q[i]) || Math.abs(v - q[i]) < 1e-12,
              ),
            `${k} mutated`,
          );
        for (const key of ["waist", "chest"])
          for (const a of jointAxes(key)) {
            const v = readAngles(m, key)[a.property];
            check(
              v >= a.min - 1e-8 && v <= a.max + 1e-8,
              `${key}.${a.property} outside limit`,
            );
          }
        result.push({ sex, pelvic, error: out.errorDegrees });
      }
    poseStudio.reset();
    poseStudio.setJoint("A", "waist", { bend: 40 });
    poseStudio.setJoint("A", "chest", { bend: 30 });
    let m = model(),
      target = captureChest(m);
    poseStudio.setJoint("A", "pelvis", { bend: -30 });
    const unreachable = stabilizeChest(m, target);
    check(
      !unreachable.reachable &&
        unreachable.errorDegrees > 1 &&
        Number.isFinite(unreachable.errorDegrees),
      "Unreachable target must remain explicit",
    );
    for (const key of ["waist", "chest"])
      for (const a of jointAxes(key)) {
        const v = readAngles(m, key)[a.property];
        check(
          v >= a.min - 1e-8 && v <= a.max + 1e-8,
          `${key} limit at unreachable target`,
        );
      }
    for (const bad of [
      null,
      { x: 0, y: 0, z: 0, w: 0, isQuaternion: true },
      { x: NaN, y: 0, z: 0, w: 1, isQuaternion: true },
    ]) {
      let rejected = false;
      try {
        stabilizeChest(m, bad);
      } catch {
        rejected = true;
      }
      check(rejected, "Bad target accepted");
    }
    return { result, unreachable };
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
