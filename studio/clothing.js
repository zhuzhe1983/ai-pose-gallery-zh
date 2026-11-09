// SPDX-License-Identifier: GPL-3.0-only
// Procedural Dual-Quaternion Skinned 3D Clothing built from MakeHuman v3 bind regions.
import * as THREE from "three";
import { attachDualQuaternionSkinning } from "./dual-quaternion.js";

function rgbHex(rgb, fallback = "#ebe6df") {
  if (!Array.isArray(rgb) || rgb.length < 3) return fallback;
  return (
    "#" +
    rgb
      .slice(0, 3)
      .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0"))
      .join("")
  );
}

async function makeFabricTexture(rgb, dataUrl = null) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const base = rgbHex(rgb);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle woven linen/knit micro-texture so 3D clothes catch light realistically
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let y = 0; y < 256; y += 4) ctx.fillRect(0, y, 256, 1);
  ctx.fillStyle = "rgba(0,0,0,0.04)";
  for (let x = 0; x < 256; x += 4) ctx.fillRect(x, 0, 1, 256);

  if (dataUrl) {
    try {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      ctx.drawImage(img, 0, 0, 256, 256);
    } catch {
      /* keep fallback base weave */
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function buildShellGeometry(baseGeom, jointKeys, predicate, offsetFn, uvBounds) {
  const pos = baseGeom.attributes.position;
  const norm = baseGeom.attributes.normal;
  const sIdx = baseGeom.attributes.skinIndex;
  const sW = baseGeom.attributes.skinWeight;
  const index = baseGeom.index;
  const triCount = index ? index.count / 3 : pos.count / 3;

  const vertIncluded = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = jointKeys[sIdx.getComponent(i, 0)] || "";
    if (predicate(x, y, z, key)) vertIncluded[i] = 1;
  }

  const map = new Int32Array(pos.count).fill(-1);
  const newIndices = [];
  const outPos = [];
  const outNorm = [];
  const outUv = [];
  const outSkinIdx = [];
  const outSkinW = [];

  const { minX, maxX, minY, maxY } = uvBounds;
  const spanX = Math.max(1e-3, maxX - minX);
  const spanY = Math.max(1e-3, maxY - minY);

  const addVert = (srcI) => {
    if (map[srcI] >= 0) return map[srcI];
    const x = pos.getX(srcI), y = pos.getY(srcI), z = pos.getZ(srcI);
    const nx = norm.getX(srcI), ny = norm.getY(srcI), nz = norm.getZ(srcI);
    const key = jointKeys[sIdx.getComponent(srcI, 0)] || "";
    const off = offsetFn(x, y, z, key);
    const nextIdx = outPos.length / 3;
    map[srcI] = nextIdx;
    let px = x + nx * off;
    let py = y + ny * off;
    let pz = z + nz * off;
    // Drape fabric smoothly over front bust contour so underbust creases never poke skin through the top
    if (key === "chest" && z > 1.8 && y >= 12.0 && y <= 21.5) {
      pz += 0.95;
      py += Math.max(0, (16.5 - y) * 0.08);
    }
    outPos.push(px, py, pz);
    outNorm.push(nx, ny, nz);
    const u = Math.max(0.02, Math.min(0.98, (x - minX) / spanX));
    const v = Math.max(0.02, Math.min(0.98, (y - minY) / spanY));
    outUv.push(u, v);
    for (let c = 0; c < 4; c++) {
      outSkinIdx.push(sIdx.getComponent(srcI, c));
      outSkinW.push(sW.getComponent(srcI, c));
    }
    return nextIdx;
  };

  for (let t = 0; t < triCount; t++) {
    const a = index ? index.getX(t * 3) : t * 3;
    const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    if (vertIncluded[a] && vertIncluded[b] && vertIncluded[c]) {
      newIndices.push(addVert(a), addVert(b), addVert(c));
    }
  }

  if (!newIndices.length) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(outPos, 3));
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(outNorm, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(outUv, 2));
  geom.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(outSkinIdx, 4));
  geom.setAttribute("skinWeight", new THREE.Float32BufferAttribute(outSkinW, 4));
  geom.setIndex(newIndices);
  return geom;
}

function buildPleatedSkirtGeometry(jointKeys, longSkirt = false) {
  const waistIdx = jointKeys.indexOf("waist");
  const pelvisIdx = jointKeys.indexOf("pelvis");
  const lLegIdx = jointKeys.indexOf("l_leg");
  const rLegIdx = jointKeys.indexOf("r_leg");
  const lKneeIdx = jointKeys.indexOf("l_knee");
  const rKneeIdx = jointKeys.indexOf("r_knee");

  const segs = 56;
  const rings = longSkirt ? 18 : 13;
  const yTop = 5.4;
  const yBot = longSkirt ? -21.5 : -11.5;

  const outPos = [];
  const outUv = [];
  const outSkinIdx = [];
  const outSkinW = [];
  const indices = [];

  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const y = yTop + (yBot - yTop) * t;
    // Fitted waist transitioning to smoothly flared A-line hem with soft radial pleats
    const rxBase = 7.1 + t * (longSkirt ? 6.8 : 5.4);
    const rzBase = 5.3 + t * (longSkirt ? 5.6 : 4.4);
    const pleatAmp = Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.5) * 0.42;

    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      const theta = u * Math.PI * 2;
      const pleat = pleatAmp * Math.sin(14 * theta);
      const rx = rxBase + pleat;
      const rz = rzBase + pleat;
      const x = Math.cos(theta) * rx;
      const z = Math.sin(theta) * rz;
      outPos.push(x, y, z);
      outUv.push(0.5 + 0.46 * Math.cos(theta), 1 - t);

      // Blend weights cleanly from waist -> pelvis -> left/right thighs (+ subtle knees for long skirt)
      const side = Math.cos(theta); // +1 left (+X), -1 right (-X)
      const legBlend = (side + 1) * 0.5;
      const wWaist = Math.max(0, 1 - t * 3.5);
      const wPelvis = Math.max(0.18, (1 - wWaist) * (1 - t * 0.78));
      const wLegs = Math.max(0, 1 - wWaist - wPelvis);
      const wL = wLegs * legBlend;
      const wR = wLegs * (1 - legBlend);

      if (longSkirt && t > 0.65 && lKneeIdx >= 0 && rKneeIdx >= 0) {
        const kneeFrac = (t - 0.65) / 0.35 * 0.45;
        const wKL = wL * kneeFrac;
        const wKR = wR * kneeFrac;
        outSkinIdx.push(pelvisIdx, lLegIdx, rLegIdx, side >= 0 ? lKneeIdx : rKneeIdx);
        outSkinW.push(wPelvis + wWaist, wL * (1 - kneeFrac), wR * (1 - kneeFrac), side >= 0 ? wKL : wKR);
      } else {
        outSkinIdx.push(waistIdx, pelvisIdx, lLegIdx, rLegIdx);
        outSkinW.push(wWaist, wPelvis, wL, wR);
      }
      // Normalize weights strictly to sum = 1.0
      const base = outSkinW.length - 4;
      const sum = outSkinW[base] + outSkinW[base + 1] + outSkinW[base + 2] + outSkinW[base + 3] || 1;
      for (let c = 0; c < 4; c++) outSkinW[base + c] /= sum;
    }
  }

  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * (segs + 1) + s;
      const b = a + 1;
      const c = a + (segs + 1);
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(outPos, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(outUv, 2));
  geom.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(outSkinIdx, 4));
  geom.setAttribute("skinWeight", new THREE.Float32BufferAttribute(outSkinW, 4));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function attachGarmentPart(model, skin, geom, material) {
  if (!geom) return null;
  const mesh = new THREE.SkinnedMesh(geom, material);
  mesh.bind(skin.skeleton, model.matrixWorld);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.userData = { clothing: true, jointKeys: skin.userData.jointKeys };
  attachDualQuaternionSkinning(mesh);
  model.add(mesh);
  return mesh;
}

export function clearHumanClothing(model) {
  const toRemove = model.children.filter((o) => o.userData?.clothing);
  for (const m of toRemove) {
    model.remove(m);
    m.geometry?.dispose();
    for (const mat of [].concat(m.material || [])) {
      mat.map?.dispose();
      mat.dispose();
    }
  }
}

export async function applyHumanClothing(model, spec = null) {
  clearHumanClothing(model);
  if (!spec) return false;
  const skin = model.children.find((o) => o.userData?.human);
  if (!skin) return false;
  const keys = skin.userData.jointKeys;
  const baseGeom = skin.geometry;

  if (spec.mode === "liner" || spec.mode === "safety") {
    // Opaque fitted bodysuit: torso + shorts + full leg cover + feet. Guarantees the 3D body is never
    // rendered as bare skin no matter which pose/outfit layer is applied, eliminating any explicit-content risk.
    const suitMat = new THREE.MeshPhysicalNodeMaterial({
      color: 0xf1eee8,
      roughness: 0.78,
      sheen: 0.12,
      side: THREE.DoubleSide,
    });
    const torsoGeom = buildShellGeometry(
      baseGeom,
      keys,
      (x, y, _z, k) =>
        (["chest", "waist_mid", "waist", "pelvis"].includes(k) && y >= -5.2 && y <= 22.0) ||
        (["clavicle_l", "clavicle_r"].includes(k) && y >= 19.5 && y <= 24.5) ||
        (["l_arm", "r_arm", "l_elbow", "r_elbow"].includes(k)) ||
        (["l_leg", "r_leg", "l_knee", "r_knee"].includes(k) && y >= -36.5),
      () => 0.30,
      { minX: -23, maxX: 23, minY: -36.5, maxY: 22.0 },
    );
    attachGarmentPart(model, skin, torsoGeom, suitMat);

    // Feet / shoes cover too
    const footMat = new THREE.MeshPhysicalNodeMaterial({
      color: 0xe7e3dd,
      roughness: 0.62,
      side: THREE.DoubleSide,
    });
    const footGeom = buildShellGeometry(
      baseGeom,
      keys,
      (_x, y, _z, k) =>
        (["l_ankle", "r_ankle"].includes(k) || (["l_knee", "r_knee"].includes(k) && y <= -34.5)) &&
        y >= -42.2,
      () => 0.42,
      { minX: -11, maxX: 11, minY: -42.2, maxY: -34.5 },
    );
    attachGarmentPart(model, skin, footGeom, footMat);
    return true;
  }

  const isSkirt = Boolean(spec.isSkirt);
  const longSleeves = Boolean(spec.longSleeves);
  const longBottom = Boolean(spec.longBottom);

  // Base/modesty underlayer beneath ANY outfit so bare skin never shows if the outer garment slips
  const underMat = new THREE.MeshPhysicalNodeMaterial({
    color: 0xf1eee8,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const underGeom = buildShellGeometry(
    baseGeom,
    keys,
    (x, y, _z, k) =>
      (["chest", "waist_mid", "waist"].includes(k) && y >= 4.5 && y <= 21.8) ||
      (k === "pelvis" && y <= 4.0) ||
      (["l_leg", "r_leg"].includes(k) && y >= -6.5),
    () => 0.2,
    { minX: -12, maxX: 12, minY: -7, maxY: 22 },
  );
  attachGarmentPart(model, skin, underGeom, underMat);

  // 2. 3D Upper Garment (top / blouse / cardigan with optional long sleeves, crisp woven fabric tint)
  const [topTex, botTex] = await Promise.all([
    makeFabricTexture(spec.upperRgb, null),
    makeFabricTexture(spec.lowerRgb, null),
  ]);
  const topMat = new THREE.MeshPhysicalNodeMaterial({
    map: topTex,
    roughness: 0.68,
    metalness: 0.0,
    sheen: 0.22,
    sheenRoughness: 0.75,
    side: THREE.DoubleSide,
  });
  const armLimitX = longSleeves ? 22.8 : 14.5;
  const topGeom = buildShellGeometry(
    baseGeom,
    keys,
    (x, y, _z, k) => {
      if (["clavicle_l", "clavicle_r", "chest", "waist_mid", "waist"].includes(k)) {
        // Scoop neckline carving around throat & collarbones
        if (y > 21.2 && Math.abs(x) < 3.8) return false;
        return y >= 3.8 && y <= 24.4;
      }
      if (["l_arm", "r_arm", "l_elbow", "r_elbow"].includes(k)) {
        return Math.abs(x) <= armLimitX;
      }
      return false;
    },
    (x, y) => {
      const edge = Math.min(1, Math.max(0.45, (24.4 - y) / 2.2));
      return Math.abs(x) > armLimitX - 1.5 ? 0.52 : 0.92 * edge;
    },
    { minX: -12, maxX: 12, minY: 3.8, maxY: 24.4 },
  );
  attachGarmentPart(model, skin, topGeom, topMat);

  // 3. 3D Skirt (continuous pleated A-line cone) OR 3D Trousers / Shorts
  const botMat = new THREE.MeshPhysicalNodeMaterial({
    map: botTex,
    roughness: 0.72,
    sheen: 0.18,
    side: THREE.DoubleSide,
  });
  if (isSkirt) {
    const skirtGeom = buildPleatedSkirtGeometry(keys, longBottom);
    attachGarmentPart(model, skin, skirtGeom, botMat);
  } else {
    const legMinY = longBottom ? -36.5 : -11.5;
    const pantsGeom = buildShellGeometry(
      baseGeom,
      keys,
      (_x, y, _z, k) =>
        (k === "pelvis" && y <= 5.2) ||
        (["l_leg", "r_leg", "l_knee", "r_knee"].includes(k) && y >= legMinY),
      () => 0.56,
      { minX: -10, maxX: 10, minY: legMinY, maxY: 5.2 },
    );
    attachGarmentPart(model, skin, pantsGeom, botMat);
  }

  // 4. 3D Footwear / Shoes
  const shoeMat = new THREE.MeshPhysicalNodeMaterial({
    color: rgbHex(spec.shoeRgb, "#e6e2dc"),
    roughness: 0.55,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  const footGeom = buildShellGeometry(
    baseGeom,
    keys,
    (_x, y, _z, k) =>
      (["l_ankle", "r_ankle"].includes(k) || (["l_knee", "r_knee"].includes(k) && y <= -34.5)) &&
      y >= -42.2,
    (_x, y) => (y < -39.5 ? 0.54 : 0.38),
    { minX: -11, maxX: 11, minY: -42.2, maxY: -34.5 },
  );
  attachGarmentPart(model, skin, footGeom, shoeMat);
  return true;
}
