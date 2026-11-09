// Classic Web Worker: runs MediaPipe WASM FaceLandmarker, ImageSegmenter (multiclass) and PoseLandmarker.
importScripts('../studio/vendor/mediapipe/vision_bundle.js');

let filesetPromise = null;
let segmenter = null;
let faceLandmarker = null;
let poseLandmarker = null;

async function getFileset() {
  if (!filesetPromise) {
    const base = new URL('../studio/vendor/mediapipe/', self.location.href).href;
    filesetPromise = Vision.FilesetResolver.forVisionTasks(base + 'wasm');
  }
  return filesetPromise;
}

async function getHeadModels() {
  const base = new URL('../studio/vendor/mediapipe/', self.location.href).href;
  const files = await getFileset();
  if (!faceLandmarker) {
    self.postMessage({ phase: 'loadingFace' });
    faceLandmarker = await Vision.FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: base + 'face_landmarker.task', delegate: 'CPU' },
      runningMode: 'IMAGE',
      numFaces: 1,
      minFaceDetectionConfidence: 0.4,
      minFacePresenceConfidence: 0.4,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
  }
  if (!segmenter) {
    self.postMessage({ phase: 'loadingSegmenter' });
    segmenter = await Vision.ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: base + 'selfie_multiclass_256x256.tflite', delegate: 'CPU' },
      runningMode: 'IMAGE',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
  }
  return { faceLandmarker, segmenter };
}

async function getPoseModel() {
  if (!poseLandmarker) {
    const base = new URL('../studio/vendor/mediapipe/', self.location.href).href;
    const files = await getFileset();
    self.postMessage({ phase: 'loadingPose' });
    poseLandmarker = await Vision.PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: base + 'pose_landmarker_full.task', delegate: 'CPU' },
      runningMode: 'IMAGE',
      numPoses: 1,
      minPoseDetectionConfidence: 0.35,
      minPosePresenceConfidence: 0.35,
      outputSegmentationMasks: false,
    });
  }
  return poseLandmarker;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')).join('');
}

function sampleCheekSkin(rgba, width, height, landmarks) {
  // Left & right cheek landmarks in MediaPipe 478-point mesh
  const indices = [50, 118, 205, 280, 347, 425];
  let r = 0, g = 0, b = 0, n = 0;
  for (const idx of indices) {
    const pt = landmarks[idx];
    if (!pt) continue;
    const cx = clamp(Math.round(pt.x * width), 2, width - 3);
    const cy = clamp(Math.round(pt.y * height), 2, height - 3);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const off = ((cy + dy) * width + (cx + dx)) * 4;
        r += rgba[off];
        g += rgba[off + 1];
        b += rgba[off + 2];
        n++;
      }
    }
  }
  if (!n) return '#edd4c2';
  // Slightly soften saturation/brightness so mannequin skin looks natural
  return rgbToHex(r / n, g / n, b / n);
}

function handleCutoutHead(bitmap) {
  const w = bitmap.width;
  const h = bitmap.height;
  const srcCanvas = new OffscreenCanvas(w, h);
  const srcCtx = srcCanvas.getContext('2d');
  srcCtx.drawImage(bitmap, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, w, h).data;

  self.postMessage({ phase: 'detectingFace' });
  const faceRes = faceLandmarker.detect(bitmap);
  const landmarks = faceRes.faceLandmarks?.[0];
  if (!landmarks || landmarks.length < 400) {
    throw Error('noFaceDetected');
  }

  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const faceW = Math.max(0.05, maxX - minX);
  const faceH = Math.max(0.05, maxY - minY);
  const faceCx = (minX + maxX) * 0.5;
  const faceCy = (minY + maxY) * 0.5;

  // Eye angle -> head roll in radians
  const lEye = landmarks[33];
  const rEye = landmarks[263];
  const rollRad = lEye && rEye ? Math.atan2((rEye.y - lEye.y) * h, (rEye.x - lEye.x) * w) : 0;
  const chinY = (landmarks[152]?.y ?? maxY) * h;
  const foreY = (landmarks[10]?.y ?? minY) * h;
  const skinHex = sampleCheekSkin(srcData, w, h, landmarks);

  // Run multiclass segmentation on an upper-body-centered square crop so shoulders & clothes are separated cleanly
  const segSide = Math.min(Math.max(w, h), Math.round(Math.max(faceW * w, faceH * h) * 3.8));
  const segSize = Math.max(256, segSide);
  const segX = clamp(Math.round(faceCx * w - segSize * 0.5), 0, Math.max(0, w - segSize));
  const segY = clamp(Math.round(faceCy * h - segSize * 0.40), 0, Math.max(0, h - segSize));
  const cropW = Math.min(segSize, w - segX);
  const cropH = Math.min(segSize, h - segY);

  const segCanvas = new OffscreenCanvas(cropW, cropH);
  segCanvas.getContext('2d').drawImage(bitmap, segX, segY, cropW, cropH, 0, 0, cropW, cropH);

  self.postMessage({ phase: 'segmentingHead' });
  const segRes = segmenter.segment(segCanvas);
  const masks = segRes.confidenceMasks;
  if (!masks || masks.length < 5) {
    throw Error('segmentFailed');
  }
  const mw = masks[0].width;
  const mh = masks[0].height;
  const bgMask = masks[0].getAsFloat32Array();
  const hairMask = masks[1].getAsFloat32Array();
  const bodyMask = masks[2].getAsFloat32Array();
  const faceMask = masks[3].getAsFloat32Array();
  const clothMask = masks[4].getAsFloat32Array();
  const accMask = masks[5] ? masks[5].getAsFloat32Array() : null;

  // Compute tight head crop box inside segCanvas (stop close to chin so white shirt collars stay out)
  const padLeft = Math.round(faceW * w * 0.68);
  const padRight = Math.round(faceW * w * 0.68);
  const padTop = Math.round(faceH * h * 0.72);
  const padBottom = Math.round(faceH * h * 0.08);

  const headX0 = clamp(Math.round(minX * w) - padLeft, segX, segX + cropW - 1);
  const headX1 = clamp(Math.round(maxX * w) + padRight, headX0 + 16, segX + cropW);
  const headY0 = clamp(Math.round(foreY) - padTop, segY, segY + cropH - 1);
  const headY1 = clamp(Math.round(chinY) + padBottom, headY0 + 16, segY + cropH);

  const outW = headX1 - headX0;
  const outH = headY1 - headY0;
  const outRgba = new Uint8ClampedArray(outW * outH * 4);

  const chinLocalY = chinY - headY0;
  const facePxH = Math.max(20, chinY - foreY);
  const facePxW = Math.max(20, faceW * w);
  const cxLocal = faceCx * w - headX0;

  let activeMinX = outW, activeMaxX = 0, activeMinY = outH, activeMaxY = 0;

  for (let y = 0; y < outH; y++) {
    const sy = headY0 + y;
    const my = clamp(((sy - segY) / cropH) * mh, 0, mh - 1);
    const my0 = Math.floor(my);
    const my1 = Math.min(mh - 1, my0 + 1);
    const ty = my - my0;

    // Below chin: cleanly cut neck/collar except flowing side-hair strands
    const belowChin = (y - chinLocalY) / facePxH;
    const jawCutoff = 1 - smoothstep(-0.07, 0.01, belowChin);

    for (let x = 0; x < outW; x++) {
      const sx = headX0 + x;
      const mx = clamp(((sx - segX) / cropW) * mw, 0, mw - 1);
      const mx0 = Math.floor(mx);
      const mx1 = Math.min(mw - 1, mx0 + 1);
      const tx = mx - mx0;

      const sample = (arr) => {
        const v00 = arr[my0 * mw + mx0];
        const v10 = arr[my0 * mw + mx1];
        const v01 = arr[my1 * mw + mx0];
        const v11 = arr[my1 * mw + mx1];
        return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
      };

      const bg = sample(bgMask);
      const hair = sample(hairMask);
      const body = sample(bodyMask);
      const face = sample(faceMask);
      const cloth = sample(clothMask);
      const acc = accMask ? sample(accMask) : 0;

      const dxNorm = Math.abs(x - cxLocal) / (facePxW * 0.34);
      const neckAllowance = belowChin < 0.0 && dxNorm < 1 ? (1 - dxNorm) * 0.45 : 0;
      const headCore = Math.max(hair, face, acc * 0.85, body * neckAllowance);
      let score = headCore - bg * 0.65 - cloth * 1.25;
      if (belowChin > -0.07 && hair < 0.65) {
        score *= jawCutoff;
      }

      const alpha = Math.round(smoothstep(0.28, 0.62, score) * 255);
      if (alpha > 8) {
        if (x < activeMinX) activeMinX = x;
        if (x > activeMaxX) activeMaxX = x;
        if (y < activeMinY) activeMinY = y;
        if (y > activeMaxY) activeMaxY = y;
      }

      const srcOff = (sy * w + sx) * 4;
      const dstOff = (y * outW + x) * 4;
      outRgba[dstOff] = srcData[srcOff];
      outRgba[dstOff + 1] = srcData[srcOff + 1];
      outRgba[dstOff + 2] = srcData[srcOff + 2];
      outRgba[dstOff + 3] = alpha;
    }
  }

  for (const m of masks) m.close();

  if (activeMaxX <= activeMinX || activeMaxY <= activeMinY) {
    throw Error('cutoutEmpty');
  }

  // Tightly crop around opaque head pixels with 4px margin and scale to <= 192px
  const trimX = Math.max(0, activeMinX - 4);
  const trimY = Math.max(0, activeMinY - 4);
  const trimW = Math.min(outW - trimX, activeMaxX - trimX + 5);
  const trimH = Math.min(outH - trimY, activeMaxY - trimY + 5);

  const trimCanvas = new OffscreenCanvas(outW, outH);
  trimCanvas.getContext('2d').putImageData(new ImageData(outRgba, outW, outH), 0, 0);

  const maxDim = 192;
  const scale = Math.min(1, maxDim / Math.max(trimW, trimH));
  const finalW = Math.max(32, Math.round(trimW * scale));
  const finalH = Math.max(32, Math.round(trimH * scale));
  const finalCanvas = new OffscreenCanvas(finalW, finalH);
  const fCtx = finalCanvas.getContext('2d');
  fCtx.drawImage(trimCanvas, trimX, trimY, trimW, trimH, 0, 0, finalW, finalH);
  const finalImage = fCtx.getImageData(0, 0, finalW, finalH);

  // Normalized chin anchor inside the final tight head box (so head aligns right on 3D neck!)
  const chinNormY = clamp((chinLocalY - trimY) / trimH, 0.55, 0.98);
  const chinNormX = clamp((cxLocal - trimX) / trimW, 0.25, 0.75);

  return {
    width: finalW,
    height: finalH,
    rgba: finalImage.data.buffer,
    skinHex,
    rollRad,
    chinAnchor: { x: chinNormX, y: chinNormY },
  };
}

function handleDetectPose2D(bitmap) {
  const res = poseLandmarker.detect(bitmap);
  const lm = res.landmarks?.[0];
  if (!lm) return { anchors: null };
  const mapIdx = {
    head: 0,
    l_arm: 11,
    r_arm: 12,
    l_elbow: 13,
    r_elbow: 14,
    l_wrist: 15,
    r_wrist: 16,
    l_leg: 23,
    r_leg: 24,
    l_knee: 25,
    r_knee: 26,
    l_ankle: 27,
    r_ankle: 28,
  };
  const anchors = {};
  for (const [k, idx] of Object.entries(mapIdx)) {
    const p = lm[idx];
    if (p) anchors[k] = { x: p.x, y: p.y, z: p.z || 0, v: Math.min(p.visibility ?? 1, p.presence ?? 1) };
  }
  if (anchors.l_arm && anchors.r_arm) {
    anchors.chest = {
      x: (anchors.l_arm.x + anchors.r_arm.x) * 0.5,
      y: (anchors.l_arm.y + anchors.r_arm.y) * 0.5,
      z: ((anchors.l_arm.z || 0) + (anchors.r_arm.z || 0)) * 0.5,
    };
  }
  if (anchors.l_leg && anchors.r_leg) {
    anchors.pelvis = {
      x: (anchors.l_leg.x + anchors.r_leg.x) * 0.5,
      y: (anchors.l_leg.y + anchors.r_leg.y) * 0.5,
      z: ((anchors.l_leg.z || 0) + (anchors.r_leg.z || 0)) * 0.5,
    };
  }
  if (anchors.chest && anchors.pelvis) {
    anchors.waist = {
      x: anchors.chest.x * 0.4 + anchors.pelvis.x * 0.6,
      y: anchors.chest.y * 0.4 + anchors.pelvis.y * 0.6,
      z: (anchors.chest.z + anchors.pelvis.z) * 0.5,
    };
  }
  if (anchors.head && anchors.chest) {
    anchors.neck = {
      x: anchors.head.x * 0.35 + anchors.chest.x * 0.65,
      y: anchors.head.y * 0.45 + anchors.chest.y * 0.55,
      z: (anchors.head.z + anchors.chest.z) * 0.5,
    };
    const headDist = Math.hypot(anchors.head.x - anchors.neck.x, anchors.head.y - anchors.neck.y);
    anchors.headTop = {
      x: anchors.head.x,
      y: Math.max(0.02, anchors.head.y - headDist * 1.1),
      z: anchors.head.z,
    };
    anchors.headRoll = 0;
    if (lm[7] && lm[8]) {
      anchors.headRoll = Math.atan2((lm[8].y - lm[7].y) * bitmap.height, (lm[8].x - lm[7].x) * bitmap.width);
    }
  }
  return { anchors };
}

self.onmessage = async ({ data }) => {
  const { id, task, bitmap } = data;
  try {
    if (task === 'cutoutHead') {
      await getHeadModels();
      const out = handleCutoutHead(bitmap);
      self.postMessage({ id, ok: true, result: out }, [out.rgba]);
    } else if (task === 'detectPose2D') {
      await getPoseModel();
      const out = handleDetectPose2D(bitmap);
      self.postMessage({ id, ok: true, result: out });
    } else {
      throw Error('Unknown worker task: ' + task);
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err.message || err) });
  } finally {
    bitmap?.close();
  }
};
