#!/usr/bin/env node
// Ground an offline solo draft using the actual posed skin, preserving projection.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const args = process.argv.slice(2),
  options = { url: "http://127.0.0.1:8767/studio/" };
for (let i = 0; i < args.length; i += 2) {
  if (!["--url", "--input", "--output"].includes(args[i]) || !args[i + 1])
    throw Error(
      "Use --input draft.scene.json --output grounded.scene.json [--url URL]",
    );
  options[args[i].slice(2)] = args[i + 1];
}
if (!options.input || !options.output)
  throw Error("--input and --output required");
const scene = JSON.parse(await fs.readFile(options.input, "utf8"));
if (scene.figures?.length !== 1) throw Error("This fitter supports one figure");
const { chromium } = await import(
  process.env.POSE_PLAYWRIGHT_MODULE
    ? pathToFileURL(path.resolve(process.env.POSE_PLAYWRIGHT_MODULE)).href
    : "playwright"
);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(options.url);
  await page.waitForFunction(() => window.poseStudio, undefined, {
    polling: 100,
  });
  await page.evaluate(() => poseStudio.ready);
  const result = await page.evaluate((scene) => {
    poseStudio.importScene(scene);
    const before = poseStudio.getState();
    if (before.figures[0].mesh !== scene.figures[0].mesh)
      throw Error("Rig revision mismatch / fallback mesh");
    const id = before.figures[0].id;
    poseStudio.setFigure(id, { ground: true });
    const grounded = poseStudio.getState(),
      dy = grounded.figures[0].position[1] - before.figures[0].position[1];
    grounded.camera.position[1] += dy;
    grounded.camera.target[1] += dy;
    grounded.floorLock = true;
    poseStudio.importScene(grounded);
    return { scene: poseStudio.getState(), verticalTranslation: dy };
  }, scene);
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(
    options.output,
    JSON.stringify(result.scene, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      output: options.output,
      verticalTranslation: result.verticalTranslation,
      status: "draft-needs-review",
    }),
  );
} finally {
  await browser.close();
}
