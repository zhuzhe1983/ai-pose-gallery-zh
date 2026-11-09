// Rust-WASM Garment Extraction + MLS Elastic Deformation + 3D/2D Fitting Composite Renderer.
import { wasmBlendHead, wasmExtractGarment, wasmMlsWarp } from './wasm-bridge.js';

function hexToRgb(hex) {
  const clean = String(hex || '#edd4c2').replace('#', '');
  if (clean.length !== 6) return [237, 212, 194];
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function sampleFabricPatchDataUrl(cropCanvas, fracY0, fracY1, fallbackRgb) {
  const w = cropCanvas.width, h = cropCanvas.height;
  const sx = Math.round(w * 0.34);
  const sw = Math.max(12, Math.round(w * 0.32));
  const sy = Math.round(h * fracY0);
  const sh = Math.max(12, Math.round(h * (fracY1 - fracY0)));

  const patch = document.createElement('canvas');
  patch.width = 128;
  patch.height = 128;
  const ctx = patch.getContext('2d');
  ctx.fillStyle = `rgb(${Math.round(fallbackRgb[0])},${Math.round(fallbackRgb[1])},${Math.round(fallbackRgb[2])})`;
  ctx.fillRect(0, 0, 128, 128);
  ctx.drawImage(cropCanvas, sx, sy, sw, sh, 0, 0, 128, 128);
  return patch.toDataURL('image/png');
}

/**
 * Extract clean garment RGBA cutout + 3D clothing texture metadata using Rust WASM.
 */
export async function extractGarmentCutout(imgEl, { keepAccessories = false } = {}) {
  const maxDim = 640;
  const nw = imgEl.naturalWidth || imgEl.width;
  const nh = imgEl.naturalHeight || imgEl.height;
  const scale = Math.min(1, maxDim / Math.max(nw, nh));
  const w = Math.max(16, Math.round(nw * scale));
  const h = Math.max(16, Math.round(nh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imgEl, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);

  const parsed = await wasmExtractGarment(imgData.data, w, h, keepAccessories);
  imgData.data.set(parsed.rgba);
  ctx.putImageData(imgData, 0, 0);

  const cropW = Math.max(16, parsed.maxX - parsed.minX + 1);
  const cropH = Math.max(16, parsed.maxY - parsed.minY + 1);
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
  cropCtx.drawImage(canvas, parsed.minX, parsed.minY, cropW, cropH, 0, 0, cropW, cropH);

  // Measure shoulder & waist bounds on cropped canvas for 2D MLS control points
  const cropData = cropCtx.getImageData(0, 0, cropW, cropH).data;
  const measureBand = (f0, f1) => {
    const y0 = Math.max(0, Math.round(cropH * f0));
    const y1 = Math.min(cropH - 1, Math.round(cropH * f1));
    let lSum = 0, rSum = 0, n = 0;
    for (let y = y0; y <= y1; y++) {
      let minX = cropW, maxX = -1;
      for (let x = 0; x < cropW; x++) {
        if (cropData[(y * cropW + x) * 4 + 3] > 32) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
      if (maxX >= minX) {
        lSum += minX;
        rSum += maxX;
        n++;
      }
    }
    return n ? { l: lSum / n, r: rSum / n } : { l: 0, r: cropW };
  };

  const shBand = measureBand(0.06, 0.16);
  const chBand = measureBand(0.22, 0.32);
  const waBand = measureBand(0.38, 0.46);
  const hemBand = measureBand(0.82, 0.94);

  const upperTextureUrl = sampleFabricPatchDataUrl(cropCanvas, 0.14, 0.34, parsed.upperRgb);
  const lowerTextureUrl = sampleFabricPatchDataUrl(cropCanvas, 0.46, 0.70, parsed.lowerRgb);

  return {
    canvas: cropCanvas,
    rgba: cropData,
    width: cropW,
    height: cropH,
    spanFrac: parsed.spanFrac,
    bands: {
      shoulder: shBand,
      chest: chBand,
      waist: waBand,
      hem: hemBand,
    },
    clothing3D: {
      mode: 'outfit',
      isSkirt: parsed.isSkirt,
      longSleeves: parsed.longSleeves,
      longBottom: parsed.longBottom,
      upperRgb: parsed.upperRgb,
      lowerRgb: parsed.lowerRgb,
      shoeRgb: parsed.shoeRgb,
      accentRgb: parsed.accentRgb,
      upperTextureUrl,
      lowerTextureUrl,
    },
  };
}

function getSkeletonPx(anchors, W, H) {
  const px = (pt) => ({ x: pt.x * W, y: pt.y * H });
  const lArm = px(anchors.l_arm || { x: 0.42, y: 0.25 });
  const rArm = px(anchors.r_arm || { x: 0.58, y: 0.25 });
  const lElbow = px(anchors.l_elbow || { x: lArm.x - W * 0.04, y: lArm.y + H * 0.10 });
  const rElbow = px(anchors.r_elbow || { x: rArm.x + W * 0.04, y: rArm.y + H * 0.10 });
  const lWrist = px(anchors.l_wrist || { x: lElbow.x - W * 0.02, y: lElbow.y + H * 0.10 });
  const rWrist = px(anchors.r_wrist || { x: rElbow.x + W * 0.02, y: rElbow.y + H * 0.10 });
  const lLeg = px(anchors.l_leg || { x: 0.44, y: 0.50 });
  const rLeg = px(anchors.r_leg || { x: 0.56, y: 0.50 });

  // Screen left vs screen right
  const leftSide = lArm.x <= rArm.x;
  const leftSh = leftSide ? lArm : rArm;
  const rightSh = leftSide ? rArm : lArm;
  const leftElb = leftSide ? lElbow : rElbow;
  const rightElb = leftSide ? rElbow : lElbow;
  const leftWri = leftSide ? lWrist : rWrist;
  const rightWri = leftSide ? rWrist : lWrist;
  const leftHip = lLeg.x <= rLeg.x ? lLeg : rLeg;
  const rightHip = lLeg.x <= rLeg.x ? rLeg : lLeg;

  const neck = px(anchors.neck || { x: 0.5, y: 0.19 });
  const chest = px(anchors.chest || { x: (leftSh.x + rightSh.x) * 0.5, y: (leftSh.y + rightSh.y) * 0.5 + 15 });
  const waist = px(anchors.waist || { x: (chest.x + (leftHip.x + rightHip.x) * 0.5) * 0.5, y: (chest.y + (leftHip.y + rightHip.y) * 0.5) * 0.5 });
  const pelvis = px(anchors.pelvis || { x: (leftHip.x + rightHip.x) * 0.5, y: (leftHip.y + rightHip.y) * 0.5 });
  const lKnee = px(anchors.l_knee || { x: leftHip.x, y: leftHip.y + H * 0.20 });
  const rKnee = px(anchors.r_knee || { x: rightHip.x, y: rightHip.y + H * 0.20 });
  const lAnkle = px(anchors.l_ankle || { x: leftHip.x, y: leftHip.y + H * 0.38 });
  const rAnkle = px(anchors.r_ankle || { x: rightHip.x, y: rightHip.y + H * 0.38 });

  return {
    neck, leftSh, rightSh, leftElb, rightElb, leftWri, rightWri,
    chest, waist, pelvis, leftHip, rightHip,
    kneeMid: { x: (lKnee.x + rKnee.x) * 0.5, y: (lKnee.y + rKnee.y) * 0.5 },
    ankleMid: { x: (lAnkle.x + rAnkle.x) * 0.5, y: (lAnkle.y + rAnkle.y) * 0.5 },
  };
}

/**
 * Render the combined Fitting Room composite onto outCanvas.
 * - In '3d-wear' mode, the 3D body already wears real skinned 3D clothing; only the realistic 1:7.5 head is blended when facing camera.
 * - In '2d-mls' mode, Rust WASM Moving Least Squares warps the high-res garment onto the pose skeleton with articulated sleeves.
 */
export async function renderFittingComposite({
  outCanvas,
  bodyImage,
  bodyIs3D = true,
  fitMode = '2d-mls',
  anchors,
  garment,
  headCanvas,
  headMeta,
  skinHex = '#edd4c2',
  fit = {},
}) {
  const W = outCanvas.width;
  const H = outCanvas.height;
  const ctx = outCanvas.getContext('2d');

  // 1. Clean studio backdrop
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#f4f6fb');
  grad.addColorStop(0.75, '#ebeef6');
  grad.addColorStop(1, '#e2e6f0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const sk = getSkeletonPx(anchors, W, H);
  const shSpan = Math.max(44, Math.hypot(sk.rightSh.x - sk.leftSh.x, sk.rightSh.y - sk.leftSh.y));
  const torsoH = Math.max(60, Math.hypot(sk.pelvis.x - sk.neck.x, sk.pelvis.y - sk.neck.y));
  const bodyFullH = Math.max(torsoH * 2.1, Math.hypot(sk.ankleMid.x - sk.neck.x, sk.ankleMid.y - sk.neck.y));

  // Subtle floor shadow
  ctx.save();
  ctx.fillStyle = 'rgba(28, 35, 60, 0.09)';
  ctx.beginPath();
  ctx.ellipse(sk.ankleMid.x * 0.4 + sk.pelvis.x * 0.6, Math.min(H - 22, sk.ankleMid.y + 18), shSpan * 0.9, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const headFacingFront = anchors.headFacingFront ?? 1;
  const showCustomHead = Boolean(headCanvas && anchors.neck && (!bodyIs3D || fitMode !== '3d-wear' || headFacingFront > 0.50));

  // 2. Body layer
  if (bodyImage) {
    const bodyBuf = document.createElement('canvas');
    bodyBuf.width = W;
    bodyBuf.height = H;
    const bCtx = bodyBuf.getContext('2d');
    if (bodyIs3D) {
      bCtx.drawImage(bodyImage, 0, 0, W, H);
    } else {
      const iw = bodyImage.naturalWidth || bodyImage.width;
      const ih = bodyImage.naturalHeight || bodyImage.height;
      const s = Math.min(W / iw, H / ih);
      const dw = iw * s, dh = ih * s;
      bCtx.drawImage(bodyImage, (W - dw) * 0.5, (H - dh) * 0.5, dw, dh);
    }

    if (showCustomHead && anchors.head && anchors.neck) {
      const hx = anchors.head.x * W;
      const hy = anchors.head.y * H;
      const nx = anchors.neck.x * W;
      const ny = anchors.neck.y * H;
      const headSize = Math.max(20, Math.hypot(hx - nx, hy - ny));
      // Erase only the cranium/face above jaw so the neck & garment collar stay 100% solid
      bCtx.save();
      bCtx.globalCompositeOperation = 'destination-out';
      bCtx.translate(hx, hy - headSize * 0.55);
      bCtx.rotate(anchors.headRoll || 0);
      bCtx.fillStyle = '#000';
      bCtx.beginPath();
      bCtx.ellipse(0, 0, headSize * 0.95, headSize * 1.32, 0, 0, Math.PI * 2);
      bCtx.fill();
      bCtx.restore();
    }
    ctx.save();
    if (!bodyIs3D) ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(bodyBuf, 0, 0);
    ctx.restore();
  }

  // 3. Garment layer (only in 2d-mls mode; in 3d-wear mode, clothing is already 3D-skinned in bodyImage!)
  if (garment && fitMode !== '3d-wear') {
    const gScale = fit.outfitScale ?? 1;
    const gWidthScale = fit.outfitWidth ?? 1;
    const gOx = (fit.outfitX ?? 0) * W;
    const gOy = (fit.outfitY ?? 0) * H;

    const gw = garment.width, gh = garment.height;
    const chestBandSpan = Math.max(20, garment.bands.chest.r - garment.bands.chest.l);
    const shBandSpan = Math.max(20, garment.bands.shoulder.r - garment.bands.shoulder.l);
    const refSpan = shBandSpan * 0.45 + chestBandSpan * 0.55;
    const targetCoreW = Math.max(shSpan * 1.48, torsoH * 0.94) * gScale * gWidthScale;
    const targetHalfW = (gw / refSpan) * targetCoreW * 0.5;
    const spanFrac = garment.spanFrac || 0.78;
    const targetHeight = bodyFullH * Math.min(1.06, spanFrac / 0.78) * gScale;

    const shMid = {
      x: (sk.leftSh.x + sk.rightSh.x) * 0.5 * 0.65 + sk.neck.x * 0.35 + gOx,
      y: (sk.leftSh.y + sk.rightSh.y) * 0.5 * 0.65 + sk.neck.y * 0.35 - shSpan * 0.14 + gOy,
    };
    const shAngle = Math.atan2(sk.rightSh.y - sk.leftSh.y, sk.rightSh.x - sk.leftSh.x);
    const hipAngle = Math.atan2(sk.rightHip.y - sk.leftHip.y, sk.rightHip.x - sk.leftHip.x);
    const rot = (center, dx, dy, ang) => ({
      x: center.x + dx * Math.cos(ang) - dy * Math.sin(ang),
      y: center.y + dx * Math.sin(ang) + dy * Math.cos(ang),
    });

    const waistCenter = { x: sk.waist.x + gOx, y: shMid.y + targetHeight * 0.41 };
    const legT = Math.max(0, Math.min(1, (spanFrac - 0.38) / 0.44));
    const lowerTarget = legT < 0.5
      ? { x: sk.pelvis.x * (1 - legT * 2) + sk.kneeMid.x * (legT * 2), y: sk.pelvis.y * (1 - legT * 2) + sk.kneeMid.y * (legT * 2) }
      : { x: sk.kneeMid.x * (1 - (legT - 0.5) * 2) + sk.ankleMid.x * ((legT - 0.5) * 2), y: sk.kneeMid.y * (1 - (legT - 0.5) * 2) + sk.ankleMid.y * ((legT - 0.5) * 2) };
    const hemCenter = { x: (lowerTarget.x * 0.75 + waistCenter.x * 0.25) + gOx, y: shMid.y + targetHeight };

    // Build 13 anatomical MLS control pairs (collar, shoulders, elbows, wrists, waist, hips, hem)
    const srcPts = [
      gw * 0.5, gh * 0.04,
      garment.bands.shoulder.l, gh * 0.12,
      garment.bands.shoulder.r, gh * 0.12,
      Math.max(2, garment.bands.shoulder.l - gw * 0.06), gh * 0.28,
      Math.min(gw - 2, garment.bands.shoulder.r + gw * 0.06), gh * 0.28,
      Math.max(2, garment.bands.shoulder.l - gw * 0.08), gh * 0.43,
      Math.min(gw - 2, garment.bands.shoulder.r + gw * 0.08), gh * 0.43,
      garment.bands.waist.l, gh * 0.41,
      gw * 0.5, gh * 0.41,
      garment.bands.waist.r, gh * 0.41,
      garment.bands.hem.l * 0.5 + garment.bands.waist.l * 0.5, gh * 0.95,
      gw * 0.5, gh * 0.95,
      garment.bands.hem.r * 0.5 + garment.bands.waist.r * 0.5, gh * 0.95,
    ];

    // Gently blend outer sleeve cuffs toward pose elbows/wrists without distorting torso coats
    const blendPt = (base, target, alpha) => ({
      x: base.x * (1 - alpha) + target.x * alpha,
      y: base.y * (1 - alpha) + target.y * alpha,
    });
    const dShL = rot(shMid, -targetHalfW * 0.68, targetHeight * 0.10, shAngle);
    const dShR = rot(shMid, targetHalfW * 0.68, targetHeight * 0.10, shAngle);
    const dElbL = blendPt(rot(shMid, -targetHalfW * 0.85, targetHeight * 0.26, shAngle), { x: sk.leftElb.x + gOx, y: sk.leftElb.y + gOy }, 0.48);
    const dElbR = blendPt(rot(shMid, targetHalfW * 0.85, targetHeight * 0.26, shAngle), { x: sk.rightElb.x + gOx, y: sk.rightElb.y + gOy }, 0.48);
    const dWriL = blendPt(rot(shMid, -targetHalfW * 0.88, targetHeight * 0.41, shAngle), { x: sk.leftWri.x + gOx, y: sk.leftWri.y + gOy }, 0.42);
    const dWriR = blendPt(rot(shMid, targetHalfW * 0.88, targetHeight * 0.41, shAngle), { x: sk.rightWri.x + gOx, y: sk.rightWri.y + gOy }, 0.42);
    const dWaL = rot(waistCenter, -targetHalfW * 0.78, 0, (shAngle + hipAngle) * 0.5);
    const dWaR = rot(waistCenter, targetHalfW * 0.78, 0, (shAngle + hipAngle) * 0.5);
    const dHemL = rot(hemCenter, -targetHalfW * 0.86, -targetHeight * 0.05, hipAngle);
    const dHemR = rot(hemCenter, targetHalfW * 0.86, -targetHeight * 0.05, hipAngle);

    const dstPts = [
      shMid.x, shMid.y + targetHeight * 0.03,
      dShL.x, dShL.y,
      dShR.x, dShR.y,
      dElbL.x, dElbL.y,
      dElbR.x, dElbR.y,
      dWriL.x, dWriL.y,
      dWriR.x, dWriR.y,
      dWaL.x, dWaL.y,
      waistCenter.x, waistCenter.y,
      dWaR.x, dWaR.y,
      dHemL.x, dHemL.y,
      hemCenter.x, hemCenter.y - targetHeight * 0.05,
      dHemR.x, dHemR.y,
    ];

    const allX = dstPts.filter((_, i) => i % 2 === 0);
    const allY = dstPts.filter((_, i) => i % 2 === 1);
    const pad = Math.max(80, shSpan * 0.9);
    const roi = {
      x0: Math.max(0, Math.min(...allX) - pad),
      y0: Math.max(0, Math.min(...allY) - pad * 0.5),
      x1: Math.min(W - 1, Math.max(...allX) + pad),
      y1: Math.min(H - 1, Math.max(...allY) + pad * 0.6),
    };

    const curFrame = ctx.getImageData(0, 0, W, H);
    const warped = await wasmMlsWarp(
      garment.rgba, gw, gh,
      curFrame.data, W, H,
      new Float32Array(srcPts), new Float32Array(dstPts),
      roi,
    );
    curFrame.data.set(warped);
    ctx.putImageData(curFrame, 0, 0);
  }

  // 4. Realistic 1:7.5 Human-Scale Head Layer with Rust WASM neck color harmonization
  if (showCustomHead) {
    const hScale = fit.headScale ?? 1;
    const hOx = (fit.headX ?? 0) * W;
    const hOy = (fit.headY ?? 0) * H;
    const hRot = (fit.headRot ?? 0) * (Math.PI / 180);

    const neckPx = { x: anchors.neck.x * W, y: anchors.neck.y * H };
    const headPx = anchors.head ? { x: anchors.head.x * W, y: anchors.head.y * H } : { x: neckPx.x, y: neckPx.y - torsoH * 0.22 };
    const topPx = anchors.headTop ? { x: anchors.headTop.x * W, y: anchors.headTop.y * H } : { x: neckPx.x, y: neckPx.y - torsoH * 0.42 };

    // Realistic ~1:7.2 body-to-head ratio (not bobblehead, not tiny)
    const anatHeadH = Math.hypot(topPx.x - neckPx.x, topPx.y - neckPx.y) * 1.04;
    const targetHeadH = Math.max(shSpan * 0.62, Math.min(shSpan * 0.78, anatHeadH)) * hScale;
    const targetHeadW = targetHeadH * (headCanvas.width / headCanvas.height);

    const chinAnchor = headMeta?.chinAnchor || { x: 0.5, y: 0.88 };
    const totalAngle = (anchors.headRoll || 0) + hRot;

    // Color-harmonize jaw boundary in Rust WASM
    const hCtx = headCanvas.getContext('2d', { willReadFrequently: true });
    const hData = hCtx.getImageData(0, 0, headCanvas.width, headCanvas.height);
    const blended = await wasmBlendHead(hData.data, headCanvas.width, headCanvas.height, hexToRgb(skinHex), chinAnchor.y);
    const headBuf = document.createElement('canvas');
    headBuf.width = headCanvas.width;
    headBuf.height = headCanvas.height;
    headBuf.getContext('2d').putImageData(new ImageData(blended, headCanvas.width, headCanvas.height), 0, 0);

    ctx.save();
    const anchorX = neckPx.x * 0.80 + headPx.x * 0.20 + hOx;
    const anchorY = neckPx.y * 0.96 + headPx.y * 0.04 + hOy;
    ctx.translate(anchorX, anchorY);
    ctx.rotate(totalAngle);
    ctx.drawImage(
      headBuf,
      -targetHeadW * chinAnchor.x,
      -targetHeadH * chinAnchor.y,
      targetHeadW,
      targetHeadH,
    );
    ctx.restore();
  }
}
