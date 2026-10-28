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
  writeAngles(model, key, { raise: 150, straddle: 120, turn: -65 });
  writeAngles(model, key, { turn: 35 });
  const result = readAngles(model, key);
  for (const [p, v] of Object.entries({ raise: 150, straddle: 120, turn: 35 }))
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
