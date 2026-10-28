// Reproduce the checked-in browser dependencies with `npm ci && npm run vendor:studio`.
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendor = path.join(root, "studio/vendor");
await mkdir(vendor, { recursive: true });
for (const name of ["three.webgpu.js", "three.core.js"]) {
  await mkdir(path.join(vendor, "three"), { recursive: true });
  await cp(
    path.join(root, "node_modules/three/build", name),
    path.join(vendor, "three", name),
  );
}
for (const file of [
  "controls/OrbitControls.js",
  "controls/TransformControls.js",
  "geometries/ParametricGeometry.js",
  "geometries/TextGeometry.js",
  "loaders/FontLoader.js",
  "utils/BufferGeometryUtils.js",
]) {
  const destination = path.join(vendor, "three/addons", file);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(
    path.join(root, "node_modules/three/examples/jsm", file),
    destination,
  );
}
await cp(
  path.join(root, "node_modules/three/LICENSE"),
  path.join(vendor, "three/LICENSE"),
);
for (const name of ["bodies", "organs", "shapes", "globals.js", "font.js"]) {
  await cp(
    path.join(root, "node_modules/mannequin-js/src", name),
    path.join(vendor, "mannequin", name),
    { recursive: true },
  );
}
// Modified from mannequin-js 5.2.3: a scene-only shim prevents automatic WebGL
// renderer creation, global DOM changes, and a second animation loop.
await writeFile(
  path.join(vendor, "mannequin/scene.js"),
  `// SPDX-License-Identifier: GPL-3.0-only
// POSE Atlas modification, 2026-10-28. Scene-only replacement for mannequin-js
// 5.2.3 scene.js; the studio owns its WebGPU renderer, controls and DOM.
import { Scene } from 'three';
export const scene = new Scene();
`,
);
const license = await readFile(
  path.join(root, "node_modules/mannequin-js/LICENSE"),
);
await writeFile(path.join(vendor, "mannequin/LICENSE"), license);
await writeFile(path.join(root, "studio/LICENSE"), license);
console.log(
  "Vendored Three.js 0.186.1 (MIT) and mannequin-js 5.2.3 (GPL-3.0).",
);
