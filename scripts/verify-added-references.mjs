import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EXPERIMENTAL_POSES} from '../studio/experimental-catalog.js';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const sources = read('data/wavespeed/sources.json');
const selection = read('data/wavespeed/selection.json');
assert.equal(selection.poses.length, 491);
assert.equal(Object.keys(selection.categories).length, 15);
assert.equal(sources.length, selection.poses.length * 6);
assert.equal(new Set(sources.map(s => s.path)).size, sources.length);
for (const source of sources) {
  const file = source.path;
  assert.match(file, /^data\/wavespeed\/(img|line)\/ws_[a-z]+_[a-z0-9-]+_[fds]\.webp$/);
  assert.ok(file.split('/').pop().length <= 64);
  assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'), source.sha256);
  assert.equal(new URL(source.url).hostname, 'static.wavespeed.ai');
}
const rows = read('data/wavespeed/pose-zh.json');
assert.equal(rows.length, selection.poses.length * 3);
assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
for (const row of rows) {
  assert.match(row.id, /^ws_[a-z]+_[a-z0-9-]+_[fds]$/);
  for (const field of ['原图','lineArt']) {
    const bytes = fs.readFileSync(row[field]);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  }
  assert.equal(fs.readFileSync(row['缩略图']).toString('hex',0,3), 'ffd8ff');
  assert.equal(new URL(row.source.url).hostname, 'wavespeed.ai');
}
const ws = read('data/wavespeed/catalog.json').systems.ws;
assert.equal(Object.values(ws.categories).reduce((n,c)=>n+c.pose_count,0),491);
for(const [category,meta] of Object.entries(ws.categories)) {
  const poses=read(meta.index);assert.equal(poses.length,meta.pose_count);
  for(const pose of poses) {
    assert.deepEqual(pose.views,['f','d','s']);
    for(const lang of ['zh','en','ja']) assert.ok(pose.name[lang]?.trim());
    for(const view of pose.views) assert.ok(rows.some(r=>r.id===`ws_${category}_${pose.pose}_${view}`));
  }
}
// Published original nine PNG links stay available after moving the catalog to WebP.
for(const pose of ['cross','hug-kn','side','hands-bk','kn-up','legs-v','elbow-lean','butterfly','twist'])
  for(const view of ['f','d','s']) for(const kind of ['img','line'])
    assert.equal(fs.readFileSync(`data/wavespeed/${kind}/ws_sit_${pose}_${view}.png`).toString('hex',0,8),'89504e470d0a1a0a');
for (const lang of ['en','ja']) {
  const translated = read(`data/wavespeed/pose-${lang}.json`);
  assert.deepEqual(translated.map(r => r.id), rows.map(r => r.id));
  const ui=read('data/ui.json')[lang], labels=[ui.angleFront,ui.angleDiag,ui.angleSide];
  translated.forEach(r => assert.ok(r['姿势名称'] && labels.includes(r['角度']) && r.source));
}
// EXPERIMENTAL_POSES combines classic canonical drafts (231) plus locally-generated WaveSpeed drafts.
assert.ok(Object.keys(EXPERIMENTAL_POSES).length >= 231);
for (const [id, meta] of Object.entries(EXPERIMENTAL_POSES)) {
  const draft = read(`data/experimental-poses/${id}.json`);
  assert.equal(draft.id, id); assert.equal(draft.status, 'experimental-unapproved');
  assert.equal(draft.scene.schema, 'pose-atlas/studio@3');
  assert.equal(draft.scene.figures.length, meta.figures);
  assert.deepEqual(Object.keys(draft.cameras), meta.views);
  for (const camera of Object.values(draft.cameras))
    for (const key of ['position','target']) assert.ok(camera[key].length === 3 && camera[key].every(Number.isFinite));
  for (const actor of draft.scene.figures) {
    assert.ok(actor.height >= 1.2 && actor.height <= 2.2);
    for (const q of [actor.rotation,...Object.values(actor.joints)])
      assert.ok(q.length === 4 && q.every(Number.isFinite) && Math.abs(Math.hypot(...q)-1)<1e-5);
  }
}
const wsDrafts = Object.keys(EXPERIMENTAL_POSES).filter(id => id.startsWith('ws_')).length;
console.log(`Added references: 491 poses, 2946 provenance-checked images, 15 categories, 3 languages; ${Object.keys(EXPERIMENTAL_POSES).length} unapproved canonical 3D scenes (${wsDrafts} WaveSpeed).`);
