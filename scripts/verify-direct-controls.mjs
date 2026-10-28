#!/usr/bin/env node
// Real editor controls: chest stabilization and pointer dragging with IK.
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
  const program = await page.evaluate(async () => {
    const THREE = await import("three"),
      { scene } = await import("./vendor/mannequin/scene.js");
    const model = () => scene.children.find((o) => o.body && o.pelvis);
    poseStudio.reset();
    let m = model();
    poseStudio.setJoint("A", "l_knee", { bend: 24 });
    poseStudio.setJoint("A", "r_knee", { bend: 24 });
    poseStudio.setChestLock("A", true);
    poseStudio.setFootLock("A", true);
    const target = m.chest.getWorldQuaternion(new THREE.Quaternion());
    const locks = poseStudio.getState().figures[0].footLocks;
    poseStudio.setJoint("A", "pelvis", { bend: 12, turn: 10 });
    m.updateMatrixWorld(true);
    const error = THREE.MathUtils.radToDeg(
      target.angleTo(m.chest.getWorldQuaternion(new THREE.Quaternion())),
    );
    const footErrors = ["l", "r"].map((side) =>
      m[side + "_ankle"]
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(new THREE.Vector3(...locks[side].position)),
    );
    const url = await poseStudio.getShareURL();
    await poseStudio.loadShareURL(url);
    const restored = poseStudio.getState().figures[0];
    poseStudio.reset();
    m = model();
    const before = m.l_wrist.getWorldPosition(new THREE.Vector3());
    const result = poseStudio.moveJointTarget(
      "A",
      "l_wrist",
      before
        .clone()
        .add(new THREE.Vector3(0.03, 0.06, 0))
        .toArray(),
    );
    const moved = m.l_wrist
      .getWorldPosition(new THREE.Vector3())
      .distanceTo(before);
    const invalid = poseStudio.getState();
    let rejected = false;
    try {
      poseStudio.moveJointTarget("A", "neck", [1, 2, 3]);
    } catch {
      rejected = true;
    }
    return {
      error,
      footErrors,
      restored: !!restored.chestLock && !!restored.footLocks,
      result,
      moved,
      rejected,
      unchanged:
        JSON.stringify(invalid) === JSON.stringify(poseStudio.getState()),
    };
  });
  assert.ok(program.error < 1, "Chest orientation preserved");
  assert.ok(Math.max(...program.footErrors) < 0.003, "Feet anchored");
  assert.ok(program.restored, "Anchors survive URL");
  assert.ok(
    program.result.reachable && program.moved > 0.04,
    "API moves wrist with IK",
  );
  assert.ok(
    program.rejected && program.unchanged,
    "Unsupported targets rejected without mutation",
  );
  const waistPull = await page.evaluate(async () => {
    const THREE = await import("three"),
      { scene } = await import("./vendor/mannequin/scene.js");
    poseStudio.reset();
    poseStudio.setJoint("A", "l_knee", { bend: 24 });
    poseStudio.setJoint("A", "r_knee", { bend: 24 });
    poseStudio.setFootLock("A", true);
    poseStudio.setChestLock("A", true);
    const model = scene.children.find((o) => o.body && o.pelvis),
      state = poseStudio.getState().figures[0],
      q = model.chest.getWorldQuaternion(new THREE.Quaternion());
    const target = model.waist
      .getWorldPosition(new THREE.Vector3())
      .add(new THREE.Vector3(0.03, 0.01, 0));
    const result = poseStudio.moveJointTarget("A", "waist", target.toArray());
    model.updateMatrixWorld(true);
    return {
      result,
      chest: THREE.MathUtils.radToDeg(
        q.angleTo(model.chest.getWorldQuaternion(new THREE.Quaternion())),
      ),
      feet: ["l", "r"].map((s) =>
        model[s + "_ankle"]
          .getWorldPosition(new THREE.Vector3())
          .distanceTo(new THREE.Vector3(...state.footLocks[s].position)),
      ),
    };
  });
  console.log(JSON.stringify({waistPull}));
  assert.ok(waistPull.result.reachable, "Waist reaches its target");
  assert.ok(waistPull.chest < 1, "Waist drag respects chest orientation");
  assert.ok(
    Math.max(...waistPull.feet) < 0.005,
    "Waist drag respects foot anchors",
  );
  await page.locator("#joint").selectOption("waist");
  await page.locator("#canvasPull").click();
  assert.equal(
    await page.locator("#canvasPull").getAttribute("aria-pressed"),
    "true",
  );
  assert.doesNotMatch(
    await page.locator("#pullStatus").textContent(),
    /请选择/,
  );
  await page.evaluate(() => poseStudio.reset());
  await page.locator("#joint").selectOption("l_wrist");
  await page.locator("#canvasPull").click();
  const before = await page.evaluate(async () => {
    const THREE = await import("three"),
      { scene } = await import("./vendor/mannequin/scene.js");
    return scene.children
      .find((o) => o.body && o.pelvis)
      .l_wrist.getWorldPosition(new THREE.Vector3())
      .toArray();
  });
  await page.mouse.move(865, 536);
  await page.mouse.down();
  await page.mouse.move(905, 536, { steps: 12 });
  await page.mouse.up();
  const after = await page.evaluate(async () => {
    const THREE = await import("three"),
      { scene } = await import("./vendor/mannequin/scene.js");
    return scene.children
      .find((o) => o.body && o.pelvis)
      .l_wrist.getWorldPosition(new THREE.Vector3())
      .toArray();
  });
  const displacement = Math.hypot(...after.map((n, i) => n - before[i]));
  assert.ok(displacement > 0.01, `Pointer drag moves wrist: ${displacement}`);
  const movedState = await page.evaluate(() => poseStudio.getState());
  await page.evaluate(() => poseStudio.undo());
  const undoState = await page.evaluate(() => poseStudio.getState());
  assert.notDeepEqual(
    movedState.figures[0].joints.l_arm,
    undoState.figures[0].joints.l_arm,
    "Undo drag",
  );
  await page.keyboard.press("e");
  assert.equal(
    await page.locator("#canvasRotate").getAttribute("aria-pressed"),
    "true",
  );
  await page.keyboard.press("t");
  assert.equal(
    await page.locator("#canvasPull").getAttribute("aria-pressed"),
    "true",
  );
  for (const lang of ["zh", "en", "ja"]) {
    await page.goto(
      (process.env.POSE_STUDIO_URL || "http://127.0.0.1:8767/studio/") +
        "?lang=" +
        lang,
    );
    await page.waitForFunction(() => window.poseStudio, undefined, {
      polling: 100,
      timeout: 60000,
    });
    await page.evaluate(() => poseStudio.ready);
    assert.ok(await page.locator("#canvasPull").isVisible());
    assert.ok(await page.locator("#lockChest").count());
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      chestErrorDegrees: program.error,
      footErrors: program.footErrors,
      apiDragError: program.result.error,
      pointerDisplacement: displacement,
      url: true,
      undo: true,
      languages: 3,
    }),
  );
} finally {
  await browser.close();
}
