#!/usr/bin/env node
// Original POSE Atlas tooling: export the editor's actual FK rig for offline fitting.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const args = process.argv.slice(2),
  options = {
    url: "http://127.0.0.1:8767/studio/",
    output: "output/offline-pose/rig.json",
    sex: "female",
  };
for (let i = 0; i < args.length; i += 2) {
  if (!["--url", "--output", "--sex"].includes(args[i]) || !args[i + 1])
    throw Error("Use --url URL --output rig.json --sex female|male");
  options[args[i].slice(2)] = args[i + 1];
}
const { chromium } = await import(
  process.env.POSE_PLAYWRIGHT_MODULE
    ? pathToFileURL(path.resolve(process.env.POSE_PLAYWRIGHT_MODULE)).href
    : "playwright"
);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto(options.url);
  await page.waitForFunction(() => window.poseStudio, undefined, {
    polling: 100,
  });
  await page.evaluate(() => poseStudio.ready);
  const rig = await page.evaluate(async (sex) => {
    const THREE = await import("three"),
      { scene } = await import("./vendor/mannequin/scene.js");
    const { bones } = await import("./figure.js");
    const { JOINTS, NEUTRAL, PRESETS, readAngles, writeAngles, jointAxes } =
      await import("./presets.js");
    poseStudio.reset({ sex });
    poseStudio.setFigure("A", { position: [0, 0, 0] });
    const model = scene.children.find((o) => o.body && o.pelvis),
      all = bones(model);
    if (!model.userData.human)
      throw Error("Human mesh is required; fallback cannot export this rig");
    const needed = new Set([model]);
    for (const key of [
      "body",
      "pelvis",
      "torso",
      "neck",
      "head",
      ...["l", "r"].flatMap((s) =>
        ["arm", "elbow", "wrist", "leg", "knee", "ankle"].map(
          (k) => `${s}_${k}`,
        ),
      ),
    ]) {
      let o = all[key];
      while (o && o !== model) {
        needed.add(o);
        o = o.parent;
      }
    }
    const objects = [];
    model.traverse((o) => {
      if (needed.has(o)) objects.push(o);
    });
    const nodes = objects.map((o) => ({
      name:
        Object.entries(all).find(([, v]) => v === o)?.[0] || o.name || "root",
      parent: objects.indexOf(o.parent),
      position: o.position.toArray(),
      quaternion: o.quaternion.toArray(),
      scale: o.scale.toArray(),
    }));
    const controls = [];
    for (const key of JOINTS) {
      if (key.endsWith("wrist")) continue;
      const values = readAngles(model, key),
        joint = all[key];
      for (const axis of jointAxes(key)) {
        const original = values[axis.property],
          a = joint.rotation.toArray().slice(0, 3);
        const increment = original < axis.max ? 1 : -1;
        writeAngles(model, key, { [axis.property]: original + increment });
        const b = joint.rotation.toArray().slice(0, 3),
          component = b.findIndex((v, i) => Math.abs(v - a[i]) > 1e-8);
        const factor = (b[component] - a[component]) / increment;
        writeAngles(model, key, { [axis.property]: original });
        const drivers = [
          {
            node: objects.indexOf(joint),
            component,
            factor,
            order: joint.rotation.order,
          },
        ];
        if (key === "head")
          drivers.push({
            node: objects.indexOf(model.neck),
            component,
            factor,
            order: joint.rotation.order,
          });
        controls.push({
          key,
          property: axis.property,
          min: axis.min,
          max: axis.max,
          value: original,
          drivers,
        });
      }
    }
    for (const key of JOINTS) readAngles(model, key);
    model.neck.rotation.reorder(model.head.rotation.order);
    // Euler baselines are taken after assigning the same fixed orders as the controls.
    objects.forEach((o, i) => {
      nodes[i].euler = o.rotation.toArray().slice(0, 3);
      nodes[i].order = o.rotation.order;
    });
    model.updateMatrixWorld(true);
    const marker = (name, key, offset = [0, 0, 0]) => ({
      name,
      terms: [{ node: objects.indexOf(all[key]), weight: 1, offset }],
    });
    const skin = model.children.find((o) => o.userData.human),
      headBox = new THREE.Box3();
    const p = new THREE.Vector3();
    for (let i = 0; i < skin.geometry.attributes.position.count; i++) {
      let weight = 0;
      for (let c = 0; c < 4; c++)
        if (
          skin.userData.jointKeys[
            skin.geometry.attributes.skinIndex.getComponent(i, c)
          ] === "head"
        )
          weight += skin.geometry.attributes.skinWeight.getComponent(i, c);
      if (weight > 0.6)
        headBox.expandByPoint(
          skin.getVertexPosition(i, p).applyMatrix4(skin.matrixWorld),
        );
    }
    const headOffset = model.head
      .worldToLocal(headBox.getCenter(new THREE.Vector3()))
      .toArray();
    const toeOffset = (side) => {
      const ankle = all[side + "_ankle"],
        p = ankle.getWorldPosition(new THREE.Vector3());
      p.add(new THREE.Vector3(0, -0.04, 0.14));
      return ankle.worldToLocal(p).toArray();
    };
    const points = [
      marker("head", "head", headOffset),
      marker("neck", "neck"),
      marker("right_shoulder", "r_arm"),
      marker("right_elbow", "r_elbow"),
      marker("right_wrist", "r_wrist"),
      marker("left_shoulder", "l_arm"),
      marker("left_elbow", "l_elbow"),
      marker("left_wrist", "l_wrist"),
      {
        name: "spine",
        terms: [
          {
            node: objects.indexOf(model.neck),
            weight: 0.42,
            offset: [0, 0, 0],
          },
          {
            node: objects.indexOf(model.pelvis),
            weight: 0.58,
            offset: [0, 0, 0],
          },
        ],
      },
      marker("pelvis", "pelvis"),
      marker("right_hip", "r_leg"),
      marker("right_knee", "r_knee"),
      marker("right_ankle", "r_ankle"),
      marker("left_hip", "l_leg"),
      marker("left_knee", "l_knee"),
      marker("left_ankle", "l_ankle"),
      marker("left_toe", "l_ankle", toeOffset("l")),
      marker("right_toe", "r_ankle", toeOffset("r")),
    ];
    const worldPoints = points.map((point) =>
      point.terms
        .reduce(
          (p, t) =>
            p.add(
              objects[t.node]
                .localToWorld(new THREE.Vector3(...t.offset))
                .multiplyScalar(t.weight),
            ),
          new THREE.Vector3(),
        )
        .toArray(),
    );
    const template = poseStudio.getState();
    template.floorLock = false;
    template.reference = null;
    return {
      schema: "pose-atlas/fitting-rig@1",
      mesh: model.userData.mesh,
      sex,
      nodes,
      controls,
      points,
      worldPoints,
      template,
      presets: Object.fromEntries(
        Object.entries(PRESETS)
          .filter(([, p]) => p.actors.length === 1)
          .map(([name, p]) => [name, p.actors[0].values]),
      ),
      notes: [
        "Head uses skinned head bounds center; spine is a torso interpolation; toes use approximate markers.",
        "Single-view solutions are ambiguous and require manual review.",
      ],
    };
  }, options.sex);
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, JSON.stringify(rig, null, 2) + "\n");
  console.log(
    JSON.stringify({
      output: options.output,
      nodes: rig.nodes.length,
      points: rig.points.length,
      controls: rig.controls.length,
      mesh: rig.mesh,
    }),
  );
} finally {
  await browser.close();
}
