(() => {
'use strict';
const languages = { zh: 'zh-CN', en: 'en', ja: 'ja' };
let savedLang = '';
try { savedLang = localStorage.getItem('pose-language') || ''; } catch {}
const requestedLang = new URLSearchParams(location.search).get('lang') || savedLang || 'zh';
const LANG = Object.hasOwn(languages, requestedLang) ? requestedLang : 'zh';
let UI = { loadError: '图库加载失败 / Could not load gallery / 読み込みに失敗しました', loadErrorTitle: 'Could not load pose data', loadErrorHint: 'Check your connection and reload.', reload: 'Reload' };
const t = (key, values = {}) => (UI[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
const ANGLES = [];

const PAGE_SIZE = { pose: 60, single: 96 };
const state = { line: '', category: '', angle: '', query: '', view: 'pose', shown: PAGE_SIZE.pose };
const $ = selector => document.querySelector(selector);
const grid = $('#grid');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const format = value => Number(value).toLocaleString(languages[LANG]);
const icon = name => ({
  expand: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5"/></svg>',
  search: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m20 20-4.2-4.2"/></svg>'
}[name] || '');

let DATA = [];
let GROUPS = [];
let LINES = [];
let currentList = [];
let renderedCount = 0;
const groupMap = new Map();
const viewerState = { index: 0, item: null, token: 0, returnFocus: null, mode: "image" };
let preview3D, hasPose3D = () => false;
const EXPERIMENTAL_3D_KEY = 'pose-experimental-3d';
let experimental3D = false, previewReady;
try { experimental3D = localStorage.getItem(EXPERIMENTAL_3D_KEY) === '1'; } catch {}

function load3DPreview() {
  if (!previewReady) previewReady = import('./gallery-preview.js').then(preview => {
    hasPose3D = preview.hasPose3D;
    preview3D = preview.createGalleryPreview({lang: LANG, t});
    if (experimental3D && !$('#viewer').hidden) showViewer();
  }).catch(error => {
    previewReady = null;
    console.warn('3D preview unavailable', error);
  });
  return previewReady;
}

function syncExperimental3D() {
  $('#experimental3dToggle').checked = experimental3D;
  $('#studioNav').hidden = !experimental3D;
  $('#studioPose').hidden = !experimental3D;
  $('.viewer-mode').hidden = !experimental3D;
  if (experimental3D) load3DPreview();
  else viewerState.mode = 'image';
  updateViewerMode();
}

$('#experimental3dToggle').addEventListener('change', event => {
  experimental3D = event.target.checked;
  try { localStorage.setItem(EXPERIMENTAL_3D_KEY, experimental3D ? '1' : '0'); } catch {}
  syncExperimental3D();
});
window.addEventListener('storage', event => {
  if (event.key !== EXPERIMENTAL_3D_KEY && event.key !== null) return;
  experimental3D = event.key !== null && event.newValue === '1';
  syncExperimental3D();
});

function groupKey(item) { return `${item.体系}|${item.姿势编号 || item.id}`; }

function prepareData(data) {
  DATA = data;
  LINES = [...new Set(DATA.map(item => item.体系))];
  DATA.forEach(item => {
    item._search = `${item.检索} ${item.姿势编号}`.toLowerCase();
    const key = groupKey(item);
    if (!groupMap.has(key)) {
      const group = { key, system: item.体系, number: item.姿势编号, name: item.姿势名称, category: item.分类, items: [], angles: {}, order: [] };
      groupMap.set(key, group);
      GROUPS.push(group);
    }
    const group = groupMap.get(key);
    group.items.push(item);
    if (item.角度 && !group.angles[item.角度]) group.angles[item.角度] = item;
  });
  GROUPS.sort((a, b) => (LINES.indexOf(a.system) - LINES.indexOf(b.system)) || String(a.number).localeCompare(String(b.number)));
  GROUPS.forEach(group => {
    group.order = ANGLES.map(angle => group.angles[angle]).filter(Boolean);
    group.items.forEach(item => { if (!group.order.includes(item)) group.order.push(item); });
  });
  $('#statPoses').textContent = format(GROUPS.length);
  $('#statImages').textContent = format(DATA.length);
  renderTabs();
  renderCategoryOptions();
  renderAngleFilter();
  render();
}

function renderTabs() {
  const tabs = [['', t('all'), DATA.length, GROUPS.length], ...LINES.map(line => [line, line, DATA.filter(item => item.体系 === line).length, GROUPS.filter(group => group.system === line).length])];
  $('#lineTabs').innerHTML = tabs.map(([value, label, images, poses]) => `<button class="line-tab" type="button" role="tab" data-line="${esc(value)}" aria-selected="${state.line === value}"><span class="tab-name">${esc(label)}</span><span class="tab-count">${t('tabCount', { images: format(images), poses: format(poses) })}</span></button>`).join('');
}

function renderCategoryOptions() {
  const categories = [...new Set(DATA.filter(item => !state.line || item.体系 === state.line).map(item => item.分类).filter(Boolean))].sort((a, b) => a.localeCompare(b, languages[LANG]));
  $('#categorySelect').innerHTML = `<option value="">${t('allCategories')}</option>` + categories.map(category => `<option value="${esc(category)}"${state.category === category ? ' selected' : ''}>${esc(category)}</option>`).join('');
}

function renderAngleFilter() {
  $('#angleFilter').innerHTML = ['', ...ANGLES].map(angle => `<button type="button" data-angle="${esc(angle)}" aria-pressed="${state.angle === angle}">${angle || t('allViews')}</button>`).join('');
}

function hit(item) {
  return (!state.line || item.体系 === state.line) &&
    (!state.category || item.分类 === state.category) &&
    (!state.angle || item.角度 === state.angle) &&
    (!state.query || item._search.includes(state.query));
}

function computeList() {
  if (state.view === 'single') {
    return DATA.filter(hit).map(item => ({ group: groupMap.get(groupKey(item)), item, matched: 1 }));
  }
  return GROUPS.filter(group => group.items.some(hit)).map(group => ({
    group,
    item: (state.angle && group.angles[state.angle]) || group.order[0],
    matched: group.items.filter(hit).length
  }));
}

function cardImage(item, name, number) {
  return `<div class="card-image"><img class="main-image" src="${esc(item.缩略图)}" alt="${esc(name)} · ${esc(item.角度)}" loading="lazy" decoding="async"><div class="image-top"><span class="pose-no">${esc(number)}</span><span class="angle-tag">${esc(item.角度)}</span></div><span class="zoom-hint">${icon('expand')}</span></div>`;
}

function poseCard(entry, index) {
  const { group, item } = entry;
  const strip = ANGLES.filter(angle => group.angles[angle]).map(angle => {
    const angleItem = group.angles[angle];
    return `<button class="angle-thumb${angleItem === item ? ' on' : ''}" type="button" data-angle="${esc(angle)}" title="${esc(angle)}" aria-label="${esc(t('viewAngle', { angle }))}"><img src="${esc(angleItem.缩略图)}" alt="" loading="lazy" decoding="async"><span>${esc(angle)}</span></button>`;
  }).join('');
  return `<article class="pose-card" tabindex="0" data-index="${index}" aria-label="${esc(t('viewLabel', {name: group.name, angle: item.角度}))}">${cardImage(item, group.name, group.number)}<div class="card-body"><h3>${esc(group.name)}</h3><div class="card-meta"><span class="system">${esc(group.system)}</span><span class="meta-dot">·</span><span class="category">${esc(group.category)}</span></div></div><div class="angle-strip">${strip}</div></article>`;
}

function singleCard(entry, index) {
  const { item } = entry;
  return `<article class="pose-card" tabindex="0" data-index="${index}" aria-label="${esc(t('viewLabel', {name: item.姿势名称, angle: item.角度}))}">${cardImage(item, item.姿势名称, item.姿势编号)}<div class="card-body"><h3>${esc(item.姿势名称)}</h3><div class="card-meta"><span class="system">${esc(item.体系)}</span><span class="meta-dot">·</span><span class="category">${esc(item.分类)}</span></div><code class="card-id">${esc(item.id)}</code></div></article>`;
}

function syncControls() {
  document.querySelectorAll('.line-tab').forEach(button => button.setAttribute('aria-selected', button.dataset.line === state.line));
  document.querySelectorAll('#angleFilter button').forEach(button => button.setAttribute('aria-pressed', button.dataset.angle === state.angle));
  document.querySelectorAll('#viewFilter button').forEach(button => button.setAttribute('aria-pressed', button.dataset.view === state.view));
  $('#searchClear').hidden = !state.query;
  const count = [state.category, state.angle].filter(Boolean).length + (state.view === 'single' ? 1 : 0);
  $('#filterBadge').textContent = count || '';
}

function renderActiveFilters() {
  const filters = [];
  if (state.line) filters.push(['line', `${t('system')}: ${state.line}`]);
  if (state.category) filters.push(['category', `${t('category')}: ${state.category}`]);
  if (state.angle) filters.push(['angle', `${t('angle')}: ${state.angle}`]);
  if (state.query) filters.push(['query', `${t('searchLabel')}: ${state.query}`]);
  if (state.view === 'single') filters.push(['view', t('singleMode')]);
  $('#activeFilters').innerHTML = filters.map(([key, label]) => `<button class="filter-chip" type="button" data-clear="${key}" title="${esc(t('removeFilter'))}">${esc(label)}</button>`).join('');
}

function render(append = false) {
  if (!append) preview3D?.hide();
  if (!append) {
    currentList = computeList();
    renderedCount = 0;
    grid.innerHTML = '';
  }
  const total = currentList.length;
  const visible = currentList.slice(renderedCount, state.shown);
  grid.insertAdjacentHTML('beforeend', visible.map((entry, offset) => state.view === 'pose' ? poseCard(entry, renderedCount + offset) : singleCard(entry, renderedCount + offset)).join(''));
  renderedCount += visible.length;

  if (state.view === 'pose') {
    const images = currentList.reduce((sum, entry) => sum + entry.matched, 0);
    $('#resultCount').textContent = t('resultsPose', {poses: format(total), images: format(images)});
  } else {
    $('#resultCount').textContent = t('resultsImage', {images: format(total)});
  }
  $('#visibleCount').textContent = total > state.shown ? t('shown', {shown: format(renderedCount), total: format(total)}) : t('total', {total: format(total)});

  if (!total) {
    grid.innerHTML = `<div class="empty"><div class="empty-icon">${icon('search')}</div><h3>${t('emptyTitle')}</h3><p>${t('emptyHint')}</p><button type="button" id="emptyReset">${t('clearAll')}</button></div>`;
  }
  const more = $('#loadMore');
  more.hidden = renderedCount >= total || !total;
  more.textContent = t('moreRemaining', {count: format(total - renderedCount)});
  syncControls();
  renderActiveFilters();
}

function resetView() {
  state.shown = PAGE_SIZE[state.view];
  render();
}

function resetAll() {
  state.line = '';
  state.category = '';
  state.angle = '';
  state.query = '';
  state.view = 'pose';
  $('#searchInput').value = '';
  renderTabs();
  renderCategoryOptions();
  resetView();
}

function updateCardPreview(card, entry) {
  const item = entry.item;
  const image = card.querySelector('.main-image');
  image.src = item.缩略图;
  image.alt = `${entry.group.name} · ${item.角度}`;
  card.querySelector('.angle-tag').textContent = item.角度;
  if (experimental3D && card.matches(':hover') && $('#viewer').hidden) preview3D?.show(card.querySelector('.card-image'), item);
  card.setAttribute('aria-label', t('viewLabel', {name: entry.group.name, angle: item.角度}));
  card.querySelectorAll('.angle-thumb').forEach(button => button.classList.toggle('on', button.dataset.angle === item.角度));
}

$('#lineTabs').addEventListener('click', event => {
  const button = event.target.closest('.line-tab');
  if (!button || button.dataset.line === state.line) return;
  state.line = button.dataset.line;
  state.category = '';
  renderCategoryOptions();
  resetView();
});

$('#categorySelect').addEventListener('change', event => {
  state.category = event.target.value;
  resetView();
});

$('#angleFilter').addEventListener('click', event => {
  const button = event.target.closest('button[data-angle]');
  if (!button) return;
  state.angle = button.dataset.angle;
  resetView();
});

$('#viewFilter').addEventListener('click', event => {
  const button = event.target.closest('button[data-view]');
  if (!button) return;
  state.view = button.dataset.view;
  resetView();
});

let searchTimer;
$('#searchInput').addEventListener('input', event => {
  $('#searchClear').hidden = !event.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = event.target.value.trim().toLowerCase();
    resetView();
  }, 120);
});

$('#searchClear').addEventListener('click', () => {
  $('#searchInput').value = '';
  state.query = '';
  resetView();
  $('#searchInput').focus();
});

$('#filterToggle').addEventListener('click', () => {
  const open = $('#filterPanel').classList.toggle('open');
  $('#filterToggle').setAttribute('aria-expanded', String(open));
});

$('#resetFilters').addEventListener('click', resetAll);
$('#activeFilters').addEventListener('click', event => {
  const button = event.target.closest('button[data-clear]');
  if (!button) return;
  const key = button.dataset.clear;
  if (key === 'line') { state.line = ''; state.category = ''; renderTabs(); renderCategoryOptions(); }
  if (key === 'category') state.category = '';
  if (key === 'angle') state.angle = '';
  if (key === 'query') { state.query = ''; $('#searchInput').value = ''; }
  if (key === 'view') state.view = 'pose';
  resetView();
});

grid.addEventListener('click', event => {
  if (event.target.closest('#emptyReset')) { resetAll(); return; }
  const card = event.target.closest('.pose-card[data-index]');
  if (!card) return;
  const index = Number(card.dataset.index);
  const entry = currentList[index];
  const angleButton = event.target.closest('.angle-thumb');
  if (angleButton && state.view === 'pose') {
    entry.item = entry.group.angles[angleButton.dataset.angle];
    updateCardPreview(card, entry);
  }
  openViewer(index, entry.item);
});

grid.addEventListener('mouseover', event => {
  const button = event.target.closest('.angle-thumb');
  if (!button || state.view !== 'pose') return;
  const card = button.closest('.pose-card[data-index]');
  const entry = currentList[Number(card.dataset.index)];
  const item = entry.group.angles[button.dataset.angle];
  if (!item || entry.item === item) return;
  entry.item = item;
  updateCardPreview(card, entry);
});

grid.addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.pose-card[data-index]')) {
    event.preventDefault();
    const index = Number(event.target.dataset.index);
    openViewer(index, currentList[index].item);
  }
});

$('#loadMore').addEventListener('click', () => {
  state.shown = Math.min(state.shown + PAGE_SIZE[state.view], currentList.length);
  render(true);
});

function openViewer(index, item) {
  preview3D?.hide();
  viewerState.mode = "image";
  viewerState.index = index;
  viewerState.item = item;
  viewerState.returnFocus = document.activeElement;
  $('#viewer').hidden = false;
  document.body.classList.add('viewer-open');
  showViewer();
  $('#viewerClose').focus({ preventScroll: true });
}

function closeViewer() {
  if ($('#viewer').hidden) return;
  viewerState.token++;
  preview3D?.hide();
  $('#viewer').hidden = true;
  document.body.classList.remove('viewer-open');
  if (viewerState.returnFocus && document.contains(viewerState.returnFocus)) viewerState.returnFocus.focus({ preventScroll: true });
}

function showViewer() {
  const entry = currentList[viewerState.index];
  if (!entry) return;
  const item = viewerState.item || entry.item;
  const group = entry.group;
  viewerState.item = item;
  entry.item = item;
  const token = ++viewerState.token;
  const image = $('#viewerImage');
  image.src = item.缩略图;
  image.alt = `${item.姿势名称} · ${item.角度}`;
  image.classList.add('is-loading');
  $('#imageStatus').textContent = t('loadingImage');
  $('#imageStatus').hidden = false;
  const full = new Image();
  full.decoding = 'async';
  full.onload = () => {
    if (token !== viewerState.token) return;
    image.src = item.原图;
    image.classList.remove('is-loading');
    $('#imageStatus').hidden = true;
  };
  full.onerror = () => {
    if (token !== viewerState.token) return;
    image.classList.remove('is-loading');
    $('#imageStatus').textContent = t('imageError');
    $('#imageStatus').hidden = false;
  };
  full.src = item.原图;

  $('#viewerNumber').textContent = item.姿势编号 || 'POSE';
  $('#viewerPosition').textContent = `${viewerState.index + 1} / ${currentList.length}`;
  $('#viewerTitle').textContent = item.姿势名称;
  $('#viewerId').textContent = item.id;
  $('#copyId').textContent = t('copyId');
  $('#viewerMeta').innerHTML = [[t('system'), item.体系], [t('poseNumber'), item.姿势编号 || '—'], [t('category'), item.分类 || '—'], [t('currentView'), item.角度 || '—'], [t('imageSize'), '900 × 1200 PNG']].map(([key, value]) => `<dt>${key}</dt><dd>${esc(value)}</dd>`).join('');
  $('#viewerAngles').innerHTML = ANGLES.filter(angle => group.angles[angle]).map(angle => {
    const angleItem = group.angles[angle];
    return `<button class="angle-thumb${angleItem === item ? ' on' : ''}" type="button" data-angle="${esc(angle)}" aria-label="${esc(t('switchToAngle', {angle}))}"><img src="${esc(angleItem.缩略图)}" alt="${esc(angle)}"><span>${esc(angle)}</span></button>`;
  }).join('');
  const download = $('#downloadImage');
  download.href = item.原图;
  download.setAttribute('download', `${item.id}.png`);
  $('#openImage').href = item.原图;
  const available = hasPose3D(item.id);
  $('#studioPose').href = `studio/?lang=${LANG}&appendPose=${encodeURIComponent(item.id)}`;
  $('#studioPose').setAttribute('aria-disabled', String(!available));
  $('#studioPose').textContent = t(available ? 'openStudio' : 'pending3d');
  updateViewerMode();
}

function updateViewerMode() {
  const on = experimental3D && viewerState.mode === '3d';
  $('#viewerStage').classList.toggle('mode-3d', on);
  $('#viewerImageMode').setAttribute('aria-pressed', String(!on));
  $('#viewer3dMode').setAttribute('aria-pressed', String(on));
  if (on) preview3D?.show($('#viewerStage'), viewerState.item, {interactive: true, delay: 0});
  else preview3D?.hide();
}
$('#viewerImageMode').onclick = () => { viewerState.mode = 'image'; updateViewerMode(); };
$('#viewer3dMode').onclick = () => { if (experimental3D) { viewerState.mode = '3d'; updateViewerMode(); } };
$('#studioPose').addEventListener('click', event => {
  if (!experimental3D || !hasPose3D(viewerState.item.id)) event.preventDefault();
});
grid.addEventListener('pointerover', event => {
  if (!experimental3D || event.pointerType === 'touch' || !$('#viewer').hidden) return;
  const card = event.target.closest('.pose-card[data-index]');
  if (!card || card.contains(event.relatedTarget)) return;
  const item = currentList[Number(card.dataset.index)]?.item;
  if (item) preview3D?.show(card.querySelector('.card-image'), item);
});
grid.addEventListener('pointerout', event => {
  const card = event.target.closest('.pose-card[data-index]');
  if (card && !card.contains(event.relatedTarget) && $('#viewer').hidden) preview3D?.hide();
});
function stepAngle(direction) {
  const group = currentList[viewerState.index]?.group;
  if (!group || group.order.length < 2) return;
  const current = group.order.indexOf(viewerState.item);
  viewerState.item = group.order[(current + direction + group.order.length) % group.order.length];
  showViewer();
}

function stepPose(direction) {
  const next = viewerState.index + direction;
  if (next < 0 || next >= currentList.length) return;
  const angle = viewerState.item.角度;
  viewerState.index = next;
  viewerState.item = currentList[next].group.angles[angle] || currentList[next].item;
  showViewer();
}

$('#viewerClose').addEventListener('click', closeViewer);
$('#viewer').addEventListener('click', event => { if (event.target === $('#viewer')) closeViewer(); });
$('#anglePrev').addEventListener('click', () => stepAngle(-1));
$('#angleNext').addEventListener('click', () => stepAngle(1));
$('#viewerAngles').addEventListener('click', event => {
  const button = event.target.closest('button[data-angle]');
  if (!button) return;
  viewerState.item = currentList[viewerState.index].group.angles[button.dataset.angle];
  showViewer();
});

$('#copyId').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(viewerState.item.id);
    $('#copyId').textContent = t('copied');
  } catch {
    $('#copyId').textContent = t('copyManual');
  }
});

let touchStart = null;
$('#viewerStage').addEventListener('touchstart', event => {
  if (viewerState.mode === '3d') return;
  const touch = event.touches[0];
  touchStart = { x: touch.clientX, y: touch.clientY };
}, { passive: true });
$('#viewerStage').addEventListener('touchend', event => {
  if (viewerState.mode === '3d') return;
  if (!touchStart) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStart.x;
  const dy = touch.clientY - touchStart.y;
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) stepAngle(dx < 0 ? 1 : -1);
  touchStart = null;
}, { passive: true });

document.addEventListener('keydown', event => {
  if (!$('#viewer').hidden) {
    if (event.key === 'Escape') closeViewer();
    else if (event.key === 'ArrowRight') stepAngle(1);
    else if (event.key === 'ArrowLeft') stepAngle(-1);
    else if (event.key === 'ArrowDown') { event.preventDefault(); stepPose(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); stepPose(-1); }
    return;
  }
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
    event.preventDefault();
    $('#searchInput').focus();
  }
});

document.querySelectorAll('[data-info]').forEach(button => {
  button.addEventListener('click', () => {
    const info = { title: t(button.dataset.info), html: t(button.dataset.info + 'Html') };
    $('#infoTitle').textContent = info.title;
    $('#infoContent').innerHTML = info.html;
    $('#infoDialog').showModal();
  });
});
$('#infoClose').addEventListener('click', () => $('#infoDialog').close());
$('#infoDialog').addEventListener('click', event => { if (event.target === $('#infoDialog')) $('#infoDialog').close(); });

function applyLanguage() {
  document.documentElement.lang = languages[LANG];
  document.title = t('pageTitle');
  $('#studioNav').href = `studio/?lang=${LANG}`;
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach(node => { node.innerHTML = t(node.dataset.i18nHtml); });
  for (const attribute of ['aria-label', 'placeholder', 'title']) {
    document.querySelectorAll(`[data-i18n-${attribute}]`).forEach(node => {
      node.setAttribute(attribute, t(node.getAttribute(`data-i18n-${attribute}`)));
    });
  }
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
    document.querySelector(selector)?.setAttribute('content', t('description'));
  }
  for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) {
    document.querySelector(selector)?.setAttribute('content', t('pageTitle'));
  }
  document.querySelector('meta[property="og:locale"]').content = {zh:'zh_CN',en:'en_US',ja:'ja_JP'}[LANG];
  const canonical = 'https://zhuzhe1983.github.io/ai-pose-gallery-zh/' + (LANG === 'zh' ? '' : `?lang=${LANG}`);
  document.querySelector('link[rel="canonical"]').href = canonical;
  document.querySelector('meta[property="og:url"]').content = canonical;
  ANGLES.push(...['angleFront', 'angleHigh', 'angleLow', 'angleSide', 'angleDiag'].map(key => t(key)));
}

$('#languageSelect').value = LANG;
$('#languageSelect').addEventListener('change', event => {
  const lang = event.target.value;
  try { localStorage.setItem('pose-language', lang); } catch {}
  const url = new URL(location.href);
  url.searchParams.set('lang', lang);
  location.assign(url.href);
});

async function readJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
  return response.json();
}

(async () => {
  try {
    const translations = await readJSON('data/ui.json');
    UI = translations[LANG];
    applyLanguage();
    prepareData(await readJSON(`data/pose-${LANG}.json`));
    syncExperimental3D();
    $('#experimental3dToggle').disabled = false;
  } catch (error) {
    console.error(error);
    $('#resultCount').textContent = t('loadError');
    grid.innerHTML = `<div class="empty"><h3>${esc(t('loadErrorTitle'))}</h3><p>${esc(t('loadErrorHint'))}</p><button type="button" onclick="location.reload()">${esc(t('reload'))}</button></div>`;
  }
})();
})();
