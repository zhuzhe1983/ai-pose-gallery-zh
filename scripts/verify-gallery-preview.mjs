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
  const toggle = page.getByRole('switch');
  assert.equal(await toggle.isChecked(), false, 'Experimental 3D defaults off');
  assert.equal(await page.locator('#studioNav').isVisible(), false);
  await page.locator('.pose-card').first().hover();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.pose-3d-overlay').count(), 0, 'Off does not load the preview module');
  assert.equal(await page.locator("iframe").count(), 0, "Lazy renderer");
  await page.locator('.pose-card').first().click();
  assert.equal(await page.locator('#viewer3dMode').isVisible(), false);
  assert.equal(await page.locator('#studioPose').isVisible(), false);
  assert.equal(await page.locator('#viewerImage').isVisible(), true);
  await page.locator('#viewerClose').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await fs.mkdir('output/gallery-review', {recursive: true});
  await page.screenshot({path:'output/gallery-review/experimental-off.png'});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await toggle.isVisible(), true);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Header fits mobile');
  await page.screenshot({path:'output/gallery-review/experimental-mobile.png'});
  await page.setViewportSize({width:1440,height:1000});
  await toggle.check();
  await page.reload();
  await page.locator('.pose-card:not(.skeleton)').first().waitFor();
  await page.waitForFunction(() => document.querySelector('.pose-3d-overlay'));
  assert.equal(await toggle.isChecked(), true, 'Opt-in persists after reload');
  assert.equal(await page.locator('#studioNav').isVisible(), true);
  await page.screenshot({path:'output/gallery-review/experimental-on.png'});
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
  const previewFrame = page.frames().find((f) => f.url().includes("embed=preview"));
  const figuresBeforeView = await previewFrame.evaluate(() => poseStudio.getState().figures);
  const cameraBeforeView = await previewFrame.evaluate(() => poseStudio.getState().camera);
  await cards.first().locator('.angle-thumb').nth(1).hover();
  await page.waitForFunction(() => document.querySelector('.pose-3d-overlay.loaded:not([hidden])'));
  await previewFrame.waitForFunction((before) => JSON.stringify(poseStudio.getState().camera) !== before, JSON.stringify(cameraBeforeView));
  assert.deepEqual(await previewFrame.evaluate(() => poseStudio.getState().figures), figuresBeforeView,
    'Changing the reference angle changes only the camera, never the figure');
  await page.evaluate(() => {
    const target = document.querySelector('.pose-card .card-image').getBoundingClientRect();
    const filters = document.querySelector('.controls').getBoundingClientRect();
    window.scrollBy(0, target.top - filters.height + 80);
  });
  // Keep the pointer on the exposed part of the first tile after scrolling;
  // leaving it on a thumbnail can legitimately activate the next row instead.
  const hoverPoint = await page.evaluate(() => {
    const target = document.querySelector('.pose-card .card-image').getBoundingClientRect();
    const bottom = document.querySelector('.controls').getBoundingClientRect().bottom;
    return { x: target.x + target.width / 2, y: Math.max(bottom + 20, target.y + 20) };
  });
  await page.mouse.move(hoverPoint.x, hoverPoint.y);
  await page.waitForFunction(() => {
    const overlay = document.querySelector('.pose-3d-overlay');
    return !overlay.hidden && parseFloat(getComputedStyle(overlay).clipPath.slice(6)) > 0;
  });
  const clipping = await page.evaluate(() => {
    const overlay = document.querySelector('.pose-3d-overlay');
    const filters = document.querySelector('.controls');
    const top = overlay.getBoundingClientRect().top;
    const cut = parseFloat(getComputedStyle(overlay).clipPath.slice(6));
    return { visibleTop: top + cut, filterBottom: filters.getBoundingClientRect().bottom,
      layer: Number(getComputedStyle(overlay).zIndex), filterLayer: Number(getComputedStyle(filters).zIndex) };
  });
  assert.ok(clipping.visibleTop >= clipping.filterBottom - 1, 'Preview clips below sticky filters');
  assert.ok(clipping.layer < clipping.filterLayer, 'Sticky filters remain above preview');
  await fs.mkdir('output/gallery-review', { recursive: true });
  await page.screenshot({ path: 'output/gallery-review/hover-clipped.png' });
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
  const settings = await context.newPage();
  await settings.goto(base);
  await settings.locator('.pose-card:not(.skeleton)').first().waitFor();
  await settings.getByRole('switch').uncheck();
  await page.waitForFunction(() => document.querySelector('.pose-3d-overlay').hidden);
  assert.equal(await page.locator('#viewerImage').isVisible(), true, 'Disable restores an open viewer to its image');
  assert.equal(await page.locator('#viewer3dMode').isVisible(), false);
  assert.equal(await page.locator('#studioPose').isVisible(), false);
  await settings.reload();
  await settings.locator('.pose-card:not(.skeleton)').first().waitFor();
  assert.equal(await settings.getByRole('switch').isChecked(), false, 'Opt-out persists after reload');
  assert.equal(await settings.locator('.pose-3d-overlay').count(), 0);
  await settings.getByRole('switch').check();
  await page.waitForFunction(() => !document.querySelector('#viewer3dMode').closest('.viewer-mode').hidden);
  await settings.close();
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
  await page.locator('.pose-card').first().hover();
  await page.waitForFunction(() => document.querySelector('.pose-3d-overlay.pending:not([hidden])'));
  assert.equal(await page.locator('.pose-3d-overlay').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)',
    'Missing group retains its source image');
  assert.ok(await page.locator('.main-image').first().isVisible());
  await page.screenshot({ path: 'output/gallery-review/pending-hover.png' });
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
  assert.match(await page.locator(".pose-3d-status").textContent(), /此姿势尚无/);
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
      experimental3D: 'default off; preference persists; cross-tab shutdown restores image',
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
