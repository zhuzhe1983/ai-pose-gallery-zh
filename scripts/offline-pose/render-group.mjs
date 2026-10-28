#!/usr/bin/env node
// Render all views in one owned browser, preserving exactly one shared pose.
import fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
const args=process.argv.slice(2), options={url:"http://127.0.0.1:8767/studio/"};
for(let i=0;i<args.length;i+=2){if(!["--manifest","--url"].includes(args[i])||!args[i+1])throw Error("--manifest FILE [--url URL]");options[args[i].slice(2)]=args[i+1];}
const job=JSON.parse(await fs.readFile(options.manifest,"utf8"));
if(!Array.isArray(job.views)||!job.views.length)throw Error("Empty view list");
const {chromium}=await import(process.env.POSE_PLAYWRIGHT_MODULE?pathToFileURL(path.resolve(process.env.POSE_PLAYWRIGHT_MODULE)).href:"playwright");
const browser=await chromium.launch({headless:true});
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{await browser.close();process.exit(130);});
const save=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+".tmp",value);await fs.rename(file+".tmp",file);};
try {
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 await page.goto(options.url);await page.waitForFunction(()=>window.poseStudio,undefined,{timeout:60000});await page.evaluate(()=>poseStudio.ready);
 let canonical=null;const rows=[];
 for(const view of job.views){
  const input=JSON.parse(await fs.readFile(view.input,"utf8"));
  const signature=JSON.stringify(input.figures);
  if(canonical!==null&&signature!==canonical)throw Error("Views have conflicting figure poses");canonical=signature;
  const result=await page.evaluate(async({input,hands})=>{
   poseStudio.importScene(input);const id=input.figures[0].id;
   if(hands)for(const side of ['l','r'])poseStudio.setHand(id,side,hands[side]??0);
   const before=poseStudio.getState();poseStudio.setFigure(id,{ground:true});
   const grounded=poseStudio.getState(),dy=grounded.figures[0].position[1]-before.figures[0].position[1];
   grounded.camera.position[1]+=dy;grounded.camera.target[1]+=dy;grounded.floorLock=true;
   poseStudio.importScene(grounded);
   const {scene}=await import('./vendor/mannequin/scene.js'),THREE=await import('three'),{humanBounds}=await import('./human.js');
   const model=scene.children.find(o=>o.body&&o.pelvis);if(!model.userData.human)throw Error('Human mesh unavailable');
   const box=humanBounds(model),skin=model.children.find(o=>o.isSkinnedMesh),mins={};
   for(let i=0;i<skin.geometry.attributes.position.count;i++){
    const p=skin.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(skin.matrixWorld);
    for(let c=0;c<4;c++){if(skin.geometry.attributes.skinWeight.getComponent(i,c)<.55)continue;
     const key=skin.userData.jointKeys[skin.geometry.attributes.skinIndex.getComponent(i,c)];
     if(/_[a-z]+$/.test(key))mins[key]=Math.min(mins[key]??Infinity,p.y+.7);
    }
   }
   const image=await poseStudio.capture({width:900,height:1200});
   return {scene:poseStudio.getState(),image:image.dataUrl,ground:{meshMinimumClearanceM:box.min.y+.7,regionMinimumClearanceM:mins,method:'actual dual-quaternion skin; minimum height only, not support recognition'}};
  },{input,hands:job.hands});
  await save(view.output,JSON.stringify(result.scene,null,2)+'\n');
  await save(view.render,Buffer.from(result.image.split(',')[1],'base64'));
  rows.push({view:view.view,...result.ground});
 }
 await save(job.report,JSON.stringify({schema:'pose-atlas/ground-check@1',views:rows,verified:false},null,2)+'\n');
 console.log(JSON.stringify({rendered:rows.length,ground:rows}));
} finally {await browser.close();}
