#!/usr/bin/env node
// Optional browser integration check. Needs a local static server and Playwright.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(
  process.env.POSE_PLAYWRIGHT_MODULE
    ? pathToFileURL(path.resolve(process.env.POSE_PLAYWRIGHT_MODULE)).href
    : "playwright"
);
const browser = await chromium.launch({
  headless: true,
  args: process.argv.includes("--webgpu") ? ["--enable-unsafe-webgpu"] : [],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
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
    const { figureBounds } = await import("./figure.js"),
      { attachDualQuaternionSkinning } = await import("./dual-quaternion.js");
    const check = (ok, why) => {
      if (!ok) throw Error(why);
    };
    // Opposed rotations must keep radius; antipodal quaternions must not cancel.
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([1, 0, 0], 3),
    );
    geom.setAttribute("normal", new THREE.Float32BufferAttribute([1, 0, 0], 3));
    geom.setAttribute(
      "skinIndex",
      new THREE.Uint16BufferAttribute([0, 1, 0, 0], 4),
    );
    geom.setAttribute(
      "skinWeight",
      new THREE.Float32BufferAttribute([0.5, 0.5, 0, 0], 4),
    );
    const root = new THREE.Group(),
      bones = [new THREE.Bone(), new THREE.Bone()];
    root.add(...bones);
    const material = new THREE.MeshPhysicalNodeMaterial(),
      skin = new THREE.SkinnedMesh(geom, material);
    root.add(skin);
    root.updateMatrixWorld(true);
    skin.bind(new THREE.Skeleton(bones));
    attachDualQuaternionSkinning(skin);
    for (const degrees of [90, 179]) {
      bones[0].rotation.z = (degrees * Math.PI) / 180;
      bones[1].rotation.z = (-degrees * Math.PI) / 180;
      root.updateMatrixWorld(true);
      skin.userData.updateSkinning();
      const p = skin.getVertexPosition(0, new THREE.Vector3());
      check(Math.abs(p.length() - 1) < 1e-5, "DQ preserves rotation radius");
      check(
        degrees === 90 ? p.x > 0.999 : p.x < -0.999,
        "Quaternion hemisphere handling",
      );
    }
    bones[0].position.set(2, 3, 4);
    bones[1].position.copy(bones[0].position);
    bones.forEach((b) => b.rotation.set(0, 0, Math.PI / 2));
    root.scale.setScalar(1.2);
    root.position.set(8, 1, -3);
    root.updateMatrixWorld(true);
    skin.userData.updateSkinning();
    check(
      skin
        .getVertexPosition(0, new THREE.Vector3())
        .distanceTo(new THREE.Vector3(2, 4, 4)) < 1e-5,
      "Rigid translation / model scale",
    );
    skin.skeleton.dispose();
    geom.dispose();
    material.dispose();
    poseStudio.reset();
    for (let i = 1; i < 6; i++)
      poseStudio.addFigure({
        sex: i % 2 ? "male" : "female",
        scale: i === 5 ? 1.2 : 1,
      });
    const models = scene.children.filter((o) => o.body && o.pelvis),
      skins = models.map((m) => m.children.find((o) => o.userData.human));
    check(
      skins.length === 6 &&
        skins.every((s) => s.userData.skinning === "dual-quaternion"),
      "Six DQ humans",
    );
    check(new Set(skins.map((s) => s.geometry)).size === 2, "Shared geometry");
    check(
      new Set(skins.map((s) => s.skeleton)).size === 6,
      "Independent skeletons",
    );
    for (const id of "ABCDEF") {
      poseStudio.setJoint(id, "l_arm", { raise: 175, straddle: 10, turn: -55 });
      poseStudio.setJoint(id, "r_arm", { raise: 170, straddle: 10 });
      poseStudio.setJoint(id, "l_leg", { straddle: 70, turn: 35 });
      poseStudio.setJoint(id, "r_leg", { straddle: 70, turn: 35 });
      poseStudio.setJoint(id, "l_knee", { bend: 90 });
    }
    for (const model of models) {
      const box = figureBounds(model);
      check(Math.abs(box.min.y + 0.697) < 0.002, "Skin ground");
      check(
        box
          .getSize(new THREE.Vector3())
          .toArray()
          .every((x) => Number.isFinite(x) && x > 0 && x < 4),
        "Finite bounds",
      );
    }
    const target = models[0].l_elbow.getWorldPosition(new THREE.Vector3());
    check(
      new THREE.Raycaster(
        target.clone().add(new THREE.Vector3(0, 0, 2)),
        new THREE.Vector3(0, 0, -1),
      ).intersectObject(skins[0]).length > 0,
      "Posed raycast",
    );
    poseStudio.removeFigure("C");
    poseStudio.undo();
    check(poseStudio.getState().figures.length === 6, "Delete undo");
    const old = poseStudio.getState();
    old.figures.forEach((f) => {
      f.mesh = "makehuman-v1";
      f.position[1] = 1;
    });
    poseStudio.importScene(old);
    for (const model of scene.children.filter((o) => o.body && o.pelvis))
      check(
        Math.abs(figureBounds(model).min.y + 0.697) < 0.002,
        "Legacy v1 ground",
      );
    poseStudio.reset();
    await poseStudio.loadPreset("upper_cute_heart-over-hd");
    const actor = scene.children.find((o) => o.body && o.pelvis);
    const head = actor.head.getWorldPosition(new THREE.Vector3());
    for (const s of ["l", "r"])
      check(
        actor[s + "_wrist"].getWorldPosition(new THREE.Vector3()).y >
          head.y + 0.15,
        "Hands above head",
      );
    check(
      !document.getElementById("detectReference") &&
        document.getElementById("uploadPose"),
      "Photo-only recognition UI",
    );
    const image = await poseStudio.capture({ width: 900, height: 1200 });
    return {
      backend: document.getElementById("backend").dataset.backend,
      meshes: 6,
      sharedGeometries: 2,
      dqMath: true,
      ground: true,
      raycast: true,
      legacy: true,
      heart: true,
      image: image.dataUrl,
    };
  });
  if (errors.length) throw Error(errors.join("\n"));
  await fs.mkdir("output/human-review", { recursive: true });
  const image = result.image;
  delete result.image;
  await fs.writeFile(
    `output/human-review/${result.backend}.png`,
    Buffer.from(image.split(",")[1], "base64"),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
