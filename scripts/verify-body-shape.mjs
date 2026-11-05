// Integration checks for authored body shapes, scene persistence and per-actor isolation.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium} = await import(process.env.POSE_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.POSE_PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({headless:true,args:process.argv.includes('--webgpu')?['--enable-unsafe-webgpu']:[]});
try {
  const page = await browser.newPage({viewport:{width:1440,height:1100}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(process.env.POSE_STUDIO_URL || 'http://127.0.0.1:8767/studio/?lang=zh');
  await page.waitForFunction(()=>window.poseStudio,undefined,{timeout:60000});
  await page.evaluate(()=>poseStudio.ready);
  const checks = await page.evaluate(async()=>{
    const {scene}=await import('./vendor/mannequin/scene.js');
    const {decodeScene,sceneFragment}=await import('./scene-url.js');
    const check=(ok,msg)=>{if(!ok)throw Error(msg);};
    const models=()=>scene.children.filter(o=>o.body&&o.pelvis);
    const skin=m=>m.children.find(o=>o.userData.human);
    poseStudio.reset();poseStudio.addFigure({sex:'female'});
    const [a,b]=models(),base=skin(a).geometry,original=base.attributes.position.array.slice();
    check(document.body.dataset.figureMesh==='makehuman-v3','Restored continuous mesh');
    check(skin(b).geometry===base,'Unchanged actors share base');
    const joints=JSON.stringify(poseStudio.getState().figures[0].joints);
    poseStudio.setFigure('A',{bustSize:1,bustSag:1});
    const edited=skin(a).geometry.attributes.position.array;
    check(skin(a).geometry!==base&&skin(b).geometry===base,'Geometry isolation');
    check(original.every((v,i)=>v===base.attributes.position.array[i]),'Base untouched');
    check(edited.every(Number.isFinite),'Finite morphed vertices');
    check(edited.some((v,i)=>Math.abs(v-original[i])>0.01),'Shape visibly changed');
    check(joints===JSON.stringify(poseStudio.getState().figures[0].joints),'Bones unchanged');
    const before=JSON.stringify(poseStudio.getState());
    for(const changes of [{bustSize:1.1,sex:'male'},{bustSag:-1},{bustSize:NaN}]) {
      let threw=false;try{poseStudio.setFigure('A',changes);}catch{threw=true;}
      check(threw&&JSON.stringify(poseStudio.getState())===before,'Invalid input is atomic');
    }
    const state=poseStudio.exportScene(),url=await poseStudio.getShareURL();
    const decoded=await decodeScene(sceneFragment(url));
    check(decoded.figures[0].bustSize===1&&decoded.figures[0].bustSag===1,'URL roundtrip');
    poseStudio.setFigure('A',{bustSize:.1,bustSag:.3});poseStudio.undo();
    check(poseStudio.getState().figures[0].bustSize===1,'Undo shape');
    poseStudio.redo();check(poseStudio.getState().figures[0].bustSize===.1,'Redo shape');
    poseStudio.importScene(state);check(poseStudio.getState().figures[0].bustSag===1,'JSON roundtrip');
    poseStudio.selectFigure('A');poseStudio.setFigure('A',{sex:'male'});
    check(document.getElementById('bodyShapeControls').hidden,'Male controls hidden');
    poseStudio.setFigure('A',{sex:'female'});
    check(!document.getElementById('bodyShapeControls').hidden&&poseStudio.getState().figures[0].bustSize===1,'Female shape retained');
    poseStudio.setFigure('A',{bustSize:.75,bustSag:0});
    check(skin(models()[0]).geometry===skin(models()[1]).geometry,'Default exact shared geometry restored');
    const legacy=poseStudio.exportScene();legacy.figures.forEach(f=>{delete f.bustSize;delete f.bustSag;});
    poseStudio.importScene(legacy);check(poseStudio.getState().figures.every(f=>f.bustSize===.75&&f.bustSag===0),'Old scenes default');
    for(let i=2;i<6;i++)poseStudio.addFigure({sex:i%2?'male':'female',bustSize:.4,bustSag:.5});
    check(models().length===6,'Six actors supported');
    poseStudio.reset();
    return {backend:document.getElementById('backend').dataset.backend,isolation:true,defaults:true,persistence:true,undo:true,sixActors:true};
  });
  await page.selectOption('#cupSize','0.4');
  await page.locator('#number-bustSag').fill('60');await page.locator('#number-bustSag').press('Tab');
  const ui=await page.evaluate(()=>poseStudio.getState().figures[0]);
  assert.equal(ui.bustSize,.4);assert.equal(ui.bustSag,.6);
  await fs.mkdir('output/body-shape-review',{recursive:true});
  for(const [name,size,sag] of [['previous',.75,0],['small',.1,0],['large',1,0],['large-soft',1,1]]) {
    for(const view of ['f','s']) {
      const image=await page.evaluate(async({size,sag,view})=>{
        poseStudio.setFigure('A',{bustSize:size,bustSag:sag});poseStudio.setCamera(view);
        return (await poseStudio.capture({width:700,height:1000})).dataUrl;
      },{size,sag,view});
      await fs.writeFile(`output/body-shape-review/${name}-${view}.png`,Buffer.from(image.split(',')[1],'base64'));
    }
  }
  await page.screenshot({path:'output/body-shape-review/controls.png'});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({...checks,ui:true,screenshots:8}));
} finally {await browser.close();}
