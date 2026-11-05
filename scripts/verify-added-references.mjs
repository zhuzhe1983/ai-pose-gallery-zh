import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EXPERIMENTAL_POSES} from '../studio/experimental-catalog.js';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const sources = read('data/wavespeed/sources.json');
assert.equal(sources.length, 54);
for (const source of sources) {
  const file = 'data/wavespeed/originals/' + new URL(source.url).pathname.split('/').pop();
  assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'), source.sha256);
}
const rows = read('data/wavespeed/pose-zh.json');
assert.equal(rows.length, 27);
assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
for (const row of rows) {
  assert.match(row.id, /^ws_sit_[a-z-]+_[fds]$/);
  for (const field of ['原图','lineArt']) {
    const bytes = fs.readFileSync(row[field]);
    assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), 900); assert.equal(bytes.readUInt32BE(20), 1200);
  }
  assert.equal(fs.readFileSync(row['缩略图']).toString('hex',0,3), 'ffd8ff');
  assert.equal(new URL(row.source.url).hostname, 'wavespeed.ai');
}
for (const lang of ['en','ja']) {
  const translated = read(`data/wavespeed/pose-${lang}.json`);
  assert.deepEqual(translated.map(r => r.id), rows.map(r => r.id));
  translated.forEach(r => assert.ok(r['姿势名称'] && r['角度'] && r.source));
}
assert.equal(Object.keys(EXPERIMENTAL_POSES).length, 231);
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
console.log('Added references: 9 poses, 54 provenance-checked images, 3 languages; 231 unapproved canonical 3D scenes.');
