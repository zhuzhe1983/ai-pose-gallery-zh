#!/usr/bin/env node
// Actual full-skin floor check, scene equality and local preview UI smoke.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.POSE_PLAYWRIGHT_MODULE?pathToFileURL(path.resolve(process.env.POSE_PLAYWRIGHT_MODULE)).href:'playwright');
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1400,height:1050}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8767/studio/');await page.waitForFunction(()=>window.poseStudio);await page.evaluate(()=>poseStudio.ready);
 const measurements=await page.evaluate(async()=>{
  await poseStudio.loadPreset('solo_kneel_hands-thighs');
  const THREE=await import('three'),{scene}=await import('./vendor/mannequin/scene.js'),{humanBounds}=await import('./human.js');
  const model=scene.children.find(o=>o.body&&o.pelvis),skin=model.children.find(o=>o.isSkinnedMesh);
  const bounds=humanBounds(model),clearances={l_ankle:Infinity,r_ankle:Infinity,l_knee:Infinity,r_knee:Infinity};
  for(let i=0;i<skin.geometry.attributes.position.count;i++){
   const p=skin.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(skin.matrixWorld);
   for(let c=0;c<4;c++){
    if(skin.geometry.attributes.skinWeight.getComponent(i,c)<.55)continue;
    const key=skin.userData.jointKeys[skin.geometry.attributes.skinIndex.getComponent(i,c)];
    if(key in clearances)clearances[key]=Math.min(clearances[key],p.y+.7);
   }
  }
  const before=JSON.stringify(poseStudio.getState().figures);
  for(const view of ['f','s','d','hi','lo']){poseStudio.setCamera(view);if(JSON.stringify(poseStudio.getState().figures)!==before)throw Error('Camera changed shared pose');}
  return {clearances,min:bounds.min.y+.7};
 });
 assert.ok(measurements.min>=0&&measurements.min<.006);
 for(const v of Object.values(measurements.clearances))assert.ok(v>=0&&v<.015,JSON.stringify(measurements));
 await page.goto('http://127.0.0.1:8767/preview/?lang=zh');
 await page.waitForFunction(()=>document.querySelector('.card[data-id="solo_kneel_hands-thighs"]'));
 await page.locator('#search').fill('solo_kneel_hands-thighs');
 await page.waitForFunction(()=>document.querySelectorAll('.card[data-id]').length===1);
 const card=page.locator('.card[data-id="solo_kneel_hands-thighs"]');
 assert.equal(await card.locator('.view-block').count(),5);
 assert.equal(await card.locator('.group-consistency.shared').count(),1);
 await fs.mkdir('output/playwright',{recursive:true});await page.screenshot({path:'output/playwright/contact-preview.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({measurements,views:5,errors}));
} finally {await browser.close();}
