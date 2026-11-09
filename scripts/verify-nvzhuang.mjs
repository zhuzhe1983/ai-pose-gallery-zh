import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const catalog = read('data/nvzhuang/catalog.json');
const sources = read('data/nvzhuang/sources.json');
assert.equal(catalog.schema_version, 1);

const real = read(catalog.libraries.real.index);
const anime = read(catalog.libraries.anime.index);
const portrait = read(catalog.libraries.portrait.index);

assert.equal(real.length, catalog.libraries.real.count);
assert.equal(anime.length, catalog.libraries.anime.count);
assert.equal(portrait.length, catalog.libraries.portrait.count);

assert.equal(new Set(real.map((r) => r.id)).size, real.length);
assert.equal(new Set(anime.map((r) => r.id)).size, anime.length);
assert.equal(new Set(portrait.map((r) => r.id)).size, portrait.length);

for (const row of [...real, ...anime]) {
  assert.ok(row.category && row.categoryName?.zh && row.categoryName?.en && row.categoryName?.ja);
  for (const field of ['thumb', 'image']) {
    const file = row[field];
    assert.ok(fs.existsSync(file), `Missing ${file}`);
    const head = fs.readFileSync(file).subarray(0, 12);
    assert.equal(head.toString('ascii', 0, 4), 'RIFF', file);
    assert.equal(head.toString('ascii', 8, 12), 'WEBP', file);
  }
}

for (const row of portrait) {
  assert.ok(['face', 'styling'].includes(row.section));
  assert.ok(row.categoryName?.zh && row.categoryName?.en && row.categoryName?.ja);
  assert.ok(fs.existsSync(row.thumb), `Missing ${row.thumb}`);
  const head = fs.readFileSync(row.thumb).subarray(0, 12);
  assert.equal(head.toString('ascii', 0, 4), 'RIFF', row.thumb);
  assert.equal(head.toString('ascii', 8, 12), 'WEBP', row.thumb);
}

assert.equal(sources.length, real.length * 2 + anime.length * 2 + portrait.length);
assert.equal(new Set(sources.map((s) => s.path)).size, sources.length);
for (const source of sources) {
  const bytes = fs.readFileSync(source.path);
  assert.equal(bytes.length, source.bytes, source.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256, source.path);
}

const totalMiB = sources.reduce((sum, s) => sum + s.bytes, 0) / 1048576;
console.log(
  `Wardrobe & portraits verified: ${real.length} real, ${anime.length} anime, ` +
  `${portrait.length} portraits (${sources.length} WebP files, ${totalMiB.toFixed(1)} MiB).`,
);
