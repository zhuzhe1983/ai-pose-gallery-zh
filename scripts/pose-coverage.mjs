// The gallery is the source of truth; existing presets are drafts, not verified reconstructions.
import fs from "node:fs";
import { PRESETS } from "../studio/presets.js";
import { EXPERIMENTAL_POSES } from '../studio/experimental-catalog.js';
const catalog = JSON.parse(fs.readFileSync("data/catalog.json", "utf8"));
Object.assign(catalog.systems, JSON.parse(fs.readFileSync('data/wavespeed/catalog.json', 'utf8')).systems);
const poses = [];
for (const [system, info] of Object.entries(catalog.systems))
  for (const [category, c] of Object.entries(info.categories))
    for (const row of JSON.parse(fs.readFileSync(c.index, "utf8"))) {
      const id = `${system}_${category}_${row.pose}`;
      poses.push({
        id,
        views: row.views,
        status: EXPERIMENTAL_POSES[id] ? 'experimental-unapproved' : PRESETS[id] ? "draft-needs-review" : "not-started",
      });
    }
const result = {
  schema: 1,
  total: poses.length,
  verified: 0,
  drafts: poses.filter((p) => p.status === "draft-needs-review").length,
  experimental: poses.filter(p => p.status === 'experimental-unapproved').length,
  poses,
};
const text = JSON.stringify(result, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (fs.readFileSync("data/pose-3d-status.json", "utf8") !== text)
    throw Error("Pose coverage is stale; run node scripts/pose-coverage.mjs");
} else fs.writeFileSync("data/pose-3d-status.json", text);
console.log(
  `${result.total} known poses; ${result.experimental} experimental; ${result.drafts} manual-only drafts; ${result.verified} verified.`,
);
