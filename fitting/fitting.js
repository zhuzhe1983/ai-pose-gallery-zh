import { cutoutHeadFromSource, decodeHeadPayload, detectPose2DAnchors } from './head-cutout.js';
import { extractGarmentCutout, renderFittingComposite } from './outfit-warp.js';
import { buildFittingShareURL, decodeFittingState, readFittingHash } from './share-url.js';

const I18N = {
  zh: {
    pageTitle: 'FitRoom 虚拟试衣间｜拍照抠头 · 姿势×女装搭配 · 纯静态分享',
    wipNote: '我知道目前 3D 试衣的效果还很搞笑：衣服像纸片一样悬在素体上。这是纯静态 WASM 换装的第一版占位实现，真实穿衣、袖口/领口贴合与真实头身比仍在打磨中，请先当成「姿势 × 女装 × 头像」的三合一参考草图看，谢谢耐心。',
    brandSub: 'Virtual Fitting Room',
    poseGallery: '姿势图库',
    wardrobe: '虚拟试衣间',
    studio: '3D 摆姿',
    credits: '版权与致谢',
    language: '语言',
    mode3d: '3D 蒙皮真穿衣',
    mode2d: 'Rust WASM MLS',
    fmodeAuto: '智能切换',
    fmode3d: '3D 真穿衣',
    fmode2d: '高清原图',
    viewF: '正面', viewD: '斜侧', viewS: '侧面', viewHi: '俯视', viewLo: '仰视',
    dragHead: '拖动头像', dragOutfit: '拖动衣服',
    copyShare: '🔗 复制试衣分享链接',
    downloadPng: '📸 下载试衣成图 PNG',
    randomize: '🎲 随机搭配',
    sharePrivacy: '纯静态 URL 碎片分享（#f=），无需服务器；自定义头像字节直接编入链接中，请仅分享给信任的人。',
    shareCopied: '分享链接已复制（长度 {size}）！打开链接即可直接还原当前试衣效果。',
    shareReady: '分享链接已生成（长度 {size}），请手动复制下方地址。',
    tuneToggle: '微调位置、比例与肤色（画布上可直接拖动）',
    headScale: '头像大小', headRot: '头像旋转',
    outfitScale: '服装缩放', outfitWidth: '服装宽度', outfitOffsetY: '服装上下偏移',
    syncSkin: '自动匹配脸颊肤色', keepAcc: '保留鞋帽配饰', resetTune: '重置微调',
    tabPose: '1. 换姿势', tabOutfit: '2. 换女装', tabHead: '3. 换头像',
    psrcWs: 'WaveSpeed', psrc3d: '3D 立体素体', psrcClassic: '原版姿势',
    editInStudio: '在 3D 工作台自定义姿势 ↗',
    olibReal: '写实女装', olibAnime: '二次元',
    uploadOutfit: '上传服装图', uploadPair: '上下装拼图',
    openCamera: '📷 摄像头拍照抠头', uploadHead: '📁 上传照片抠头', clearHead: '仅显示素体',
    headPrivacy: '摄像头拍照与 MediaPipe WASM 抠头完全在本地浏览器运行，绝不上传照片；首次启用需加载本地 ~20 MB 分割模型（仅加载一次，自动缓存）。',
    secAll: '全部造型', secFace: '脸部特写', secStyling: '造型全身',
    allCats: '全部分类', allHair: '全部发型', loadMore: '加载更多',
    camTitle: '摄像头拍照抠头',
    camHint: '请正对镜头将头部置于虚线椭圆内，光线均匀时头发和下巴边缘抠图最清晰。',
    camSnap: '拍照并自动抠头', cancel: '取消',
    camDenied: '无法打开摄像头，请检查浏览器权限或改用“上传照片抠头”。',
    loadingFace: '正在加载本地 WASM 人脸定位模型…',
    loadingSegmenter: '正在加载本地 WASM 头发/人脸分割模型…',
    detectingFace: '正在定位五官与肤色…',
    segmentingHead: '正在剥离背景与原衣服…',
    loadingPose: '正在识别 2D 姿势骨骼锚点…',
    rendering3d: '正在渲染 3D 素体姿态…',
    cuttingOutfit: '正在提取服装轮廓…',
    noFaceDetected: '未识别到清晰正面人脸，请换一张正面照或靠近镜头重试。',
    summaryPose: '姿势', summaryOutfit: '服装', summaryHead: '头像',
    noneHead: '未贴头像（纯素体）', customUpload: '本地上传',
    footerLine1: 'FitRoom · 女装素材 © paipiange/nvzhuang (MIT) · AI 模特 © あぎ / ai-portrait-gallery (CC0 1.0)',
    footerLine2: '姿势参考 © ギア & WaveSpeed AI · 3D 工作台 GPL-3.0-only · 维护：zhuzhe1983 & Anhao · 致谢：LINUX DO',
    datasetInfo: '素材说明',
  },
  en: {
    pageTitle: 'FitRoom · Virtual Fitting Room | Static Head Cutout & Share',
    wipNote: 'I admit the current 3D fit looks plain silly: the garment floats on the body like a paper doll. This is the first placeholder pass of a fully static WASM fit — true garments, collar/cuff contact and realistic head proportions are still being refined. For now, treat it as a "pose × outfit × head" reference sketch. Thanks for your patience.',
    brandSub: 'Virtual Fitting Room',
    poseGallery: 'Poses', wardrobe: 'Fitting Room', studio: '3D Studio', credits: 'Credits', language: 'Language',
    mode3d: '3D Skinned Wear', mode2d: 'Rust WASM MLS',
    fmodeAuto: 'Auto', fmode3d: '3D Wear', fmode2d: '2D MLS',
    viewF: 'Front', viewD: '¾ View', viewS: 'Side', viewHi: 'Above', viewLo: 'Below',
    dragHead: 'Drag head', dragOutfit: 'Drag outfit',
    copyShare: '🔗 Copy Share Link', downloadPng: '📸 Download Poster PNG', randomize: '🎲 Random Mix',
    sharePrivacy: 'Pure static URL fragment (#f=), zero backend. Custom head bytes live inside the URL; share only with people you trust.',
    shareCopied: 'Share link copied ({size})! Opening it restores this exact look.',
    shareReady: 'Share link ready ({size}). Copy the URL below.',
    tuneToggle: 'Fine-tune position, scale & skin tone (or drag on canvas)',
    headScale: 'Head scale', headRot: 'Head tilt',
    outfitScale: 'Outfit scale', outfitWidth: 'Outfit width', outfitOffsetY: 'Vertical offset',
    syncSkin: 'Match cheek skin tone', keepAcc: 'Keep hats & shoes', resetTune: 'Reset adjustments',
    tabPose: '1. Pose', tabOutfit: '2. Outfit', tabHead: '3. Head',
    psrcWs: 'WaveSpeed', psrc3d: '3D Figures', psrcClassic: 'Classic Line Art',
    editInStudio: 'Edit pose in 3D Studio ↗',
    olibReal: 'Realistic', olibAnime: 'Anime',
    uploadOutfit: 'Upload garment', uploadPair: 'Top + bottom mix',
    openCamera: '📷 Camera Head Cutout', uploadHead: '📁 Upload Photo Cutout', clearHead: 'Body only',
    headPrivacy: 'Camera capture and MediaPipe WASM segmentation run 100% locally in your browser; first use loads ~20 MB local models once and caches them.',
    secAll: 'All shots', secFace: 'Face close-up', secStyling: 'Styling shot',
    allCats: 'All categories', allHair: 'All hairstyles', loadMore: 'Load more',
    camTitle: 'Camera Head Cutout',
    camHint: 'Center your face inside the oval with even lighting for clean hair & chin edges.',
    camSnap: 'Capture & Cut Out Head', cancel: 'Cancel',
    camDenied: 'Camera unavailable. Check permissions or use Upload Photo.',
    loadingFace: 'Loading local WASM face landmark model…',
    loadingSegmenter: 'Loading local WASM head/hair segmenter…',
    detectingFace: 'Detecting face landmarks & skin tone…',
    segmentingHead: 'Cutting out head & hair…',
    loadingPose: 'Detecting 2D pose skeleton…',
    rendering3d: 'Rendering 3D body pose…',
    cuttingOutfit: 'Extracting garment silhouette…',
    noFaceDetected: 'No clear face detected. Try a brighter front-facing photo.',
    summaryPose: 'Pose', summaryOutfit: 'Outfit', summaryHead: 'Head',
    noneHead: 'None (body only)', customUpload: 'Custom upload',
    footerLine1: 'FitRoom · Outfits © paipiange/nvzhuang (MIT) · Portraits © あぎ / ai-portrait-gallery (CC0 1.0)',
    footerLine2: 'Poses © ギア & WaveSpeed AI · 3D Studio GPL-3.0-only · Maintained by zhuzhe1983 & Anhao · Thanks: LINUX DO',
    datasetInfo: 'Dataset README',
  },
  ja: {
    pageTitle: 'FitRoom バーチャル試着室｜カメラ切り抜き・静的リンク共有',
    wipNote: '正直、現段階の 3D 試着はかなりおかしい見た目です：服が紙のようにボディに浮いています。これは静的 WASM 試着の最初の仮実装で、実際の着衣・襟口袖口の合わせ・リアルな頭身比はまだ開発中です。まずは「ポーズ×服×顔」の組み合わせの参考としてご覧ください。ご辛抱ください。',
    brandSub: 'Virtual Fitting Room',
    poseGallery: 'ポーズ', wardrobe: '試着室', studio: '3D スタジオ', credits: 'クレジット', language: '言語',
    mode3d: '3D 立体着装', mode2d: 'Rust WASM MLS',
    fmodeAuto: '自動', fmode3d: '3D 立体着装', fmode2d: '原図 MLS',
    viewF: '正面', viewD: '斜め', viewS: '側面', viewHi: '俯瞰', viewLo: 'あおり',
    dragHead: '頭を移動', dragOutfit: '衣装を移動',
    copyShare: '🔗 共有リンクをコピー', downloadPng: '📸 PNG 画像を保存', randomize: '🎲 ランダム',
    sharePrivacy: '純粋な静的 URL フラグメント (#f=) で共有します。顔画像データは URL 内に保存されます。',
    shareCopied: '共有リンクをコピーしました（{size}）。',
    shareReady: '共有リンクを生成しました（{size}）。下の URL をコピーしてください。',
    tuneToggle: '位置・サイズ・肌色の微調整（キャンバス上でドラッグ可能）',
    headScale: '頭のサイズ', headRot: '頭の傾き',
    outfitScale: '衣装サイズ', outfitWidth: '衣装幅', outfitOffsetY: '上下位置',
    syncSkin: '肌色を 3D 素体に合わせる', keepAcc: '靴・帽子を残す', resetTune: 'リセット',
    tabPose: '1. ポーズ', tabOutfit: '2. 衣装', tabHead: '3. 顔・頭',
    psrcWs: 'WaveSpeed', psrc3d: '3D モデル', psrcClassic: 'クラシック線画',
    editInStudio: '3D スタジオで微調整 ↗',
    olibReal: 'リアル衣装', olibAnime: 'アニメ衣装',
    uploadOutfit: '衣装アップロード', uploadPair: '上下セット合成',
    openCamera: '📷 カメラで頭を切り抜く', uploadHead: '📁 写真から切り抜く', clearHead: '素体のみ',
    headPrivacy: 'カメラ撮影と MediaPipe WASM 切り抜きはブラウザ内で完結し、サーバーへ送信されません。',
    secAll: 'すべて', secFace: '顔アップ', secStyling: 'スタイリング',
    allCats: 'すべての分類', allHair: 'すべての髪型', loadMore: 'さらに表示',
    camTitle: 'カメラで頭を切り抜く',
    camHint: '楕円の中に顔が収まるよう調整して撮影してください。',
    camSnap: '撮影して切り抜く', cancel: 'キャンセル',
    camDenied: 'カメラを使用できません。写真アップロードをお試しください。',
    loadingFace: 'ローカル WASM 顔モデルを読み込み中…',
    loadingSegmenter: 'ローカル WASM 切り抜きモデルを読み込み中…',
    detectingFace: '顔と肌色を検出中…',
    segmentingHead: '背景と衣服を分離中…',
    loadingPose: '2D ポーズ骨格を検出中…',
    rendering3d: '3D ボディを描画中…',
    cuttingOutfit: '衣装シルエットを抽出中…',
    noFaceDetected: '顔を検出できませんでした。正面の明るい写真をお試しください。',
    summaryPose: 'ポーズ', summaryOutfit: '衣装', summaryHead: '顔',
    noneHead: 'なし（素体のみ）', customUpload: 'アップロード画像',
    footerLine1: 'FitRoom · 衣装 © paipiange/nvzhuang (MIT) · モデル顔 © あぎ / ai-portrait-gallery (CC0 1.0)',
    footerLine2: 'ポーズ © ギア & WaveSpeed AI · 3D Studio GPL-3.0-only · 管理：zhuzhe1983 & Anhao',
    datasetInfo: 'データ説明',
  },
};

const params = new URLSearchParams(location.search);
let savedLang = '';
try { savedLang = localStorage.getItem('pose-language') || ''; } catch {}
const reqLang = params.get('lang') || savedLang || 'zh';
const LANG = Object.hasOwn(I18N, reqLang) ? reqLang : 'zh';
const t = (key, vars = {}) => (I18N[LANG][key] || key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Data stores
let wsPoses = [];
let classicPoses = [];
let pose3DSet = new Set();
let nvCatalog = null;
let outfitsReal = [];
let outfitsAnime = [];
let portraits = [];

// Active Fitting Room state
const state = {
  pose: { kind: '3d', stem: 'solo_stand_contrapposto-hip', view: 'f', label: '站立・微扭胯', scene: null },
  outfit: { lib: 'real', code: 'SPR-0001', customDataUrl: null, label: 'SPR-0001' },
  head: { kind: 'portrait', code: 'f71f980dde3', compact: null, skinHex: '#edd4c2', label: 'f71f980dde3' },
  fit: {
    fitMode: 'auto',
    headScale: 1,
    headX: 0,
    headY: 0,
    headRot: 0,
    outfitScale: 1,
    outfitWidth: 1,
    outfitX: 0,
    outfitY: 0,
    syncSkin: true,
    keepAcc: false,
  },
};

// UI pagination / filter state
const ui = {
  panel: 'pose',
  poseSource: 'ws',
  poseCat: '',
  poseQuery: '',
  poseShown: 36,
  outfitLib: 'real',
  outfitCat: '',
  outfitQuery: '',
  outfitShown: 36,
  portraitHair: '',
  portraitSec: '',
  portraitQuery: '',
  portraitShown: 36,
  dragTarget: 'head',
};

// Caches & render bridge
let studioBridgePromise = null;
let bodyRenderCache = null; // { key, image, is3D, anchors, scene }
let outfitCutoutCache = new Map();
let headCutoutCache = new Map();
let pose2DAnchorsCache = new Map();
let activeHeadCanvas = null;
let activeHeadMeta = null;
let activeGarment = null;
let camStream = null;
let renderToken = 0;
let liveUrlTimer = null;
let liveUrlSerial = 0;
// Until the first #f=/#s= restore has been fully applied, do not let a default-state live URL write
// clobber the share link being opened. This also guards slow catalog fetches that could out-of-order
// schedule a URL from default state on a restored page.
let restoreFinished = false;

// Refreshes the #f= URL fragment live as the look changes (debounced), so the share link stays
// up-to-date without waiting for the 复制分享链接 button. Swallows errors quietly; the copy button
// still gives authoritative feedback.
function scheduleLiveURL() {
  if (!restoreFinished) return;
  clearTimeout(liveUrlTimer);
  const mySerial = ++liveUrlSerial;
  liveUrlTimer = setTimeout(async () => {
    if (mySerial !== liveUrlSerial) return;
    try {
      const payload = await buildSharePayload();
      const { url } = await buildFittingShareURL(payload, location.href);
      window.history.replaceState(null, '', url);
    } catch {
      /* ignore transient decode/size errors during rapid slider drags */
    }
  }, 450);
}

function unsetLiveURL() {
  clearTimeout(liveUrlTimer);
  liveUrlSerial++;
}

function setBusy(textKeyOrNull) {
  const overlay = $('#busyOverlay');
  if (!textKeyOrNull) {
    overlay.hidden = true;
    return;
  }
  overlay.hidden = false;
  $('#busyText').textContent = t(textKeyOrNull);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(Error('Image load failed: ' + src));
    img.src = src;
  });
}

function getStudioBridge() {
  if (!studioBridgePromise) {
    const iframe = $('#studioBridge');
    iframe.src = `../studio/?embed=fitting&experimental=1&lang=${LANG}`;
    studioBridgePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('3D Studio timed out')), 45000);
      iframe.addEventListener('load', async () => {
        try {
          const api = iframe.contentWindow.poseStudio;
          if (!api) throw Error('Studio API unavailable');
          await api.ready;
          clearTimeout(timer);
          resolve(api);
        } catch (err) {
          clearTimeout(timer);
          reject(err);
        }
      }, { once: true });
    }).catch((err) => {
      studioBridgePromise = null;
      throw err;
    });
  }
  return studioBridgePromise;
}

function default2DAnchors() {
  return {
    headTop: { x: 0.5, y: 0.06, z: 0 },
    head: { x: 0.5, y: 0.13, z: 0 },
    neck: { x: 0.5, y: 0.19, z: 0 },
    l_arm: { x: 0.40, y: 0.23, z: 0 },
    r_arm: { x: 0.60, y: 0.23, z: 0 },
    chest: { x: 0.5, y: 0.28, z: 0 },
    waist: { x: 0.5, y: 0.40, z: 0 },
    pelvis: { x: 0.5, y: 0.49, z: 0 },
    l_leg: { x: 0.44, y: 0.50, z: 0 },
    r_leg: { x: 0.56, y: 0.50, z: 0 },
    l_knee: { x: 0.44, y: 0.70, z: 0 },
    r_knee: { x: 0.56, y: 0.70, z: 0 },
    l_ankle: { x: 0.44, y: 0.89, z: 0 },
    r_ankle: { x: 0.56, y: 0.89, z: 0 },
    headRoll: 0,
  };
}

function isUprightFrontPose(stem, view) {
  if (view && view !== 'f') return false;
  if (!stem) return false;
  return /^solo_stand_|^ws_stand_|^ws_fashion_|^ws_daily_/.test(stem) && !/(wall|bent|floor|lie|kneel|squat|rear|back|look-bk|high-kick)/.test(stem);
}

function effectiveFitMode() {
  if (state.pose.kind !== '3d') return '2d-mls';
  if (state.fit.fitMode === '3d-wear' || state.fit.fitMode === '2d-mls') return state.fit.fitMode;
  // Auto: use crisp Rust WASM high-res outfit on upright front poses; 3D skinned clothing on angled/dynamic 3D poses
  return isUprightFrontPose(state.pose.stem, state.pose.view) ? '2d-mls' : '3d-wear';
}

// Never render a bare-skinned body: 3D poses always wear a fitted opaque base layer (or a full outfit),
// so no body context can leak regardless of pose angle or garment placement.
const SAFETY_BASE = { mode: 'safety' };

async function resolveBodyLayer(garment) {
  const skinColor = state.fit.syncSkin ? (state.head.skinHex || '#edd4c2') : '#e8e2d5';
  const fitMode = effectiveFitMode();
  if (state.pose.kind === '3d') {
    // Always pass a clothing spec: a full outfit where one exists, otherwise the opaque-safety base layer.
    const clothing = fitMode === '3d-wear'
      ? (garment?.clothing3D || SAFETY_BASE)
      : SAFETY_BASE;
    const clothKey = clothing
      ? `${clothing.mode}:${state.outfit.lib}:${state.outfit.code}:${Boolean(state.outfit.customDataUrl)}:${state.fit.keepAcc}`
      : 'none';
    const cacheKey = JSON.stringify({
      stem: state.pose.stem,
      view: state.pose.view,
      scene: Boolean(state.pose.scene),
      skinColor,
      clothKey,
      sceneHash: state.pose.scene ? JSON.stringify(state.pose.scene.figures?.[0]?.joints || '') + JSON.stringify(state.pose.scene.camera || '') : '',
    });
    if (bodyRenderCache?.key === cacheKey) return bodyRenderCache;
    setBusy('rendering3d');
    const api = await getStudioBridge();
    const rendered = await api.renderFittingPose({
      stem: state.pose.scene ? undefined : state.pose.stem,
      view: state.pose.view,
      scene: state.pose.scene || null,
      width: 720,
      height: 960,
      skinColor,
      clothing,
    });
    const image = await loadImage(rendered.dataUrl);
    bodyRenderCache = {
      key: cacheKey,
      image,
      is3D: true,
      fitMode,
      anchors: rendered.anchors,
      scene: rendered.scene,
    };
    return bodyRenderCache;
  }

  // 2D pose image fallback (WaveSpeed mannequin or Classic line art)
  const item = [...wsPoses, ...classicPoses].find((p) => p.id === state.pose.id);
  const imgSrc = item ? `../${item.原图}` : '../data/wavespeed/img/ws_stand_neutral-stance_f.webp';
  const cacheKey = `2d:${imgSrc}`;
  if (bodyRenderCache?.key === cacheKey) return bodyRenderCache;
  const image = await loadImage(imgSrc);
  let anchors = pose2DAnchorsCache.get(imgSrc);
  if (!anchors) {
    try {
      setBusy('loadingPose');
      anchors = await detectPose2DAnchors(image, { onProgress: (p) => setBusy(p) });
      if (anchors) pose2DAnchorsCache.set(imgSrc, anchors);
    } catch (err) {
      console.warn('2D pose detection fallback', err);
    }
  }
  bodyRenderCache = {
    key: cacheKey,
    image,
    is3D: false,
    fitMode: '2d-mls',
    anchors: anchors || default2DAnchors(),
    scene: null,
  };
  return bodyRenderCache;
}

async function resolveOutfitLayer() {
  if (state.outfit.customDataUrl) {
    const key = `custom:${state.outfit.customDataUrl.slice(0, 64)}:${state.fit.keepAcc}`;
    if (!outfitCutoutCache.has(key)) {
      setBusy('cuttingOutfit');
      const img = await loadImage(state.outfit.customDataUrl);
      outfitCutoutCache.set(key, await extractGarmentCutout(img, { keepAccessories: state.fit.keepAcc }));
    }
    return outfitCutoutCache.get(key);
  }
  const list = state.outfit.lib === 'anime' ? outfitsAnime : outfitsReal;
  const row = list.find((r) => r.code === state.outfit.code) || list[0];
  if (!row) return null;
  state.outfit.code = row.code;
  state.outfit.label = `${row.categoryName[LANG] || row.categoryName.en} · ${row.code}`;
  const key = `${row.id}:${state.fit.keepAcc}`;
  if (!outfitCutoutCache.has(key)) {
    setBusy('cuttingOutfit');
    const img = await loadImage(`../${row.image}`);
    const cutout = await extractGarmentCutout(img, { keepAccessories: state.fit.keepAcc });
    const kw = (row.search || '').toLowerCase();
    if (/裙|dress|skirt/.test(kw)) cutout.clothing3D.isSkirt = true;
    else if (/长裤|牛仔裤|西装裤|短裤|pants|jeans|trousers|shorts/.test(kw)) cutout.clothing3D.isSkirt = false;
    if (/长裙|中长|连衣裙|长裤|牛仔裤|西装裤|maxi|midi|pants|jeans|trousers/.test(kw)) cutout.clothing3D.longBottom = true;
    else if (/短裙|迷你|短裤|mini|shorts/.test(kw)) cutout.clothing3D.longBottom = false;
    if (/外套|风衣|大衣|夹克|毛衣|针织|长袖|衬衫|卫衣|cardigan|coat|jacket|blazer|sweater/.test(kw)) cutout.clothing3D.longSleeves = true;
    outfitCutoutCache.set(key, cutout);
  }
  return outfitCutoutCache.get(key);
}

async function resolveHeadLayer() {
  if (state.head.kind === 'none') {
    activeHeadCanvas = null;
    activeHeadMeta = null;
    return;
  }
  if (state.head.kind === 'cutout' && state.head.compact) {
    if (!activeHeadCanvas || activeHeadMeta?.compactRef !== state.head.compact) {
      activeHeadCanvas = await decodeHeadPayload(state.head.compact);
      activeHeadMeta = {
        compactRef: state.head.compact,
        chinAnchor: state.head.chinAnchor || { x: 0.5, y: 0.88 },
      };
    }
    return;
  }
  if (state.head.kind === 'portrait') {
    const p = portraits.find((r) => r.code === state.head.code) || portraits[0];
    if (!p) return;
    state.head.code = p.code;
    state.head.label = p.style?.[LANG] || p.hair?.[LANG] || p.code;
    if (!headCutoutCache.has(p.code)) {
      setBusy('loadingFace');
      const res = await cutoutHeadFromSource(`../${p.thumb}`, { onProgress: (ph) => setBusy(ph) });
      headCutoutCache.set(p.code, res);
    }
    const cached = headCutoutCache.get(p.code);
    activeHeadCanvas = cached.canvas;
    activeHeadMeta = { chinAnchor: cached.chinAnchor };
    state.head.skinHex = cached.skinHex;
  }
}

async function refreshComposite({ skipHeavy = false } = {}) {
  const token = ++renderToken;
  try {
    if (!skipHeavy) {
      await resolveHeadLayer();
      if (token !== renderToken) return;
      activeGarment = await resolveOutfitLayer();
      if (token !== renderToken) return;
      await resolveBodyLayer(activeGarment);
      if (token !== renderToken) return;
    }
    if (!bodyRenderCache) return;

    const fitMode = bodyRenderCache.fitMode || effectiveFitMode();
    await renderFittingComposite({
      outCanvas: $('#compositeCanvas'),
      bodyImage: bodyRenderCache.image,
      bodyIs3D: bodyRenderCache.is3D,
      fitMode,
      anchors: bodyRenderCache.anchors,
      garment: activeGarment,
      headCanvas: activeHeadCanvas,
      headMeta: activeHeadMeta,
      skinHex: state.fit.syncSkin ? (state.head.skinHex || '#edd4c2') : '#e8e2d5',
      fit: state.fit,
    });

    scheduleLiveURL();

    const is3D = state.pose.kind === '3d';
    $('#poseModeBadge').textContent = t(fitMode === '3d-wear' ? 'mode3d' : 'mode2d');
    $('#fitModeBar').hidden = !is3D;
    document.querySelectorAll('#fitModeBar button').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.fmode === (state.fit.fitMode || 'auto'))),
    );
    $('#angleBar').hidden = !is3D;
    document.querySelectorAll('#angleBar button').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.view === state.pose.view)),
    );
    const restoredPoseLabel =
      state.pose.label ||
      [...wsPoses, ...classicPoses].find((p) => p.id.startsWith((state.pose.stem || state.pose.id) + '_') || p.id === state.pose.id)?.姿势名称 ||
      state.pose.stem ||
      state.pose.id;
    state.pose.label = restoredPoseLabel;
    $('#currentSummary').innerHTML = `
      <span><b>${esc(t('summaryPose'))}:</b> ${esc(restoredPoseLabel)}</span>
      <span><b>${esc(t('summaryOutfit'))}:</b> ${esc(state.outfit.label || state.outfit.code)}</span>
      <span><b>${esc(t('summaryHead'))}:</b> ${esc(state.head.kind === 'none' ? t('noneHead') : (state.head.label || t('customUpload')))}</span>
    `;
  } catch (err) {
    console.error(err);
    $('#renderStatus').textContent = err.message;
  } finally {
    if (token === renderToken) setBusy(null);
  }
}

function syncTuneInputs() {
  $('#headScale').value = state.fit.headScale;
  $('#headRot').value = state.fit.headRot;
  $('#outfitScale').value = state.fit.outfitScale;
  $('#outfitWidth').value = state.fit.outfitWidth;
  $('#outfitY').value = state.fit.outfitY;
  $('#syncSkinCheck').checked = state.fit.syncSkin;
  $('#keepAccCheck').checked = state.fit.keepAcc;
}

function getPoseGroups(source) {
  const map = new Map();
  const list = source === 'ws' ? wsPoses : source === 'classic' ? classicPoses : [...wsPoses, ...classicPoses];
  for (const row of list) {
    const stem = row.id.replace(/_(f|d|s|hi|lo)$/, '');
    if (source === '3d' && !pose3DSet.has(stem)) continue;
    if (!map.has(stem)) {
      map.set(stem, {
        stem,
        source: row.id.startsWith('ws_') ? 'ws' : 'classic',
        has3D: pose3DSet.has(stem),
        name: row.姿势名称,
        category: row.分类,
        system: row.体系,
        number: row.姿势编号,
        search: row._search,
        views: {},
      });
    }
    const g = map.get(stem);
    const viewCode = row.id.match(/_(f|d|s|hi|lo)$/)?.[1] || 'f';
    g.views[viewCode] = row;
  }
  return [...map.values()];
}

function renderPosePicker() {
  const groups = getPoseGroups(ui.poseSource);
  const cats = [...new Set(groups.map((g) => g.category))];
  const catSel = $('#poseCatSelect');
  const prevCat = ui.poseCat;
  catSel.innerHTML = `<option value="">${esc(t('allCats'))}</option>` +
    cats.map((c) => `<option value="${esc(c)}"${prevCat === c ? ' selected' : ''}>${esc(c)}</option>`).join('');
  if (!cats.includes(ui.poseCat)) ui.poseCat = '';

  const q = ui.poseQuery;
  const filtered = groups.filter((g) =>
    (!ui.poseCat || g.category === ui.poseCat) &&
    (!q || g.search.includes(q)),
  );
  const visible = filtered.slice(0, ui.poseShown);
  const activeStem = state.pose.kind === '3d' ? state.pose.stem : state.pose.id?.replace(/_(f|d|s|hi|lo)$/, '');

  $('#poseGrid').innerHTML = visible.map((g) => {
    const preview = g.views.f || g.views.d || Object.values(g.views)[0];
    const selected = g.stem === activeStem;
    return `
      <button type="button" class="tile" data-stem="${esc(g.stem)}" data-first-id="${esc(preview.id)}" data-has3d="${g.has3D}" aria-pressed="${selected}">
        <div class="tile-media">
          <img src="../${esc(preview.缩略图)}" alt="${esc(g.name)}" loading="lazy" decoding="async">
          <span class="tile-tag${g.has3D ? ' is3d' : ''}">${g.has3D ? '3D' : esc(g.number)}</span>
        </div>
        <span class="tile-label">${esc(g.name)}</span>
      </button>
    `;
  }).join('');
  $('#poseMore').hidden = visible.length >= filtered.length;
}

function renderOutfitPicker() {
  const list = ui.outfitLib === 'anime' ? outfitsAnime : outfitsReal;
  const cats = Object.entries(nvCatalog.libraries?.[ui.outfitLib]?.categories || {});
  $('#outfitCatPills').innerHTML = [
    `<button type="button" class="cat-pill" data-ocat="" aria-pressed="${!ui.outfitCat}">${esc(t('allCats'))} · ${list.length}</button>`,
    ...cats.map(([slug, meta]) =>
      `<button type="button" class="cat-pill" data-ocat="${esc(slug)}" aria-pressed="${ui.outfitCat === slug}">${esc(meta.name[LANG] || meta.name.en)} · ${meta.count}</button>`
    ),
  ].join('');

  const terms = ui.outfitQuery ? ui.outfitQuery.split(/\s+/).filter(Boolean) : [];
  const filtered = list.filter((row) =>
    (!ui.outfitCat || row.category === ui.outfitCat) &&
    (!terms.length || terms.every((term) => row.search.includes(term))),
  );
  const visible = filtered.slice(0, ui.outfitShown);
  $('#outfitGrid').innerHTML = visible.map((row) => `
    <button type="button" class="tile" data-ocode="${esc(row.code)}" data-olib="${esc(row.library)}" aria-pressed="${!state.outfit.customDataUrl && state.outfit.lib === row.library && state.outfit.code === row.code}">
      <div class="tile-media outfit">
        <img src="../${esc(row.thumb)}" alt="${esc(row.code)}" loading="lazy" decoding="async">
        <span class="tile-tag">${esc(row.code)}</span>
      </div>
      <span class="tile-label">${esc(row.categoryName[LANG] || row.categoryName.en)} · ${esc(row.keywordsZh?.slice(0, 3).join(' ') || row.code)}</span>
    </button>
  `).join('');
  $('#outfitMore').hidden = visible.length >= filtered.length;
}

function renderPortraitPicker() {
  const hairMeta = nvCatalog.libraries?.portrait?.categories || {};
  const hairSel = $('#portraitHairSelect');
  if (hairSel.options.length <= 1) {
    hairSel.innerHTML = `<option value="">${esc(t('allHair'))}</option>` +
      Object.entries(hairMeta).map(([slug, meta]) => `<option value="${esc(slug)}">${esc(meta.name[LANG] || meta.name.en)} (${meta.count})</option>`).join('');
  }
  const terms = ui.portraitQuery ? ui.portraitQuery.split(/\s+/).filter(Boolean) : [];
  const filtered = portraits.filter((row) =>
    (!ui.portraitHair || row.category === ui.portraitHair) &&
    (!ui.portraitSec || row.section === ui.portraitSec) &&
    (!terms.length || terms.every((term) => row.search.includes(term))),
  );
  const visible = filtered.slice(0, ui.portraitShown);
  $('#portraitGrid').innerHTML = visible.map((row) => {
    const label = row.style?.[LANG] || row.style?.zh || row.hair?.[LANG] || row.code;
    return `
      <button type="button" class="tile" data-pcode="${esc(row.code)}" aria-pressed="${state.head.kind === 'portrait' && state.head.code === row.code}">
        <div class="tile-media portrait">
          <img src="../${esc(row.thumb)}" alt="${esc(label)}" loading="lazy" decoding="async">
          <span class="tile-tag">${esc(row.code)}</span>
        </div>
        <span class="tile-label">${esc(label)}</span>
      </button>
    `;
  }).join('');
  $('#portraitMore').hidden = visible.length >= filtered.length;
}

async function applyHeadCutoutFromSource(source, label) {
  try {
    setBusy('loadingFace');
    const res = await cutoutHeadFromSource(source, { onProgress: (ph) => setBusy(ph) });
    activeHeadCanvas = res.canvas;
    activeHeadMeta = { chinAnchor: res.chinAnchor };
    state.head = {
      kind: 'cutout',
      code: null,
      compact: res.compact,
      chinAnchor: res.chinAnchor,
      skinHex: res.skinHex,
      label,
    };
    state.fit.headX = 0;
    state.fit.headY = 0;
    state.fit.headRot = Math.max(-25, Math.min(25, Math.round((-res.rollRad * 180) / Math.PI)));
    syncTuneInputs();
    renderPortraitPicker();
    await refreshComposite();
  } catch (err) {
    setBusy(null);
    $('#renderStatus').textContent = t(err.message) || err.message;
  }
}

async function buildSharePayload() {
  const headPayload =
    state.head.kind === 'cutout' && state.head.compact
      ? {
          kind: 'cutout',
          ...state.head.compact,
          chinAnchor: state.head.chinAnchor,
          skinHex: state.head.skinHex,
        }
      : state.head.kind === 'portrait'
        ? { kind: 'portrait', code: state.head.code }
        : { kind: 'none' };

  const posePayload =
    state.pose.kind === '3d'
      ? {
          kind: '3d',
          stem: state.pose.stem,
          view: state.pose.view,
          ...(state.pose.scene ? { scene: state.pose.scene } : {}),
        }
      : { kind: '2d', id: state.pose.id };

  const outfitPayload = state.outfit.customDataUrl
    ? { kind: 'custom', dataUrl: state.outfit.customDataUrl }
    : { lib: state.outfit.lib, code: state.outfit.code };

  return {
    v: 1,
    pose: posePayload,
    outfit: outfitPayload,
    head: headPayload,
    fit: state.fit,
  };
}

async function createCompositeCustomPair(files) {
  const imgs = await Promise.all(
    files.slice(0, 2).map((f) => new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => loadImage(r.result).then(resolve, reject);
      r.onerror = reject;
      r.readAsDataURL(f);
    })),
  );
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = imgs.length === 2 ? 768 : Math.round((imgs[0].naturalHeight / imgs[0].naturalWidth) * 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e6e4e0';
  ctx.fillRect(0, 0, c.width, c.height);
  if (imgs.length === 1) {
    ctx.drawImage(imgs[0], 0, 0, c.width, c.height);
  } else {
    const drawHalf = (img, y0, hHalf) => {
      const s = Math.min((c.width - 24) / img.naturalWidth, (hHalf - 16) / img.naturalHeight);
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      ctx.drawImage(img, (c.width - dw) * 0.5, y0 + (hHalf - dh) * 0.5, dw, dh);
    };
    drawHalf(imgs[0], 0, 384);
    drawHalf(imgs[1], 384, 384);
  }
  return c.toDataURL('image/webp', 0.85);
}

function bindEvents() {
  // Language switcher
  $('#languageSelect').addEventListener('change', (e) => {
    const next = e.target.value;
    try { localStorage.setItem('pose-language', next); } catch {}
    const url = new URL(location.href);
    url.searchParams.set('lang', next);
    location.assign(url.href);
  });

  // Panel tabs
  $('#panelTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.panel-tab[data-panel]');
    if (!btn) return;
    ui.panel = btn.dataset.panel;
    document.querySelectorAll('.panel-tab').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    $('#panelPose').hidden = ui.panel !== 'pose';
    $('#panelOutfit').hidden = ui.panel !== 'outfit';
    $('#panelHead').hidden = ui.panel !== 'head';
  });

  // Pose source & filter
  $('#poseSourcePills').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-psrc]');
    if (!btn) return;
    ui.poseSource = btn.dataset.psrc;
    ui.poseCat = '';
    ui.poseShown = 36;
    document.querySelectorAll('#poseSourcePills button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    renderPosePicker();
  });
  $('#poseCatSelect').addEventListener('change', (e) => {
    ui.poseCat = e.target.value;
    ui.poseShown = 36;
    renderPosePicker();
  });
  $('#poseSearch').addEventListener('input', (e) => {
    ui.poseQuery = e.target.value.trim().toLowerCase();
    ui.poseShown = 36;
    renderPosePicker();
  });
  $('#poseMore').addEventListener('click', () => {
    ui.poseShown += 36;
    renderPosePicker();
  });
  $('#poseGrid').addEventListener('click', async (e) => {
    const tile = e.target.closest('.tile[data-stem]');
    if (!tile) return;
    const stem = tile.dataset.stem;
    const has3d = tile.dataset.has3d === 'true';
    const label = tile.querySelector('.tile-label')?.textContent || stem;
    if (has3d) {
      state.pose = { kind: '3d', stem, view: state.pose.view || 'f', label, scene: null };
    } else {
      state.pose = { kind: '2d', id: tile.dataset.firstId, label };
    }
    renderPosePicker();
    await refreshComposite();
  });

  // Fit mode switcher (Auto / 3D Skinned Wear / 2D MLS)
  $('#fitModeBar').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-fmode]');
    if (!btn) return;
    state.fit.fitMode = btn.dataset.fmode;
    await refreshComposite();
  });

  // 3D Angle bar
  $('#angleBar').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn || state.pose.kind !== '3d') return;
    state.pose.view = btn.dataset.view;
    state.pose.scene = null;
    await refreshComposite();
  });

  // Open current 3D pose in Studio to refine
  $('#editInStudioBtn').addEventListener('click', async () => {
    const base = new URL(`../studio/?from=fitting&experimental=1&lang=${LANG}`, location.href);
    if (state.pose.kind === '3d') {
      if (state.pose.scene) {
        const api = await getStudioBridge();
        api.importScene(state.pose.scene);
        const share = await api.getShareURL();
        base.hash = new URL(share).hash;
      } else {
        base.searchParams.set('pose', `${state.pose.stem}_${state.pose.view || 'f'}`);
      }
    }
    location.href = base.href;
  });

  // Outfit switcher & uploads
  $('#outfitLibPills').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-olib]');
    if (!btn) return;
    ui.outfitLib = btn.dataset.olib;
    ui.outfitCat = '';
    ui.outfitShown = 36;
    document.querySelectorAll('#outfitLibPills button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    renderOutfitPicker();
  });
  $('#outfitCatPills').addEventListener('click', (e) => {
    const btn = e.target.closest('.cat-pill[data-ocat]');
    if (!btn) return;
    ui.outfitCat = btn.dataset.ocat;
    ui.outfitShown = 36;
    renderOutfitPicker();
  });
  $('#outfitSearch').addEventListener('input', (e) => {
    ui.outfitQuery = e.target.value.trim().toLowerCase();
    ui.outfitShown = 36;
    renderOutfitPicker();
  });
  $('#outfitMore').addEventListener('click', () => {
    ui.outfitShown += 36;
    renderOutfitPicker();
  });
  $('#outfitGrid').addEventListener('click', async (e) => {
    const tile = e.target.closest('.tile[data-ocode]');
    if (!tile) return;
    state.outfit = {
      lib: tile.dataset.olib,
      code: tile.dataset.ocode,
      customDataUrl: null,
      label: tile.querySelector('.tile-label')?.textContent || tile.dataset.ocode,
    };
    renderOutfitPicker();
    await refreshComposite();
  });
  $('#uploadOutfitBtn').addEventListener('click', () => $('#outfitFile').click());
  $('#uploadPairBtn').addEventListener('click', () => $('#outfitPairFile').click());
  $('#outfitFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await createCompositeCustomPair([file]);
    state.outfit = { lib: 'custom', code: 'custom', customDataUrl: dataUrl, label: t('customUpload') };
    e.target.value = '';
    await refreshComposite();
  });
  $('#outfitPairFile').addEventListener('change', async (e) => {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    const dataUrl = await createCompositeCustomPair(files);
    state.outfit = { lib: 'custom', code: 'custom', customDataUrl: dataUrl, label: t('customUpload') };
    e.target.value = '';
    await refreshComposite();
  });

  // Portrait & Head cutout
  $('#portraitSearch').addEventListener('input', (e) => {
    ui.portraitQuery = e.target.value.trim().toLowerCase();
    ui.portraitShown = 36;
    renderPortraitPicker();
  });
  $('#portraitHairSelect').addEventListener('change', (e) => {
    ui.portraitHair = e.target.value;
    ui.portraitShown = 36;
    renderPortraitPicker();
  });
  $('#portraitSecSelect').addEventListener('change', (e) => {
    ui.portraitSec = e.target.value;
    ui.portraitShown = 36;
    renderPortraitPicker();
  });
  $('#portraitMore').addEventListener('click', () => {
    ui.portraitShown += 36;
    renderPortraitPicker();
  });
  $('#portraitGrid').addEventListener('click', async (e) => {
    const tile = e.target.closest('.tile[data-pcode]');
    if (!tile) return;
    state.head = {
      kind: 'portrait',
      code: tile.dataset.pcode,
      compact: null,
      skinHex: state.head.skinHex,
      label: tile.querySelector('.tile-label')?.textContent || tile.dataset.pcode,
    };
    state.fit.headX = 0;
    state.fit.headY = 0;
    state.fit.headRot = 0;
    syncTuneInputs();
    renderPortraitPicker();
    await refreshComposite();
  });
  $('#uploadHeadBtn').addEventListener('click', () => $('#headFile').click());
  $('#headFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await applyHeadCutoutFromSource(file, file.name);
  });
  $('#clearHeadBtn').addEventListener('click', async () => {
    state.head = { kind: 'none', code: null, compact: null, skinHex: '#e8e2d5', label: t('noneHead') };
    renderPortraitPicker();
    await refreshComposite();
  });

  // Webcam modal
  const stopCamera = () => {
    camStream?.getTracks().forEach((tr) => tr.stop());
    camStream = null;
    if ($('#camDialog').open) $('#camDialog').close();
  };
  $('#openCameraBtn').addEventListener('click', async () => {
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } }, audio: false });
      $('#camVideo').srcObject = camStream;
      $('#camDialog').showModal();
    } catch {
      $('#renderStatus').textContent = t('camDenied');
    }
  });
  $('#camClose').addEventListener('click', stopCamera);
  $('#camCancelBtn').addEventListener('click', stopCamera);
  $('#camSnapBtn').addEventListener('click', async () => {
    const video = $('#camVideo');
    const c = document.createElement('canvas');
    c.width = video.videoWidth || 720;
    c.height = video.videoHeight || 960;
    const ctx = c.getContext('2d');
    // Match mirrored preview orientation
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, c.width, c.height);
    stopCamera();
    await applyHeadCutoutFromSource(c, 'Webcam');
  });

  // Drag on canvas to adjust head or outfit
  $('#dragHeadBtn').addEventListener('click', () => {
    ui.dragTarget = 'head';
    $('#dragHeadBtn').setAttribute('aria-pressed', 'true');
    $('#dragOutfitBtn').setAttribute('aria-pressed', 'false');
  });
  $('#dragOutfitBtn').addEventListener('click', () => {
    ui.dragTarget = 'outfit';
    $('#dragHeadBtn').setAttribute('aria-pressed', 'false');
    $('#dragOutfitBtn').setAttribute('aria-pressed', 'true');
  });

  let dragStart = null;
  const canvas = $('#compositeCanvas');
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    dragStart = {
      x: e.clientX,
      y: e.clientY,
      w: r.width,
      h: r.height,
      hx: state.fit.headX,
      hy: state.fit.headY,
      ox: state.fit.outfitX,
      oy: state.fit.outfitY,
    };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragStart) return;
    const dx = (e.clientX - dragStart.x) / dragStart.w;
    const dy = (e.clientY - dragStart.y) / dragStart.h;
    if (ui.dragTarget === 'head') {
      state.fit.headX = Math.max(-0.35, Math.min(0.35, dragStart.hx + dx));
      state.fit.headY = Math.max(-0.35, Math.min(0.35, dragStart.hy + dy));
    } else {
      state.fit.outfitX = Math.max(-0.35, Math.min(0.35, dragStart.ox + dx));
      state.fit.outfitY = Math.max(-0.35, Math.min(0.35, dragStart.oy + dy));
    }
    syncTuneInputs();
    refreshComposite({ skipHeavy: true });
  });
  canvas.addEventListener('pointerup', () => { dragStart = null; });
  canvas.addEventListener('pointercancel', () => { dragStart = null; });

  // Tune sliders
  for (const [id, key] of [
    ['headScale', 'headScale'],
    ['headRot', 'headRot'],
    ['outfitScale', 'outfitScale'],
    ['outfitWidth', 'outfitWidth'],
    ['outfitY', 'outfitY'],
  ]) {
    $(`#${id}`).addEventListener('input', (e) => {
      state.fit[key] = Number(e.target.value);
      refreshComposite({ skipHeavy: true });
    });
  }
  $('#syncSkinCheck').addEventListener('change', (e) => {
    state.fit.syncSkin = e.target.checked;
    refreshComposite();
  });
  $('#keepAccCheck').addEventListener('change', (e) => {
    state.fit.keepAcc = e.target.checked;
    refreshComposite();
  });
  $('#resetTuneBtn').addEventListener('click', () => {
    Object.assign(state.fit, {
      headScale: 1, headX: 0, headY: 0, headRot: 0,
      outfitScale: 1, outfitWidth: 1, outfitX: 0, outfitY: 0,
    });
    syncTuneInputs();
    refreshComposite({ skipHeavy: true });
  });

  // Share link + PNG download + Randomize
  $('#copyShareBtn').addEventListener('click', async () => {
    try {
      const payload = await buildSharePayload();
      const { url, bytes } = await buildFittingShareURL(payload, location.href);
      window.history.replaceState(null, '', url);
      $('#shareUrlBox').value = url;
      $('#shareFeedback').hidden = false;
      const sizeStr = bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
      try {
        await navigator.clipboard.writeText(url);
        $('#shareFeedbackMsg').textContent = t('shareCopied', { size: sizeStr });
      } catch {
        $('#shareUrlBox').select();
        $('#shareFeedbackMsg').textContent = t('shareReady', { size: sizeStr });
      }
    } catch (err) {
      $('#renderStatus').textContent = err.message;
    }
  });

  $('#downloadPngBtn').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = $('#compositeCanvas').toDataURL('image/png');
    a.download = `fitroom-${state.outfit.code || 'look'}.png`;
    a.click();
  });

  $('#randomizeBtn').addEventListener('click', async () => {
    const groups3d = getPoseGroups('3d');
    const g = groups3d[Math.floor(Math.random() * groups3d.length)];
    const list = ui.outfitLib === 'anime' ? outfitsAnime : outfitsReal;
    const o = list[Math.floor(Math.random() * list.length)];
    if (g) state.pose = { kind: '3d', stem: g.stem, view: 'f', label: g.name, scene: null };
    if (o) state.outfit = { lib: o.library, code: o.code, customDataUrl: null, label: o.code };
    renderPosePicker();
    renderOutfitPicker();
    await refreshComposite();
  });
}

function applyLanguage() {
  document.documentElement.lang = { zh: 'zh-CN', en: 'en', ja: 'ja' }[LANG];
  document.title = t('pageTitle');
  $('#languageSelect').value = LANG;
  $('#brandHome').href = `../?lang=${LANG}`;
  $('#poseNav').href = `../?lang=${LANG}`;
  $('#studioNav').href = `../studio/?lang=${LANG}`;
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
}

(async () => {
  applyLanguage();
  bindEvents();
  try {
    const [wsRes, classicRes, statusRes, nvRes] = await Promise.all([
      fetch(`../data/wavespeed/pose-${LANG}.json`),
      fetch(`../data/pose-${LANG}.json`),
      fetch('../data/pose-3d-status.json'),
      fetch('../data/nvzhuang/catalog.json'),
    ].map((p) => p.then((r) => (r.ok ? r : null)).catch(() => null)));
    wsPoses = wsRes ? await wsRes.json().catch(() => []) : [];
    classicPoses = classicRes ? await classicRes.json().catch(() => []) : [];
    const statusJson = statusRes ? await statusRes.json().catch(() => ({ poses: [] })) : { poses: [] };
    nvCatalog = nvRes ? await nvRes.json().catch(() => ({ libraries: {} })) : { libraries: {} };

    for (const p of statusJson.poses || []) {
      if (p.status !== 'not-started') pose3DSet.add(p.id);
    }
    for (const row of [...wsPoses, ...classicPoses]) {
      row._search = `${row.检索} ${row.姿势编号}`.toLowerCase();
    }

    // Load wardrobes + portraits. Each catalog is independent and may be large; a single failure
    // (e.g. slow network) must never abort pose/head restore or the live-URL path.
    const [realRes, animeRes, portraitRes] =
      await Promise.all([
        fetch(`../${nvCatalog.libraries.real.index}`),
        fetch(`../${nvCatalog.libraries.anime.index}`),
        fetch(`../${nvCatalog.libraries.portrait.index}`),
      ].map((p) => p.then((r) => (r.ok ? r : null)).catch(() => null)));
    outfitsReal = realRes ? await realRes.json().catch(() => []) : [];
    outfitsAnime = animeRes ? await animeRes.json().catch(() => []) : [];
    portraits = portraitRes ? await portraitRes.json().catch(() => []) : [];
    if (!portraitRes) console.warn('Portrait catalog failed to load; CC0 portrait mode unavailable');

    // Update counts on pills
    const wsGroupCount = getPoseGroups('ws').length;
    const classicGroupCount = getPoseGroups('classic').length;
    $('[data-psrc="ws"]').textContent = `${t('psrcWs')} (${wsGroupCount})`;
    $('[data-psrc="3d"]').textContent = `${t('psrc3d')} (${pose3DSet.size})`;
    $('[data-psrc="classic"]').textContent = `${t('psrcClassic')} (${classicGroupCount})`;
    $('[data-olib="real"]').textContent = `${t('olibReal')} (${outfitsReal.length.toLocaleString()})`;
    $('[data-olib="anime"]').textContent = `${t('olibAnime')} (${outfitsAnime.length.toLocaleString()})`;

    // Restore from #f= or #s= (returned from 3D Studio)
    const { f, s } = readFittingHash(location.href);
    if (f) {
      try {
        const restored = await decodeFittingState(f);
        if (restored.pose) state.pose = restored.pose;
        if (restored.outfit) state.outfit = restored.outfit;
        if (restored.head) {
          state.head = restored.head;
          // Legacy/cutout payloads store the compact bytes as flat fields ({mime,data,mask,w,h...});
          // rebuild the `compact` sub-object that render/serialize both expect, so the head both
          // draws and round-trips.
          if (restored.head.kind === 'cutout') {
            const flat = restored.head;
            if (flat.mime && flat.data && !flat.compact) {
              state.head.compact = {
                mime: flat.mime,
                data: flat.data,
                mask: flat.mask,
                w: flat.w,
                h: flat.h,
              };
            }
            // Custom (camera/upload) cutouts carry a compact base64 payload; eagerly validate it now so
            // a malformed share link shows a clear message instead of a silently blank head.
            if (state.head.compact) {
              try {
                activeHeadCanvas = await decodeHeadPayload(state.head.compact);
                activeHeadMeta = { compactRef: state.head.compact, chinAnchor: state.head.chinAnchor };
              } catch (decodeErr) {
                console.warn('Head cutout payload failed to decode', decodeErr);
                $('#renderStatus').textContent = '头像数据解码失败：' + (decodeErr.message || decodeErr);
                state.head.kind = 'none';
              }
            }
          }
        }
        if (restored.fit) Object.assign(state.fit, restored.fit);
      } catch (err) {
        console.warn('Invalid #f= link', err);
        $('#renderStatus').textContent = '分享链接无效：' + (err.message || err);
      }
    } else if (s) {
      try {
        const api = await getStudioBridge();
        const scene = await api.loadShareURL(location.href);
        state.pose = { kind: '3d', stem: 'custom', view: 'f', label: '3D Studio', scene };
      } catch (err) {
        console.warn('Invalid #s= scene', err);
      }
    }

    if (state.pose.kind === '3d' && ui.poseSource === 'ws' && !String(state.pose.stem).startsWith('ws_')) {
      ui.poseSource = '3d';
      document.querySelectorAll('#poseSourcePills button').forEach((b) =>
        b.setAttribute('aria-pressed', String(b.dataset.psrc === '3d')),
      );
    }

    syncTuneInputs();
    // Now that any #f=/#s= restore is fully applied (or confirmed absent), future edits may safely
    // overwrite the URL fragment. If we restored, immediately re-encode the restored state so the
    // share link matches what is on screen (and isn't replaced by a default-state write from a slow fetch).
    restoreFinished = true;
    if (f) scheduleLiveURL();
    renderPosePicker();
    renderOutfitPicker();
    renderPortraitPicker();
    await refreshComposite();
  } catch (err) {
    console.error(err);
    $('#renderStatus').textContent = err.message;
  }
})();
