// Browser WebAssembly loader & zero-copy memory helpers for fitting/fit_warp.wasm.
let wasmPromise = null;

export async function loadWarpWasm() {
  if (!wasmPromise) {
    wasmPromise = (async () => {
      const url = new URL('./fit_warp.wasm', import.meta.url);
      const res = await fetch(url);
      if (!res.ok) throw Error('Failed to load fit_warp.wasm');
      const bytes = await res.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(bytes);
      return instance.exports;
    })();
  }
  return wasmPromise;
}

export async function wasmExtractGarment(rgbaUint8, width, height, keepAccessories = false) {
  const ex = await loadWarpWasm();
  const byteLen = rgbaUint8.byteLength;
  const rgbaPtr = ex.alloc(byteLen);
  const metricsPtr = ex.alloc(20 * 4);
  try {
    new Uint8Array(ex.memory.buffer, rgbaPtr, byteLen).set(rgbaUint8);
    const ok = ex.extract_garment_rgba(rgbaPtr, width, height, keepAccessories ? 1 : 0, metricsPtr);
    if (!ok) throw Error('WASM garment extraction failed');
    const outRgba = new Uint8ClampedArray(byteLen);
    outRgba.set(new Uint8Array(ex.memory.buffer, rgbaPtr, byteLen));
    const m = new Float32Array(ex.memory.buffer, metricsPtr, 20);
    return {
      rgba: outRgba,
      minX: Math.round(m[0]),
      minY: Math.round(m[1]),
      maxX: Math.round(m[2]),
      maxY: Math.round(m[3]),
      spanFrac: m[4],
      isSkirt: m[5] > 0.5,
      longSleeves: m[6] > 0.5,
      longBottom: m[7] > 0.5,
      upperRgb: [m[8], m[9], m[10]],
      lowerRgb: [m[11], m[12], m[13]],
      shoeRgb: [m[14], m[15], m[16]],
      accentRgb: [m[17], m[18], m[19]],
    };
  } finally {
    ex.dealloc(rgbaPtr, byteLen);
    ex.dealloc(metricsPtr, 20 * 4);
  }
}

export async function wasmMlsWarp(srcRgba, sw, sh, dstRgba, dw, dh, srcPtsFlat, dstPtsFlat, roi) {
  const ex = await loadWarpWasm();
  const sLen = srcRgba.byteLength;
  const dLen = dstRgba.byteLength;
  const pLen = srcPtsFlat.length * 4;
  const sPtr = ex.alloc(sLen);
  const dPtr = ex.alloc(dLen);
  const spPtr = ex.alloc(pLen);
  const dpPtr = ex.alloc(pLen);
  try {
    new Uint8Array(ex.memory.buffer, sPtr, sLen).set(srcRgba);
    new Uint8Array(ex.memory.buffer, dPtr, dLen).set(dstRgba);
    new Float32Array(ex.memory.buffer, spPtr, srcPtsFlat.length).set(srcPtsFlat);
    new Float32Array(ex.memory.buffer, dpPtr, dstPtsFlat.length).set(dstPtsFlat);
    ex.mls_warp_rgba(
      sPtr, sw, sh,
      dPtr, dw, dh,
      spPtr, dpPtr, srcPtsFlat.length / 2,
      Math.round(roi.x0), Math.round(roi.y0), Math.round(roi.x1), Math.round(roi.y1),
    );
    const out = new Uint8ClampedArray(dLen);
    out.set(new Uint8Array(ex.memory.buffer, dPtr, dLen));
    return out;
  } finally {
    ex.dealloc(sPtr, sLen);
    ex.dealloc(dPtr, dLen);
    ex.dealloc(spPtr, pLen);
    ex.dealloc(dpPtr, pLen);
  }
}

export async function wasmBlendHead(headRgba, hw, hh, targetRgb, chinYNorm) {
  const ex = await loadWarpWasm();
  const len = headRgba.byteLength;
  const ptr = ex.alloc(len);
  try {
    new Uint8Array(ex.memory.buffer, ptr, len).set(headRgba);
    ex.blend_head_rgba(ptr, hw, hh, targetRgb[0], targetRgb[1], targetRgb[2], chinYNorm);
    const out = new Uint8ClampedArray(len);
    out.set(new Uint8Array(ex.memory.buffer, ptr, len));
    return out;
  } finally {
    ex.dealloc(ptr, len);
  }
}
