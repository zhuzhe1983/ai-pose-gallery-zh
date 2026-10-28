import assert from "node:assert/strict";
import fs from "node:fs";
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
  [...JOINTS, "neck"].map((k) => [k, new THREE.Object3D()]),
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
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
assert.equal(new Set(ids).size, ids.length, "Duplicate HTML IDs");
const keys = [...html.matchAll(/data-(?:t|aria|placeholder)="([^"]+)"/g)].map(
  (m) => m[1],
);
keys.push(
  ...[...app.matchAll(/\bt\(["']([^"']+)["']\)/g)].map((m) => m[1]),
  ...JOINTS,
);
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
