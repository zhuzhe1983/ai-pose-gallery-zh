// Verify all category filters and original/line-art links through the real UI.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.POSE_PLAYWRIGHT_MODULE?pathToFileURL(process.env.POSE_PLAYWRIGHT_MODULE).href:'playwright');
const catalog=JSON.parse(await fs.readFile('data/wavespeed/catalog.json','utf8')).systems.ws;
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.POSE_GALLERY_URL||'http://127.0.0.1:8767/';
  for(const lang of ['zh','en','ja']) {
    await page.goto(base+'?lang='+lang);
    await page.locator('.pose-card:not(.skeleton)').first().waitFor();
    assert.equal(await page.locator('#statPoses').textContent(),'779');
    assert.equal((await page.locator('#statImages').textContent()).replaceAll(',',''),'2912');
    await page.locator('#lineTabs button').filter({hasText:'WaveSpeed'}).click();
    assert.equal(await page.locator('#categorySelect option').count(),16);
    for(const [slug,meta] of Object.entries(catalog.categories)) {
      await page.selectOption('#categorySelect',meta.name[lang]);
      await page.waitForFunction(slug=>document.querySelector('.main-image')?.src.includes('ws_'+slug+'_'),slug);
      const card=page.locator('.pose-card').first();
      assert.equal(await card.locator('.angle-thumb').count(),3);
      await card.click();
      await page.waitForFunction(()=>{const im=document.querySelector('#viewerImage');return im.complete&&im.naturalWidth===900;});
      assert.match(await page.locator('#downloadImage').getAttribute('download'),/^ws_.*\.webp$/);
      const line=await page.locator('#openLineArt').getAttribute('href');
      assert.ok(line.includes('/line/ws_'+slug+'_')&&line.endsWith('.webp'));
      const response=await page.request.get(new URL(line,page.url()).href);assert.equal(response.status(),200);
      assert.equal((await response.body()).toString('ascii',8,12),'WEBP');
      await page.locator('#viewerClose').click();
    }
  }
  await fs.mkdir('output/wavespeed-import',{recursive:true});
  await page.goto(base+'?lang=zh');await page.locator('.pose-card:not(.skeleton)').first().waitFor();
  await page.locator('#lineTabs button').filter({hasText:'WaveSpeed'}).click();
  await page.locator('.pose-card').first().scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.main-image')).slice(0,5).every(im=>im.complete&&im.naturalWidth===300));
  await page.screenshot({path:'output/wavespeed-import/gallery-all.png'});
  assert.deepEqual(errors,[]);
  console.log('779 groups, 2912 main images; all 15 WaveSpeed categories × 3 languages, three views, WebP downloads and line-art links passed.');
} finally {await browser.close();}
