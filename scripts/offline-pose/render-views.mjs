#!/usr/bin/env node
// Render extra comparison views of one draft; camera changes, pose stays shared.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const options = {
  url: "http://127.0.0.1:8767/studio/",
  width: 900,
  height: 1200,
  side: "default",
};
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  if (
    !["--scene", "--output-dir", "--views", "--url", "--side"].includes(
      args[i],
    ) ||
    !args[i + 1]
  )
    throw Error(
      "Use --scene FILE --output-dir DIR --views f,s[,d,hi,lo] [--url URL]",
    );
  options[args[i].slice(2)] = args[i + 1];
}
if (!options.scene || !options["output-dir"] || !options.views)
  throw Error("Missing scene, output-dir or views");
if (!["default", "opposite"].includes(options.side))
  throw Error("--side must be default or opposite");
const scene = JSON.parse(await fs.readFile(options.scene, "utf8"));
const stem = scene.reference?.stem;
if (!/^[a-z0-9-]+_[a-z0-9-]+_[a-z0-9-]+$/.test(stem || ""))
  throw Error("Scene must name its gallery reference");
const views = options.views.split(",");
if (
  !views.length ||
  new Set(views).size !== views.length ||
  views.some((v) => !["f", "s", "d", "hi", "lo"].includes(v))
)
  throw Error("Invalid views");
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
    timeout: 60000,
  });
  await page.evaluate(() => poseStudio.ready);
  await fs.mkdir(options["output-dir"], { recursive: true });
  const result = [];
  for (const view of views) {
    const reference = path.join("img", `${stem}_${view}.png`);
    await fs.access(reference);
    const output = await page.evaluate(
      async ({ scene, view, width, height, side }) => {
        poseStudio.importScene(scene);
        poseStudio.setCamera(view);
        const s = poseStudio.getState();
        if (view === "s" && side === "opposite")
          s.camera.position[0] = 2 * s.camera.target[0] - s.camera.position[0];
        s.reference.view = view;
        poseStudio.importScene(s);
        const image = await poseStudio.capture({ width, height });
        return { scene: poseStudio.getState(), image: image.dataUrl };
      },
      {
        scene,
        view,
        width: options.width,
        height: options.height,
        side: options.side,
      },
    );
    const base = path.join(options["output-dir"], `${stem}_${view}`);
    await fs.writeFile(
      base + ".png",
      Buffer.from(output.image.split(",")[1], "base64"),
    );
    await fs.writeFile(
      base + ".scene.json",
      JSON.stringify(output.scene, null, 2) + "\n",
    );
    result.push({
      view,
      side: view === "s" ? options.side : undefined,
      reference,
      render: base + ".png",
      scene: base + ".scene.json",
      status: "draft-needs-review",
      note: "Same draft joints; extra preset camera, not a fit to this view.",
    });
  }
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
