#!/usr/bin/env node
// Real rig regression: independent controls, native weights, feet and old scenes.
import fs from "node:fs/promises";
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
      { scene } = await import("./vendor/mannequin/scene.js");
    const { readAngles, JOINTS, jointAxes } = await import("./presets.js");
    const { figureBounds } = await import("./figure.js");
    const check = (v, m) => {
      if (!v) throw Error(m);
    };
    const model = () => scene.children.find((o) => o.body && o.pelvis);
    poseStudio.reset();
    let m = model();
    const p = (k) => m[k].getWorldPosition(new THREE.Vector3());
    m.updateMatrixWorld(true);
    const hips = p("l_leg"),
      knee = p("l_knee"),
      waist = p("waist"),
      arm = p("l_arm");
    poseStudio.setJoint("A", "chest", { bend: 25, turn: 20 });
    check(
      p("l_leg").distanceTo(hips) < 1e-8 && p("waist").distanceTo(waist) < 1e-8,
      "Chest must leave hips/waist in place",
    );
    check(p("l_arm").distanceTo(arm) > 0.03, "Chest drives shoulders");
    poseStudio.setJoint("A", "waist", { bend: 30 });
    check(
      m.waist.quaternion.angleTo(m.waist_mid.quaternion) < 1e-7,
      "Waist drives two segments",
    );
    check(p("l_knee").distanceTo(knee) < 1e-8, "Waist leaves legs in place");
    const skin = m.children.find((o) => o.userData.human),
      used = new Set();
    for (let v = 0; v < skin.geometry.attributes.skinIndex.count; v++)
      for (let c = 0; c < 4; c++)
        if (skin.geometry.attributes.skinWeight.getComponent(v, c) > 0.01)
          used.add(
            skin.userData.jointKeys[
              skin.geometry.attributes.skinIndex.getComponent(v, c)
            ],
          );
    check(
      ["waist", "waist_mid", "chest"].every((k) => used.has(k)),
      "Three distinct native spine weights",
    );
    const feet = [];
    for (const sex of ["female", "male"]) {
      poseStudio.reset({ sex });
      m = model();
      poseStudio.setJoint("A", "l_leg", { raise: 12 });
      poseStudio.setJoint("A", "r_leg", { raise: 12 });
      poseStudio.setJoint("A", "l_knee", { bend: 24 });
      poseStudio.setJoint("A", "r_knee", { bend: 24 });
      const locks = poseStudio.setFootLock("A", true);
      poseStudio.setJoint("A", "pelvis", { bend: 12, turn: 10 });
      const errors = ["l", "r"].map((s) =>
        p(s + "_ankle").distanceTo(new THREE.Vector3(...locks[s].position)),
      );
      check(Math.max(...errors) < 0.003, `${sex} foot IK: ${errors}`);
      check(
        Math.abs(poseStudio.getJoint("A", "pelvis").bend - 12) < 1e-7,
        "Pelvis remains independently rotated",
      );
      for (const k of JOINTS)
        for (const a of jointAxes(k)) {
          const v = readAngles(m, k)[a.property];
          check(v >= a.min - 1e-7 && v <= a.max + 1e-7, "IK obeys limits");
        }
      const shared = await poseStudio.getShareURL();
      await poseStudio.loadShareURL(shared);
      m = model();
      check(poseStudio.getState().figures[0].footLocks, "URL keeps anchors");
      check(
        Math.abs(poseStudio.getJoint("A", "pelvis").bend - 12) < 0.002,
        "URL keeps pelvis",
      );
      poseStudio.setJoint("A", "pelvis", { bend: 30, tilt: 20, turn: 45 });
      check(
        Number.isFinite(m.userData.footError),
        "Unreachable solver stays finite",
      );
      feet.push({ sex, errors, extremeError: m.userData.footError });
    }
    poseStudio.reset();
    m = model();
    poseStudio.setJoint("A", "torso", { bend: 20, turn: 30 });
    check(
      Math.abs(poseStudio.getJoint("A", "torso").bend - 20) < 1e-7,
      "Legacy torso API",
    );
    let old = poseStudio.getState();
    old.schema = "pose-atlas/studio@2";
    old.joint = "torso";
    for (const f of old.figures) {
      f.mesh = "makehuman-v2";
      f.joints.torso = new THREE.Quaternion()
        .setFromEuler(new THREE.Euler(0, 0.3, -0.2, "YXZ"))
        .toArray();
      delete f.joints.waist;
      delete f.joints.waist_mid;
      delete f.joints.chest;
      delete f.footLocks;
    }
    for (const version of [1, 2]) {
      old.schema = `pose-atlas/studio@${version}`;
      poseStudio.importScene(old);
      check(
        poseStudio.getState().schema === "pose-atlas/studio@3",
        "Migrate scene",
      );
    }
    m = model();
    check(
      Math.abs(figureBounds(m).min.y + 0.697) < 0.002,
      "Migrated scene ground",
    );
    check(!document.getElementById("onlyPresets"), "Removed filter");
    for (let i = 1; i < 6; i++)
      poseStudio.addFigure({ sex: i % 2 ? "male" : "female" });
    const six = await poseStudio.getShareURL();
    await poseStudio.loadShareURL(six);
    check(
      poseStudio.getState().figures.length === 6,
      "Six new spine rigs round trip",
    );
    poseStudio.reset();
    await poseStudio.loadPreset("solo_stand_arms-up-stretch");
    const image = await poseStudio.capture({ width: 800, height: 1100 });
    return {
      feet,
      weights: [...used].filter((k) =>
        ["waist", "waist_mid", "chest"].includes(k),
      ),
      legacy: true,
      scene: 3,
      image: image.dataUrl,
    };
  });
  if (errors.length) throw Error(errors.join("\n"));
  await fs.mkdir("output/spine-review", { recursive: true });
  await fs.writeFile(
    "output/spine-review/arms-up.png",
    Buffer.from(result.image.split(",")[1], "base64"),
  );
  delete result.image;
  await fs.writeFile(
    "output/spine-review/checks.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
