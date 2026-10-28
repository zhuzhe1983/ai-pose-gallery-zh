#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(
  process.env.POSE_PLAYWRIGHT_MODULE
    ? pathToFileURL(path.resolve(process.env.POSE_PLAYWRIGHT_MODULE)).href
    : "playwright"
);
const browser = await chromium.launch({ headless: true });
const base = process.env.POSE_GALLERY_URL || "http://127.0.0.1:8767/";
try {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "studio/");
  await page.waitForFunction(() => window.poseStudio);
  await page.evaluate(() => poseStudio.ready);
  const initial = await page.evaluate(() => {
    poseStudio.reset({ sex: "male" });
    poseStudio.setJoint("A", "head", { turn: 32 });
    return localStorage.getItem("pose-atlas-studio-v1");
  });
  await page.goto(base);
  await page.locator(".pose-card:not(.skeleton)").first().waitFor();
  assert.equal(await page.locator("iframe").count(), 0, "Lazy renderer");
  await page.locator("#searchInput").fill("solo_stand");
  await page.waitForFunction(() =>
    document
      .querySelector(".main-image")
      ?.getAttribute("src")
      .includes("solo_stand"),
  );
  console.log("Filtered cards ready");
  const cards = page.locator(".pose-card");
  await cards.first().hover();
  await page.waitForFunction(
    () => document.querySelector(".pose-3d-overlay.loaded:not([hidden])"),
    undefined,
    { timeout: 60000 },
  );
  console.log("First 3D preview loaded");
  assert.equal(await page.locator("iframe").count(), 1);
  await cards.nth(1).hover();
  await page.waitForFunction(() =>
    document.querySelector(".pose-3d-overlay.loaded:not([hidden])"),
  );
  assert.equal(await page.locator("iframe").count(), 1, "One shared renderer");
  assert.equal(
    await page.evaluate(() => localStorage.getItem("pose-atlas-studio-v1")),
    initial,
    "Preview cannot mutate studio autosave",
  );
  await cards.first().click();
  await page.locator("#viewer3dMode").click();
  await page.waitForFunction(() =>
    document.querySelector(".pose-3d-overlay.interactive.loaded:not([hidden])"),
  );
  assert.equal(
    await page.locator("iframe").count(),
    1,
    "Modal reuses renderer",
  );
  const previewCamera = await page
    .frames()
    .find((f) => f.url().includes("embed=preview"))
    .evaluate(() => poseStudio.getState().camera);
  assert.ok(
    previewCamera.position.every(Number.isFinite),
    "Shared preview camera survives hide/show",
  );
  await page.locator("#viewerImageMode").click();
  assert.equal(await page.locator(".pose-3d-overlay").isHidden(), true);
  for (const [width, height] of [
    [1440, 1000],
    [1024, 600],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const fits = await page.evaluate(() => {
      const a = document.getElementById("viewerImage").getBoundingClientRect(),
        b = document.getElementById("viewerStage").getBoundingClientRect();
      return (
        a.height <= b.height + 0.5 &&
        a.width <= b.width + 0.5 &&
        a.bottom <= b.bottom + 0.5
      );
    });
    assert.ok(fits, `Image fits ${width}x${height}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const [studio] = await Promise.all([
    context.waitForEvent("page"),
    page.locator("#studioPose").click(),
  ]);
  await studio.waitForLoadState("domcontentloaded");
  await studio.waitForFunction(() => window.poseStudio, undefined, {
    polling: 100,
    timeout: 60000,
  });
  await studio.evaluate(() => poseStudio.ready);
  const added = await studio.evaluate(() => poseStudio.getState());
  assert.equal(added.figures.length, 2);
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(added.figures[0], (_k, v) =>
        typeof v === "number" ? Math.round(v * 1e10) / 1e10 : v,
      ),
    ),
    JSON.parse(
      JSON.stringify(JSON.parse(initial).figures[0], (_k, v) =>
        typeof v === "number" ? Math.round(v * 1e10) / 1e10 : v,
      ),
    ),
    "Adding preserves existing figure",
  );
  assert.equal(
    await studio.evaluate(() => poseStudio.getJoint("A", "head").turn),
    32,
  );
  assert.equal(
    new URL(studio.url()).searchParams.has("appendPose"),
    false,
    "Consume append request once",
  );
  await studio.reload();
  await studio.waitForLoadState("domcontentloaded");
  await studio.waitForFunction(() => window.poseStudio, undefined, {
    polling: 100,
    timeout: 60000,
  });
  await studio.evaluate(() => poseStudio.ready);
  assert.equal(
    await studio.evaluate(() => poseStudio.getState().figures.length),
    2,
    "Reload does not append twice",
  );
  const full = await studio.evaluate(async () => {
    for (let i = 0; i < 4; i++) poseStudio.addFigure({});
    const before = poseStudio.getState();
    try {
      await poseStudio.appendPreset("solo_stand_arms-up-stretch");
      throw Error("Expected limit");
    } catch (e) {
      if (e.message !== "appendFull") throw e;
    }
    return JSON.stringify(before) === JSON.stringify(poseStudio.getState());
  });
  assert.ok(full, "Capacity rejection leaves scene intact");
  await studio.close();
  await page.locator("#viewerClose").click();
  await page.locator("#searchInput").fill("sexy_stand_s-curve-hip-out");
  await page.waitForFunction(() =>
    document
      .querySelector(".main-image")
      ?.getAttribute("src")
      .includes("sexy_stand_s-curve-hip-out"),
  );
  await page.locator(".pose-card").first().click();
  await page.locator("#viewer3dMode").click();
  await page.waitForFunction(() =>
    document.querySelector(".pose-3d-overlay:not([hidden])"),
  );
  assert.equal(
    await page.locator("#studioPose").getAttribute("aria-disabled"),
    "true",
    "Missing pose not falsely loaded",
  );
  assert.match(await page.locator(".pose-3d-status").textContent(), /待转换/);
  await fs.mkdir("output/gallery-review", { recursive: true });
  await page.screenshot({ path: "output/gallery-review/pending.png" });
  for (const lang of ["en", "ja"]) {
    await page.goto(base + "?lang=" + lang);
    await page.locator(".pose-card:not(.skeleton)").first().click();
    await page.locator("#viewer3dMode").click();
    assert.ok(
      (await page.locator("#viewer3dMode").textContent()).includes("3D"),
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      lazy: true,
      sharedRenderer: 1,
      autosave: "untouched",
      imageFits: 4,
      append: "preserves scene",
      capacity: "atomic",
      pending: "explicit",
      languages: 3,
    }),
  );
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages()) {
      console.log(
        await page
          .evaluate(() => ({
            url: location.href.split("#")[0],
            title: document.title,
            api: !!window.poseStudio,
            ready: document.body?.dataset.ready,
            fatal: document.getElementById("fatalMessage")?.textContent,
            preview: document.querySelector(".pose-3d-status")?.textContent,
          }))
          .catch(() => ({ url: page.url() })),
      );
    }
  throw error;
} finally {
  await browser.close();
}
