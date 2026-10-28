import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import * as THREE from "three";
import {
  PRESETS,
  JOINTS,
  NEUTRAL,
  jointAxes,
  applyValues,
  readAngles,
  writeAngles,
  constrainJoint,
} from "../studio/presets.js";
import { locales, translate } from "../studio/i18n.js";
const model = Object.fromEntries(
  [...JOINTS, "neck", "waist_mid"].map((k) => [k, new THREE.Object3D()]),
);
for (const [id, preset] of Object.entries(PRESETS)) {
  assert.ok(fs.existsSync(`img/${id}_${preset.view}.png`), id);
  assert.ok(preset.actors.length >= 1 && preset.actors.length <= 2);
  for (const actor of preset.actors) {
    for (const [path, v] of Object.entries(actor.values)) {
      const [key, p] = path.split("."),
        axis = jointAxes(key).find((a) => a.property === p);
      assert.ok(axis && v >= axis.min && v <= axis.max, `${id}: ${path}=${v}`);
    }
    applyValues(model, NEUTRAL);
    applyValues(model, actor.values);
    for (const key of JOINTS)
      assert.ok(model[key].quaternion.toArray().every(Number.isFinite));
  }
}
// Shoulder controls must preserve independent slider values, including overhead poses.
for (const side of ["l", "r"]) {
  const key = side + "_arm";
  writeAngles(model, key, { raise: 150, straddle: 70, turn: -65 });
  writeAngles(model, key, { turn: 35 });
  const result = readAngles(model, key);
  for (const [p, v] of Object.entries({ raise: 150, straddle: 70, turn: 35 }))
    assert.ok(Math.abs(result[p] - v) < 1e-8, `${key}.${p}`);
}
const html = fs.readFileSync("studio/index.html", "utf8"),
  app = fs.readFileSync("studio/app.js", "utf8");
for (const file of [
  "pose-worker.js",
  "pose-detection.js",
  "pose-retarget.js",
  "pose-photo-ui.js",
  "suit.js",
  "figure.js",
  "human.js",
  "dual-quaternion.js",
  "spine.js",
  "foot-ik.js",
  "mirror.js",
  "drag-ik.js",
  "pelvis-stabilize.js",
])
  execFileSync(process.execPath, ["--check", "studio/" + file]);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
assert.equal(new Set(ids).size, ids.length, "Duplicate HTML IDs");
const keys = [...html.matchAll(/data-(?:t|aria|placeholder)="([^"]+)"/g)].map(
  (m) => m[1],
);
keys.push(
  ...[...app.matchAll(/\bt\(["']([^"']+)["']\)/g)].map((m) => m[1]),
  ...JOINTS,
);
for (const file of [
  "pose-photo-ui.js",
  "pose-detection.js",
  "pose-retarget.js",
  "pose-worker.js",
]) {
  const source = fs.readFileSync("studio/" + file, "utf8");
  keys.push(
    ...[
      ...source.matchAll(
        /(?:status|Error)\("(pose[A-Z][^"]*|photo[A-Z][^"]*|modelLoading|detectingPose|fittingPose)"/g,
      ),
    ].map((m) => m[1]),
  );
}
for (const lang of locales)
  for (const key of keys)
    assert.notEqual(translate(key, lang), key, `${lang}: ${key}`);
console.log(
  `Studio: ${Object.keys(PRESETS).length} presets, stable joint controls, and ${new Set(keys).size} UI keys × 3 languages verified.`,
);

// Simulate unrestricted gizmo rotations. Every supported joint must clamp to its limits.
for (const key of JOINTS) {
  model[key].rotation.set(2.8, -2.7, 2.9, "XYZ");
  constrainJoint(model, key);
  const actual = readAngles(model, key);
  for (const a of jointAxes(key))
    assert.ok(
      actual[a.property] >= a.min - 1e-7 && actual[a.property] <= a.max + 1e-7,
      `${key}.${a.property} exceeded limit`,
    );
  if (key.endsWith("_elbow") || key.endsWith("_knee")) {
    assert.equal(model[key].rotation.x, 0);
    assert.equal(model[key].rotation.y, 0);
  }
}
const { encodeScene, decodeScene } = await import("../studio/scene-url.js");
const sample = {
  schema: "pose-atlas/studio@2",
  figures: Array.from({ length: 6 }, (_, i) => ({
    id: "ABCDEF"[i],
    scale: i % 2 ? 1.2 : 0.8,
    position: [i * 0.7, 0, 0],
    joints: { head: [0, 0, 0, 1] },
  })),
  camera: { position: [2, 2, 5], target: [0, 0, 0] },
};
assert.deepEqual(
  await decodeScene(await encodeScene(sample)),
  JSON.parse(
    JSON.stringify(sample, (_k, v) =>
      typeof v === "number" ? Math.round(v * 100000) / 100000 : v,
    ),
  ),
);
for (const invalid of ["bad", "2.not-gzip", "2." + "a".repeat(90000)])
  await assert.rejects(() => decodeScene(invalid));
console.log(
  "All joint limits and six-figure URL round-trip / malformed URL rejection verified.",
);

const { validateDetection, usablePerson } =
  await import("../studio/pose-retarget.js");
const points = Array.from({ length: 33 }, (_, i) => ({
  x: 0.2 + i * 0.01,
  y: 0.4,
  z: 0,
  visibility: 0.9,
  presence: 0.95,
}));
const detection = {
  width: 1000,
  height: 667,
  people: [{ landmarks: points, worldLandmarks: structuredClone(points) }],
};
assert.equal(validateDetection(detection), detection);
assert.ok(usablePerson(detection.people[0]));
for (const mutate of [
  (d) => (d.people[0].landmarks[0].x = NaN),
  (d) => d.people[0].worldLandmarks.pop(),
  (d) => (d.people[0].landmarks[11].visibility = Infinity),
  (d) => (d.people = Array.from({ length: 7 }, () => d.people[0])),
]) {
  const bad = structuredClone(detection);
  mutate(bad);
  assert.throws(() => validateDetection(bad));
}
const hidden = structuredClone(detection.people[0]);
for (const i of [11, 12, 23, 24]) hidden.landmarks[i].visibility = 0;
assert.equal(usablePerson(hidden), false);
console.log(
  "Photo result validation rejects malformed, nonfinite, oversized and unreliable inputs.",
);
