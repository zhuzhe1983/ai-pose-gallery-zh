const text = {
  zh: {
    local: '本地预览', studio: '打开工作台 ↗', eyebrow: 'OFFLINE / 本机产物', title: '转换进度与图像对照', description: '从磁盘读取真实产物。识别、拟合、落地和正式验收分别统计。', connecting: '正在连接本机服务…', refresh: '立即刷新', method: '当前算法：Sketch2Pose 的 ONNX 2D 前段 + 原创受限拟合器。不是完整 Sketch2Pose；检测峰值和重投影误差不代表 3D 准确率。', readonly: '本机只读 · 每 3 秒刷新', searchLabel: '查找', searchPlaceholder: '名称、文件名或姿势组', filterLabel: '显示', viewLabel: '视角', approvalNote: '草稿与“已落地”均不等于正式验收。', loadMore: '显示更多', auditNote: '旧手工预设单列审查，不计入离线拟合进度；全部仍待校对。', footer: '仅服务本机文件，无上传接口。研究权重、脚本和系统文件不通过预览服务公开。', protocol: '进度文件协议 ↗', connected: '已连接本机', offline: '连接中断，保留上次读取结果；服务恢复后自动刷新。', staticOnly: '此页面需要本地预览服务：python3 scripts/offline-pose/preview_server.py', scanned: '最近扫描', inventory: '图库总量', images: '张图片', groups: '个姿势组', detection: '2D 已识别', fitting: '3D 拟合草稿', grounded: '已做落地处理 · 待校对', verified: '正式验收', controls: '张空白对照另计', groundedNote: '完成落地处理，不代表各支撑部位正确接触', verifiedNote: '仅统计正式 verified 姿势组', active: '已有离线产物', all: '全部图片', not_started: '未运行', queued: '已排队', running: '运行中', failed: '失败', draft: '3D 草稿', needs_review: '待校对', stale: '运行状态已过期', rejected: '负对照 · 已排除', noRunning: '当前未报告正在运行的任务', jobs: '运行任务', failures: '失败任务', staleJobs: '过期状态', currentMesh: '当前工作台模型', shown: '显示', of: '/', noResults: '没有符合筛选条件的记录。', source: '原图', overlay: '2D 关键点叠图', render: '3D 拟合渲染', noOverlay: '尚无 2D 叠图', noRender: '尚无已关联的拟合渲染', historical: '历史渲染 · 未绑定最新场景', raw: '关键点 JSON', fitReport: '拟合报告', scene: '场景 JSON', openScene: '在工作台打开结果 ↗', legacy: '旧版模型草稿', model: '场景模型', reprojection: '重投影误差', rmsNote: '仅对推断的 2D 点，不是 3D 准确率', control: '空白负对照', controlNote: '无人物的图片也可能返回 18 点；本项不计入图库完成数。', stage: '阶段', landmarks: '2D 识别', fit: '受限拟合', details: '目测排除点 / 原始说明', excluded: '排除点', manualLink: '查看旧手工预设 ↗', auditTitle: '旧手工预设审查', major: '明显偏差', minor: '仍需微调', original: '原图 ↗', draftRender: '草稿渲染 ↗', partialWarning: '部分文件暂不可读或状态不一致；保留已验证存在的产物，稍后重试。', heartbeatNote: '运行状态超过 180 秒未更新，不能确认任务仍在执行。', empty: '等待本地产物', units: { steps: '步', images: '张图片', groups: '个姿势组' },
  },
  en: {
    local: 'Local preview', studio: 'Open studio ↗', eyebrow: 'OFFLINE / LOCAL ARTIFACTS', title: 'Conversion progress & comparisons', description: 'Read actual files from disk. Detection, fitting, grounding and formal approval are counted separately.', connecting: 'Connecting to local service…', refresh: 'Refresh now', method: 'Method: Sketch2Pose ONNX 2D front end + an original constrained fitter. This is not full Sketch2Pose. Heatmap peaks and reprojection errors do not measure 3D accuracy.', readonly: 'Local, read-only · refreshes every 3s', searchLabel: 'Search', searchPlaceholder: 'Name, filename or pose group', filterLabel: 'Show', viewLabel: 'View', approvalNote: 'Drafts and grounded scenes are not formally approved.', loadMore: 'Show more', auditNote: 'Old manual presets are audited separately and excluded from offline fitting counts. All still need review.', footer: 'Local files only; no upload endpoint. Research weights, scripts and system files are not exposed by this preview.', protocol: 'Progress-file protocol ↗', connected: 'Local service connected', offline: 'Connection lost. Showing the last snapshot; refresh resumes automatically.', staticOnly: 'Start the local service: python3 scripts/offline-pose/preview_server.py', scanned: 'Last scan', inventory: 'Gallery inventory', images: 'images', groups: 'pose groups', detection: '2D detected', fitting: '3D fit drafts', grounded: 'Ground placement · needs review', verified: 'Formally verified', controls: 'blank controls counted separately', groundedNote: 'Ground placement does not verify support contacts', verifiedNote: 'Only formally verified pose groups', active: 'With offline artifacts', all: 'All images', not_started: 'Not run', queued: 'Queued', running: 'Running', failed: 'Failed', draft: '3D draft', needs_review: 'Needs review', stale: 'Stale running status', rejected: 'Negative control · excluded', noRunning: 'No task is currently declared running by the progress file', jobs: 'Running tasks', failures: 'Failed tasks', staleJobs: 'Stale statuses', currentMesh: 'Current studio model', shown: 'Showing', of: 'of', noResults: 'No records match these filters.', source: 'Source image', overlay: '2D landmark overlay', render: '3D fitted render', noOverlay: 'No 2D overlay yet', noRender: 'No linked fitted render yet', historical: 'Historical render · not tied to the latest scene', raw: 'Landmarks JSON', fitReport: 'Fit report', scene: 'Scene JSON', openScene: 'Open result in studio ↗', legacy: 'Older model draft', model: 'Scene model', reprojection: 'Reprojection error', rmsNote: 'Against inferred 2D points; not 3D accuracy', control: 'Blank negative control', controlNote: 'A blank image can still return 18 points. It is excluded from gallery completion counts.', stage: 'Stage', landmarks: '2D detection', fit: 'Constrained fit', details: 'Visual exclusions / original notes', excluded: 'Excluded points', manualLink: 'View old manual preset ↗', auditTitle: 'Old manual preset audit', major: 'Major mismatch', minor: 'Needs refinement', original: 'Source ↗', draftRender: 'Draft render ↗', partialWarning: 'Some files are temporarily unreadable or inconsistent. Existing validated artifacts remain visible; retrying shortly.', heartbeatNote: 'No heartbeat for over 180 seconds; execution is unconfirmed.', empty: 'Waiting for local artifacts', units: { steps: 'steps', images: 'images', groups: 'pose groups' },
  },
  ja: {
    local: 'ローカルプレビュー', studio: 'スタジオを開く ↗', eyebrow: 'OFFLINE / ローカル成果物', title: '変換の進捗と画像比較', description: 'ディスク上の実際のファイルを読み取ります。検出・フィッティング・接地・正式承認を別々に集計します。', connecting: 'ローカルサービスに接続中…', refresh: '今すぐ更新', method: '方式：Sketch2Pose の ONNX 2D 前段 + 独自の制約付きフィッター。完全な Sketch2Pose ではありません。ヒートマップのピーク値や再投影誤差は 3D 精度を表しません。', readonly: 'ローカル・読み取り専用 · 3 秒ごとに更新', searchLabel: '検索', searchPlaceholder: '名前・ファイル名・ポーズグループ', filterLabel: '表示', viewLabel: '視点', approvalNote: '下書きや接地済みシーンは正式承認ではありません。', loadMore: 'さらに表示', auditNote: '既存の手動プリセットは別に確認し、オフライン変換の件数に含めません。すべて要確認です。', footer: 'ローカルファイルのみ。アップロード機能はありません。研究用の重み・スクリプト・システムファイルは公開しません。', protocol: '進捗ファイルの仕様 ↗', connected: 'ローカル接続済み', offline: '接続が切れました。前回の結果を表示し、復旧後に自動更新します。', staticOnly: 'ローカルサービスを起動：python3 scripts/offline-pose/preview_server.py', scanned: '最終スキャン', inventory: 'ギャラリー全体', images: '枚', groups: 'ポーズグループ', detection: '2D 検出済み', fitting: '3D 下書き', grounded: '接地処理済み・要確認', verified: '正式承認', controls: '枚の白紙対照を別途集計', groundedNote: '接地処理は支持部位の接触を保証しません', verifiedNote: '正式な verified グループのみ', active: '成果物のある画像', all: 'すべての画像', not_started: '未実行', queued: '待機中', running: '実行中', failed: '失敗', draft: '3D 下書き', needs_review: '要確認', stale: '実行状態が期限切れ', rejected: '陰性対照・除外済み', noRunning: '進捗ファイル上、現在実行中のタスクはありません', jobs: '実行中', failures: '失敗', staleJobs: '期限切れ', currentMesh: '現在のスタジオモデル', shown: '表示', of: '/', noResults: '条件に一致する記録がありません。', source: '元画像', overlay: '2D 骨格の重ね合わせ', render: '3D フィット画像', noOverlay: '2D 画像はまだありません', noRender: '関連付けた 3D 画像はまだありません', historical: '過去の画像・最新シーンとの対応は未確認', raw: 'キーポイント JSON', fitReport: 'フィット結果', scene: 'シーン JSON', openScene: 'スタジオで結果を開く ↗', legacy: '旧モデルの下書き', model: 'シーンのモデル', reprojection: '再投影誤差', rmsNote: '推定 2D 点に対する誤差。3D 精度ではありません', control: '白紙の陰性対照', controlNote: '白紙でも 18 点が出力されます。ギャラリーの完了件数には含めません。', stage: '段階', landmarks: '2D 検出', fit: '制約付きフィット', details: '目視による除外点・原文メモ', excluded: '除外点', manualLink: '旧手動プリセットを見る ↗', auditTitle: '旧手動プリセットの確認', major: '大きな相違', minor: '微調整が必要', original: '元画像 ↗', draftRender: '下書き画像 ↗', partialWarning: '一部のファイルが読み取り中または不整合です。確認できた成果物を表示し、再試行します。', heartbeatNote: '180 秒以上更新がなく、実行の継続を確認できません。', empty: 'ローカル成果物を待っています', units: { steps: 'ステップ', images: '枚', groups: 'グループ' },
  },
};
Object.assign(text.zh, {
  tasks: '个任务', viewCount: '个视角', sceneNone: '尚无 3D 场景', sceneSingle: '1 个视角有 3D 场景，其他视角尚待确认',
  sceneShared: '个视角使用同一 3D 姿势；相机独立，仍需对照校验',
  sceneConflict: '视角场景不一致，需复核', sceneUnknown: '场景信息不完整或版本不同，无法确认是否共享',
  view_f: '正面', view_d: '斜侧', view_s: '侧面', view_hi: '俯视', view_lo: '仰视', view_control: '空白对照'
});
Object.assign(text.en, {
  tasks: 'tasks', viewCount: 'views', sceneNone: 'No 3D scene yet', sceneSingle: 'One view has a 3D scene; other views remain unconfirmed',
  sceneShared: 'views share one 3D pose; cameras are independent and still require review',
  sceneConflict: 'View scenes differ; review required', sceneUnknown: 'Scenes are incomplete or use different schemas; shared pose cannot be confirmed',
  view_f: 'Front', view_d: 'Diagonal', view_s: 'Side', view_hi: 'Above', view_lo: 'Below', view_control: 'Blank control'
});
Object.assign(text.ja, {
  tasks: '件のタスク', viewCount: '視点', sceneNone: '3D シーンはまだありません', sceneSingle: '3D シーンがあるのは 1 視点のみです。他の視点は未確認です',
  sceneShared: '視点は同じ 3D ポーズを共有。カメラは別々で、照合が必要です',
  sceneConflict: '視点ごとのシーンが異なります。要確認', sceneUnknown: 'シーンが不完全かスキーマが異なるため、共有を確認できません',
  view_f: '正面', view_d: '斜め', view_s: '側面', view_hi: '俯瞰', view_lo: 'あおり', view_control: '白紙対照'
});

text.zh.comparison = '多视角实验对照 ↗'; text.en.comparison = 'Multi-view experiment ↗'; text.ja.comparison = '多視点実験の比較 ↗';
text.zh.multiReport = '多视角实验报告'; text.en.multiReport = 'Multi-view experiment report'; text.ja.multiReport = '多視点実験レポート';
for (const [locale, labels] of Object.entries({
  zh: ['本地审核', '已初筛，待目审', '需修正', '尚不支持', '本地审核通过', '文件已变更，需重审', '审核记录不完整', '审核标准 ↗', '已目审', '通过数据 ↗'],
  en: ['Local review', 'Screened; visual review pending', 'Needs correction', 'Unsupported', 'Locally approved', 'Changed; review again', 'Incomplete review', 'Review criteria (中文) ↗', 'Visually reviewed', 'Approved data ↗'],
  ja: ['ローカル審査', '一次確認済み・目視待ち', '要修正', '未対応', 'ローカル承認済み', '変更あり・再審査', '審査記録が不完全', '審査基準（中文）↗', '目視確認済み', '承認データ ↗'],
})) ['localReview', 'review_screened', 'review_needs_correction', 'review_unsupported', 'review_approved', 'review_outdated', 'review_incomplete', 'reviewCriteria', 'visualReviewed', 'approvedData'].forEach((key, i) => text[locale][key] = labels[i]);
const $ = (id) => document.getElementById(id);
let lang = new URLSearchParams(location.search).get('lang') || localStorage.getItem('pose-preview-language') || 'zh';
if (!text[lang]) lang = 'zh';
let state = null, busy = false, limit = 12, lastSignature = '', lastAuditSignature = '', errorMessage = '';
const t = (key) => text[lang][key] ?? key;
const node = (tag, content, className) => { const n = document.createElement(tag); if (content !== undefined) n.textContent = content; if (className) n.className = className; return n; };
function link(label, url, className) { const n = node('a', label, className); n.href = url; n.target = '_blank'; n.rel = 'noopener'; return n; }
function setLanguage(value) {
  lang = value; localStorage.setItem('pose-preview-language', lang); document.documentElement.lang = lang;
  const url = new URL(location); url.searchParams.set('lang', lang); history.replaceState(null, '', url);
  document.querySelectorAll('[data-t]').forEach(n => { n.textContent = t(n.dataset.t); });
  $('language').value = lang; $('search').placeholder = t('searchPlaceholder'); $('studioLink').href = `/studio/?lang=${lang}`;
  const selected = $('filter').value || 'active'; $('filter').replaceChildren();
  for (const key of ['active', 'all', 'running', 'needs_review', 'draft', 'failed', 'not_started', 'queued', 'stale', 'rejected', 'review_approved', 'review_needs_correction', 'review_screened', 'review_unsupported', 'review_outdated']) { const o = node('option', t(key)); o.value = key; $('filter').append(o); }
  $('filter').value = selected; $('view').options[0].textContent = t('all');
  render(true);
}
function metric(label, value, detail, denominator) {
  const box = node('div', undefined, 'metric'); box.append(node('div', label, 'label'));
  const number = node('strong', String(value)); if (denominator !== undefined) number.append(node('span', ` / ${denominator}`));
  box.append(number, node('small', detail)); return box;
}
function figure(label, url, missing) {
  const f = node('figure'); f.append(node('figcaption', label));
  if (url) { const a = link('', url, 'imagebox'); const image = node('img'); image.src = url; image.alt = label; image.loading = 'lazy'; image.decoding = 'async'; a.append(image); f.append(a); }
  else f.append(node('div', missing, 'empty-image'));
  return f;
}
function makeView(item) {
  const section = node('details', undefined, 'view-block');
  section.dataset.viewId = item.id;
  section.open = item.active;
  const summary = node('summary', undefined, 'view-summary');
  const heading = node('span', undefined, 'view-name');
  heading.append(node('strong', t(`view_${item.view || 'control'}`)), node('span', item.id, 'filename'));
  summary.append(heading, node('span', t(item.status), `badge ${item.status}`));
  section.append(summary);
  if (item.task?.message || item.status === 'stale') section.append(node('p', item.status === 'stale' ? t('heartbeatNote') : item.task.message, 'task-message'));
  if (item.task?.progress) {
    const p = item.task.progress, row = node('div', undefined, 'job-progress'), progress = node('progress'); progress.max = p.total; progress.value = p.completed;
    row.append(progress, node('span', `${p.completed} / ${p.total} ${text[lang].units[p.unit] || p.unit}`)); section.append(row);
  }
  const a = item.artifacts, comparisons = node('div', undefined, 'comparison');
  comparisons.append(figure(t('source'), item.source, ''), figure(t('overlay'), a.overlay, t('noOverlay')), figure(a.render ? t('render') : a.historicalRender ? t('historical') : t('render'), a.render || a.historicalRender, t('noRender'))); section.append(comparisons);
  const bottom = node('div', undefined, 'card-bottom');
  for (const [key, label] of [['landmarks', 'raw'], ['fit', 'fitReport'], ['scene', 'scene'], ['comparison', 'comparison'], ['multiReport', 'multiReport']]) if (a[key]) bottom.append(link(t(label), a[key]));
  if (item.studioURL) bottom.append(link(t('openScene'), `${item.studioURL}&lang=${lang}`, 'primary'));
  const details = [];
  if (item.stage !== 'not_started') details.push(`${t('stage')}: ${t(item.stage)}`);
  if (item.sceneMeshes?.length) details.push(`${t('model')}: ${item.sceneMeshes.join(', ')}`);
  if (Number.isFinite(item.fit?.rmsPixels)) details.push(`${t('reprojection')}: ${item.fit.rmsPixels.toFixed(1)} px · ${t('rmsNote')}`);
  if (details.length) {
    const detail = node('p', undefined, 'detail-note'); if (item.legacyMesh) detail.append(node('span', t('legacy'), 'legacy')); detail.append(document.createTextNode(details.join(' · '))); bottom.append(detail);
  }
  if (a.historicalRender && !a.render) bottom.append(node('p', t('historical'), 'detail-note warning'));
  if (item.control) bottom.append(node('p', t('controlNote'), 'detail-note warning'));
  if (item.review) {
    const d = node('details', undefined, 'card-details'); d.append(node('summary', t('details')), node('p', `${t('excluded')}: ${(item.review.excludePoints || []).join(', ') || '—'}`), node('p', item.review.reason || ''));
    bottom.append(d);
  }
  if (item.manualPreset?.render) bottom.append(link(t('manualLink'), item.manualPreset.render));
  section.append(bottom); return section;
}
function makeGroup(group) {
  const card = node('article', undefined, 'card'); card.dataset.id = group.id;
  const head = node('div', undefined, 'card-head'), title = node('div');
  title.append(node('h2', group.control ? t('control') : group.title?.[lang] || group.id), node('div', group.id, 'filename'));
  head.append(title, node('span', `${group.views.length} ${t('viewCount')}`, 'badge')); card.append(head);
  if (!group.control) {
    const key = {none:'sceneNone',single:'sceneSingle',shared:'sceneShared',conflict:'sceneConflict',unknown:'sceneUnknown'}[group.sceneConsistency] || 'sceneUnknown';
    const label = group.sceneConsistency === 'shared' ? `${group.sceneCount} ${t(key)}` : t(key);
    card.append(node('p', label, `group-consistency ${group.sceneConsistency}`));
  }
  if (group.localReview) {
    const review = group.localReview, box = node('div', undefined, 'local-review-card');
    box.append(node('strong', `${t('localReview')}: ${t('review_' + review.status)}`));
    if (review.visualViews?.length) box.append(node('p', `${t('visualReviewed')}: ${review.visualViews.join(' / ')}`));
    for (const issue of review.issues || []) box.append(node('p', issue));
    for (const discrepancy of review.sourceDiscrepancies || []) box.append(node('p', discrepancy));
    card.append(box);
  }
  const order = ['f','d','s','hi','lo'];
  for (const view of [...group.views].sort((a,b)=>order.indexOf(a.view)-order.indexOf(b.view))) card.append(makeView(view));
  return card;
}
function filteredGroups() {
  const query = $('search').value.toLocaleLowerCase().trim(), filter = $('filter').value, view = $('view').value;
  return (state?.groups || []).flatMap(group => {
    const matchesQuery = !query || [group.id, ...Object.values(group.title || {}), ...group.views.map(i=>i.id)].join(' ').toLocaleLowerCase().includes(query);
    const visibleViews = view === 'all' ? group.views : group.views.filter(i=>i.view === view);
    const matchesStatus = filter === 'all' || (filter.startsWith('review_') ? group.localReview?.status === filter.slice(7) : filter === 'active' ? visibleViews.some(i=>i.active) : visibleViews.some(i=>i.status === filter));
    return matchesQuery && matchesStatus && visibleViews.length ? [{...group, views:visibleViews}] : [];
  });
}
function render(force = false) {
  $('notice').hidden = !errorMessage && !state?.warnings?.length;
  $('notice').textContent = errorMessage || (state?.warnings?.length ? t('partialWarning') : '');
  if (!state) { if (errorMessage) $('connection').textContent = t('offline'); return; }
  $('connection').textContent = errorMessage ? t('offline') : t('connected');
  $('scanned').textContent = `${t('scanned')} ${new Date(state.scannedAt).toLocaleTimeString(lang)}`;
  const c = state.counts;
  $('localReview').hidden = !state.localReview;
  if (state.localReview) {
    const r = state.localReview.counts;
    $('localReview').replaceChildren(node('strong', `${t('review_approved')} ${r.approved} · ${t('visualReviewed')} ${r.visualReviewed} · ${t('review_needs_correction')} ${r.needs_correction} · ${t('review_unsupported')} ${r.unsupported}`), link(t('reviewCriteria'), './REVIEW.md'), link(t('approvedData'), '/api/local-approved'));
  }
  $('metrics').replaceChildren(metric(t('inventory'), c.images, `${c.groups} ${t('groups')}`), metric(t('detection'), c.detectedImages, `${c.detectedGroups} ${t('groups')} · ${c.controls} ${t('controls')}`), metric(t('fitting'), c.fitImages, `${c.fitGroups} ${t('groups')}`), metric(t('grounded'), c.groundedImages, t('groundedNote')), metric(t('verified'), c.verifiedGroups, t('verifiedNote'), c.groups));
  $('activityText').textContent = c.runningGroups ? `${t('jobs')}: ${c.runningGroups}` : t('noRunning');
  if (c.taskGroups) $('activityText').textContent += ` · ${lang === 'zh' ? '已处理' : lang === 'ja' ? '処理済み' : 'Processed'} ${c.processedGroups} / ${c.taskGroups} · ${t('queued')} ${c.queuedGroups}`;
  if (c.failedGroups || c.staleGroups) $('activityText').textContent += ` · ${t('failures')}: ${c.failedGroups} · ${t('staleJobs')}: ${c.staleGroups}`;
  $('modelText').textContent = state.modelRevision ? `${t('currentMesh')}: ${state.modelRevision}` : '';
  const items = filteredGroups(), visible = items.slice(0, limit);
  const imageCount = items.filter(group=>!group.control).reduce((sum, group) => sum + group.views.length, 0);
  const controls = items.filter(group=>group.control).length;
  $('resultCount').textContent = `${t('shown')} ${visible.length} ${t('of')} ${items.length} ${t('tasks')} · ${imageCount} ${t('images')}${controls ? ` · ${controls} ${t('controls')}` : ''}`;
  const signature = JSON.stringify([lang, visible]);
  if (force || signature !== lastSignature) {
    const detailsState = new Map([...$('cards').querySelectorAll('.view-block')].map(n => [n.dataset.viewId, n.open]));
    const openNotes = new Set([...$('cards').querySelectorAll('.card-details[open]')].map(n => n.closest('.view-block').dataset.viewId));
    $('cards').replaceChildren(...visible.map(makeGroup));
    $('cards').querySelectorAll('.view-block').forEach(view => {
      if (detailsState.has(view.dataset.viewId)) view.open = detailsState.get(view.dataset.viewId);
      if (openNotes.has(view.dataset.viewId) && view.querySelector('.card-details')) view.querySelector('.card-details').open = true;
    });
    if (!visible.length) $('cards').append(node('div', t('noResults'), 'no-results'));
    lastSignature = signature;
  }
  $('loadMore').hidden = limit >= items.length;
  $('auditTitle').textContent = `${t('auditTitle')} · ${state.presetAudit.length}`;
  const auditSignature = JSON.stringify([lang, state.presetAudit]);
  if (force || auditSignature !== lastAuditSignature) { renderAudit(); lastAuditSignature = auditSignature; }
}
function renderAudit() {
  $('auditCards').replaceChildren(...(state?.presetAudit || []).map(p => {
    const box = node('article', undefined, 'audit-card'); box.append(node('h3', p.id), node('span', t(p.severity), `badge ${p.severity === 'major' ? 'failed' : 'draft'}`));
    // Review notes retain their original Chinese wording; state labels are localized.
    box.append(node('p', (p.issues || []).join(' ')), link(t('original'), p.source));
    if (p.render) box.append(link(t('draftRender'), p.render)); if (p.scene) box.append(link(t('scene'), p.scene)); return box;
  }));
}
async function refresh() {
  if (busy) return; busy = true; $('refresh').disabled = true;
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('/api/preview-state', {cache:'no-store', signal:controller.signal});
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const value = await response.json(); if (value.schema !== 'pose-atlas/local-preview@1') throw Error('Unexpected preview API');
    state = value; errorMessage = ''; render();
  } catch (error) { errorMessage = state ? t('offline') : `${t('staticOnly')} (${error.message})`; render(); }
  finally { clearTimeout(timeout); busy = false; $('refresh').disabled = false; }
}
$('language').addEventListener('change', e => setLanguage(e.target.value));
for (const id of ['filter', 'view', 'search']) $(id).addEventListener(id === 'search' ? 'input' : 'change', () => { limit = 12; render(true); });
$('refresh').addEventListener('click', refresh);
$('loadMore').addEventListener('click', () => { limit += 12; render(true); });
setLanguage(lang); refresh(); setInterval(refresh, 3000);
