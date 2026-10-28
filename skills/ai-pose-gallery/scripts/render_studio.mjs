#!/usr/bin/env node
// Render a pose reference with the public studio. No image-generation API or key is used.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const args = process.argv.slice(2),
  options = { url: "https://zhuzhe1983.github.io/ai-pose-gallery-zh/studio/" };
for (let i = 0; i < args.length; i += 2) {
  const key = args[i];
  if (
    ![
      "--job",
      "--output",
      "--scene-out",
      "--preview",
      "--url",
      "--share-out",
      "--image",
      "--detection-out",
    ].includes(key) ||
    !args[i + 1]
  )
    throw Error(
      "Usage: render_studio.mjs --job job.json --output pose.png [--image local-photo.jpg] [--detection-out landmarks.json] [--scene-out scene.json] [--preview studio.png] [--share-out scene.url.txt] [--url URL]",
    );
  options[key.slice(2)] = args[i + 1];
}
if (!options.job || !options.output)
  throw Error("--job and --output are required");
const job = JSON.parse(await fs.readFile(options.job, "utf8"));
let inputPhoto = null;
if (options.image) {
  const type = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
  }[path.extname(options.image).toLowerCase()];
  const bytes = await fs.readFile(options.image);
  if (!type || bytes.length > 25 * 1024 * 1024)
    throw Error("Use a supported image no larger than 25 MB");
  inputPhoto = { type, base64: bytes.toString("base64") };
}
if (
  !Array.isArray(job.figures) ||
  job.figures.length < 1 ||
  job.figures.length > 6
)
  throw Error("job.figures must contain one to six figures");
let chromium;
try {
  ({ chromium } = await import(
    process.env.POSE_PLAYWRIGHT_MODULE
      ? pathToFileURL(path.resolve(process.env.POSE_PLAYWRIGHT_MODULE)).href
      : "playwright"
  ));
} catch {
  throw Error(
    "Install Playwright in this environment, or set POSE_PLAYWRIGHT_MODULE to its absolute index.mjs path. See references/studio.md.",
  );
}
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(options.url, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForFunction(() => window.poseStudio, undefined, {
    polling: 100,
    timeout: 60000,
  });
  await page.evaluate(() => poseStudio.ready);
  const result = await page.evaluate(
    async ({ job, inputPhoto }) => {
      const api = window.poseStudio;
      api.reset({ sex: job.figures[0].sex || "female" });
      for (let i = 1; i < job.figures.length; i++)
        api.addFigure({ sex: job.figures[i].sex || "female" });
      let photoResult = null;
      if (inputPhoto || job.imageUrl) {
        const source = inputPhoto
          ? new Blob(
              [
                Uint8Array.from(atob(inputPhoto.base64), (c) =>
                  c.charCodeAt(0),
                ),
              ],
              { type: inputPhoto.type },
            )
          : job.imageUrl;
        photoResult = await api.poseFromImage(source, {
          sex: job.figures[0].sex || "female",
        });
      }
      if (job.preset) await api.loadPreset(job.preset);
      for (let i = 0; i < job.figures.length; i++) {
        const f = job.figures[i],
          id = "ABCDEF"[i];
        if (f.preset) await api.loadPreset(f.preset, { actorId: id });
        for (const [part, angles] of Object.entries(f.joints || {}))
          api.setJoint(id, part, angles);
        for (const [side, curl] of Object.entries(f.hands || {}))
          api.setHand(id, side, curl);
        const changes = {};
        for (const key of [
          "sex",
          "height",
          "scale",
          "position",
          "yaw",
          "ground",
          "outfit",
        ])
          if (f[key] !== undefined) changes[key] = f[key];
        api.setFigure(id, changes);
      }
      api.setCamera(job.camera || (photoResult ? "f" : "d"));
      if (job.cameraPosition) {
        const state = api.exportScene();
        state.camera = job.cameraPosition;
        api.importScene(state);
      }
      const image = await api.capture({
        width: job.width || 1600,
        height: job.height || 1600,
      });
      return {
        image,
        scene: api.exportScene(),
        backend: document.getElementById("backend").dataset.backend,
        shareUrl: await api.getShareURL(),
        photoResult,
      };
    },
    { job, inputPhoto },
  );
  for (const destination of [
    options.output,
    options["scene-out"],
    options.preview,
    options["share-out"],
    options["detection-out"],
  ].filter(Boolean))
    await fs.mkdir(path.dirname(path.resolve(destination)), {
      recursive: true,
    });
  await fs.writeFile(
    options.output,
    Buffer.from(result.image.dataUrl.split(",")[1], "base64"),
  );
  if (options["scene-out"])
    await fs.writeFile(
      options["scene-out"],
      JSON.stringify(result.scene, null, 2) + "\n",
    );
  if (options["share-out"])
    await fs.writeFile(options["share-out"], result.shareUrl + "\n");
  if (options["detection-out"] && result.photoResult)
    await fs.writeFile(
      options["detection-out"],
      JSON.stringify(result.photoResult, null, 2) + "\n",
    );
  if (options.preview)
    await page.screenshot({ path: options.preview, fullPage: true });
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    JSON.stringify(
      {
        output: path.resolve(options.output),
        width: result.image.width,
        height: result.image.height,
        backend: result.backend,
        figures: result.scene.figures.length,
        detected: result.photoResult?.detection.people.length ?? null,
        share: options["share-out"] ? path.resolve(options["share-out"]) : null,
        scene: options["scene-out"] ? path.resolve(options["scene-out"]) : null,
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (errors.length) throw new Error(errors.join("\n"), { cause: error });
  throw error;
} finally {
  await browser.close();
}
