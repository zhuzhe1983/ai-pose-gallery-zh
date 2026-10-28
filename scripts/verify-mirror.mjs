#!/usr/bin/env node
// Browser checks for joint-space reflection, editable controls and persistence.
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
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForFunction(() => window.poseStudio, undefined, {
    polling: 100,
    timeout: 60000,
  });
  await page.evaluate(() => poseStudio.ready);
  const result = await page.evaluate(async () => {
    const THREE = await import("three"),
      { scene } = await import("./vendor/mannequin/scene.js");
    const model = () => scene.children.find((o) => o.body && o.pelvis);
    const check = (v, msg) => {
      if (!v) throw Error(msg);
    };
    const near = (a, b) => Math.abs(a - b) < 1e-6;
    poseStudio.reset();
    check(!document.querySelector("#mirrorSync").checked, "off by default");
    poseStudio.addFigure({ sex: "male" });
    const beforeB = JSON.stringify(poseStudio.getState().figures[1]);
    poseStudio.setMirrorSync(true);
    const cases = {
      arm: { raise: 35, straddle: 18, turn: -20 },
      elbow: { bend: 44 },
      wrist: { bend: 30, tilt: 15, turn: -32 },
      leg: { raise: 30, straddle: 18, turn: 12 },
      knee: { bend: 35 },
      ankle: { bend: 18, tilt: 12, turn: -16 },
    };
    let maxError = 0;
    for (const [part, values] of Object.entries(cases)) {
      poseStudio.setJoint("A", `l_${part}`, values);
      const other = poseStudio.getJoint("A", `r_${part}`);
      for (const [p, v] of Object.entries(values))
        check(
          near(other[p], part === "wrist" && p === "tilt" ? -v : v),
          `numeric mirror ${part}.${p}`,
        );
      const left = model()[`l_${part}`].quaternion,
        right = model()[`r_${part}`].quaternion;
      const reflected = new THREE.Quaternion(-left.x, -left.y, left.z, left.w);
      const e = right.angleTo(reflected);
      maxError = Math.max(maxError, e);
      check(e < 1e-6, `spatial mirror ${part}: ${e}`);
    }
    poseStudio.setJoint("A", "r_wrist", { bend: -18, tilt: 12, turn: 15 });
    const left = poseStudio.getJoint("A", "l_wrist");
    check(
      near(left.bend, -18) && near(left.tilt, -12) && near(left.turn, 15),
      "right-to-left wrist",
    );
    poseStudio.setMirrorSync(false);
    poseStudio.setJoint("A", "r_arm", { raise: 71, straddle: 35, turn: 25 });
    poseStudio.setMirrorSync(true);
    poseStudio.setJoint("A", "l_arm", { raise: 64 });
    const partial = poseStudio.getJoint("A", "r_arm");
    check(
      near(partial.raise, 64) &&
        near(partial.straddle, 35) &&
        near(partial.turn, 25),
      "single slider preserves other axes",
    );
    poseStudio.setHand("A", "l", 38);
    check(
      near(model().l_fingers.bend, model().r_fingers.bend),
      "hand curl mirror",
    );
    poseStudio.setFootLock("A", true);
    poseStudio.setJoint("A", "l_knee", { bend: 25 });
    const anchors = poseStudio.getState().figures[0].footLocks;
    model().updateMatrixWorld(true);
    for (const side of ["l", "r"])
      check(
        model()
          [`${side}_ankle`].getWorldPosition(new THREE.Vector3())
          .distanceTo(new THREE.Vector3(...anchors[side].position)) < 1e-7,
        "leg edit resets both foot anchors",
      );
    check(
      JSON.stringify(poseStudio.getState().figures[1]) === beforeB,
      "other figure untouched",
    );
    let saved = await poseStudio.getShareURL();
    poseStudio.setMirrorSync(false);
    await poseStudio.loadShareURL(saved);
    check(
      document.querySelector("#mirrorSync").checked,
      "URL restores mirror preference",
    );
    poseStudio.setMirrorSync(false);
    poseStudio.undo();
    check(
      document.querySelector("#mirrorSync").checked,
      "undo restores setting",
    );
    poseStudio.redo();
    check(
      !document.querySelector("#mirrorSync").checked,
      "redo restores setting",
    );
    const old = poseStudio.getState();
    delete old.mirrorSync;
    poseStudio.importScene(old);
    check(
      !document.querySelector("#mirrorSync").checked,
      "old scene defaults off",
    );
    const invalid = poseStudio.getState();
    invalid.mirrorSync = "true";
    let rejected = false;
    try {
      poseStudio.importScene(invalid);
    } catch {
      rejected = true;
    }
    check(rejected, "bad setting rejected");
    poseStudio.reset();
    return {
      maxReflectionError: maxError,
      pairs: Object.keys(cases),
      footAnchors: true,
      history: true,
      url: true,
    };
  });
  await page.locator("#joint").selectOption("l_arm");
  await page.locator("#mirrorSync").check();
  await page.locator("#number-raise").fill("48");
  await page.locator("#number-raise").dispatchEvent("change");
  assert.ok(
    Math.abs(
      (await page.evaluate(() => poseStudio.getJoint("A", "r_arm").raise)) - 48,
    ) < 0.001,
    "numeric input mirrors",
  );
  await page.locator("#range-straddle").fill("25");
  assert.ok(
    Math.abs(
      (await page.evaluate(() => poseStudio.getJoint("A", "r_arm").straddle)) -
        25,
    ) < 0.001,
    "slider mirrors",
  );
  // Exercise the visible rotation ring with an actual pointer drag.
  const beforeRing = await page.evaluate(() => poseStudio.getJoint("A", "l_arm"));
  await page.mouse.move(715, 281);
  await page.mouse.down();
  await page.mouse.move(758, 252, { steps: 14 });
  await page.mouse.up();
  const afterRing = await page.evaluate(() => ({
    left: poseStudio.getJoint("A", "l_arm"),
    right: poseStudio.getJoint("A", "r_arm"),
  }));
  assert.ok(Math.abs(afterRing.left.turn - beforeRing.turn) > 5, "Ring drag changes angle");
  for (const axis of ["raise", "straddle", "turn"])
    assert.ok(Math.abs(afterRing.left[axis] - afterRing.right[axis]) < 1e-6, `Ring mirrors ${axis}`);
  await page.screenshot({ path: "output/spine-review/mirror-control.png" });
  for (const lang of ["zh", "en", "ja"]) {
    await page.goto(
      (process.env.POSE_STUDIO_URL || "http://127.0.0.1:8767/studio/") +
        `?lang=${lang}`,
      { waitUntil: "domcontentloaded" },
    );
    await page.waitForFunction(() => window.poseStudio, undefined, {
      polling: 100,
      timeout: 60000,
    });
    await page.evaluate(() => poseStudio.ready);
    const label = await page
      .locator("label:has(#mirrorSync) span")
      .textContent();
    assert.notEqual(label, "mirrorSync");
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ...result,
      numericInput: true,
      slider: true,
      rotationRing: true,
      languages: 3,
    }),
  );
} finally {
  await browser.close();
}
