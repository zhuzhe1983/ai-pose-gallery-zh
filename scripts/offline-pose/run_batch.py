#!/usr/bin/env python3
"""Resumable local gallery queue: per-pose shared fit, all views, honest failures.

Uses an explicitly supplied local adapter/weights. Never publishes output.
One writer owns the progress file; each completed group has a durable receipt.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone

from PIL import Image, ImageDraw
from fit_pose import Rig, observations
from fit_multiview import fit_multiview, write_json
from contacts import profile_for

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'experiments/sketch-pose-offline'))
from batch import load_adapter, sha256
from schema import validate_pose, EDGES


def now():
    return datetime.now(timezone.utc).isoformat()


def resolve_source(key):
    """Return (image_rel, detect_path, comparison_ref_path) for classic or WaveSpeed views."""
    classic = ROOT / 'img' / f'{key}.png'
    if classic.is_file():
        return f'img/{key}.png', classic, classic
    ws_img = ROOT / 'data/wavespeed/img' / f'{key}.webp'
    ws_line = ROOT / 'data/wavespeed/line' / f'{key}.webp'
    if ws_img.is_file() or ws_line.is_file():
        image_rel = f'data/wavespeed/img/{key}.webp' if ws_img.is_file() else f'data/wavespeed/line/{key}.webp'
        detect_path = ws_line if ws_line.is_file() else ws_img
        ref_path = ws_img if ws_img.is_file() else ws_line
        return image_rel, detect_path, ref_path
    return f'img/{key}.png', classic, classic


def is_duo_pose(pose):
    return pose.startswith(('duo_', 'ws_duo_', 'ws_couple_'))


def is_upper_pose(pose):
    return pose.startswith(('upper_', 'ws_upper_'))


def prior_for(pose, rig):
    if pose in rig.data['presets']:
        return None, 'existing_manual_draft'
    category = pose.split('_')[1]
    prior = {}
    if category in {'sit', 'side-sit', 'squat', 'kneel', 'floor', 'chair'}:
        for s in 'lr':
            prior[s + '_leg.raise'] = 90 if category in {'sit', 'side-sit', 'squat', 'chair'} else 15
            prior[s + '_knee.bend'] = 135 if category in {'squat', 'kneel', 'floor'} else 85
    elif category == 'lie' or '-lie' in pose:
        prior['body.bend'] = 90 if 'prone' in pose else -90
    elif any(tok in pose for tok in ('-kn-', 'kneel', 'all-fours')):
        for s in 'lr':
            prior[s + '_leg.raise'] = 15
            prior[s + '_knee.bend'] = 125
    elif 'chair' in pose:
        for s in 'lr':
            prior[s + '_leg.raise'] = 90
            prior[s + '_knee.bend'] = 85
    if any(tok in pose for tok in ('look-bk', '-bk-', 'rear-')) or pose.endswith('-bk'):
        # Default body.turn is -90 (facing camera); +90 faces away while keeping f camera at 0
        prior['body.turn'] = 90
    return prior, 'unreviewed_category_prior' if prior else 'neutral_prior_no_pose_evidence'


def make_overlay(source, record, out):
    with Image.open(source) as im:
        pic = im.convert('RGB').resize((450, 600))
    draw = ImageDraw.Draw(pic)
    pts = [(p['x'] * 450 / record['width'], p['y'] * 600 / record['height']) for p in record['points']]
    for a, b in EDGES:
        draw.line([pts[a], pts[b]], fill='#2584bd', width=2)
    for i, p in enumerate(pts):
        draw.ellipse((p[0] - 2, p[1] - 2, p[0] + 2, p[1] + 2), fill='#d24532')
        draw.text(p, str(i), fill='#b02924')
    pic.save(out)


class PersistentRenderer:
    """Keep one Chromium + Studio tab alive across groups to avoid ~4s browser startup per pose."""
    def __init__(self, url):
        self.url = url
        self.proc = None

    def _ensure(self):
        if self.proc and self.proc.poll() is None:
            return
        env = dict(os.environ)
        if not env.get('POSE_PLAYWRIGHT_MODULE'):
            candidate = Path.home() / '.codex/skills/develop-web-game/node_modules/playwright/index.mjs'
            if candidate.is_file():
                env['POSE_PLAYWRIGHT_MODULE'] = str(candidate)
        self.proc = subprocess.Popen(
            ['node', 'scripts/offline-pose/render-group.mjs', '--batch', '--url', self.url],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
        )

    def render(self, jobfile):
        self._ensure()
        self.proc.stdin.write(str(jobfile) + '\n')
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        if not line:
            stderr = self.proc.stderr.read() if self.proc.stderr else ''
            self.close()
            raise RuntimeError(f'Renderer exited unexpectedly: {stderr[-1200:]}')
        res = json.loads(line)
        if not res.get('ok'):
            raise RuntimeError(res.get('error', 'Render failed'))
        return res

    def close(self):
        if not self.proc:
            return
        try:
            if self.proc.poll() is None:
                try:
                    self.proc.stdin.close()
                except OSError:
                    pass
                try:
                    self.proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    self.proc.terminate()
                    try:
                        self.proc.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        self.proc.kill()
                        self.proc.wait()
        finally:
            self.proc = None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--adapter', required=True)
    parser.add_argument('--model', required=True)
    parser.add_argument('--rig', required=True)
    parser.add_argument('--run', required=True)
    parser.add_argument('--only', nargs='*')
    parser.add_argument('--prefix', default='', help='Process only pose IDs starting with prefix (e.g. ws_)')
    parser.add_argument('--max-evaluations', type=int, default=220)
    parser.add_argument('--url', default='http://127.0.0.1:8767/studio/')
    parser.add_argument('--threads', type=int, default=4)
    args = parser.parse_args()

    if not 1 <= args.max_evaluations <= 3000 or args.threads < 1:
        parser.error('Invalid evaluation/thread budget')
    if any(not Path(p).is_file() for p in [args.adapter, args.model, args.rig]):
        parser.error('Adapter, model and rig must be existing local files')
    if not args.run.replace('-', '').replace('_', '').isalnum():
        parser.error('Run ID must use ASCII letters/digits/-/_')

    os.chdir(ROOT)
    base = ROOT / 'output/offline-pose'
    base.mkdir(parents=True, exist_ok=True)
    lock = (base / 'batch.lock').open('w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        parser.exit(2, 'Another conversion worker owns the queue\n')

    run = base / 'runs' / args.run
    run.mkdir(parents=True, exist_ok=True)
    rig = Rig(json.loads(Path(args.rig).read_text()))
    groups = json.loads((ROOT / 'data/pose-3d-status.json').read_text())['poses']
    if args.prefix:
        groups = [g for g in groups if g['id'].startswith(args.prefix)]
    if args.only:
        unknown = set(args.only) - {g['id'] for g in groups}
        if unknown:
            parser.error('Unknown poses: ' + ','.join(sorted(unknown)))
        groups = [g for g in groups if g['id'] in args.only]
    groups.sort(key=lambda g: (g['id'] != 'solo_kneel_hands-thighs', g['id'] not in rig.data['presets'], g['id']))

    manifest = {
        'schema': 'pose-atlas/offline-run@1',
        'run': args.run,
        'rig_sha256': sha256(Path(args.rig)),
        'model_sha256': sha256(Path(args.model)),
        'adapter_sha256': sha256(Path(args.adapter)),
        'max_evaluations': args.max_evaluations,
        'threads': args.threads,
        'poses': groups,
        'scope': 'drafts only; duo/couple blocked; upper-body has no inferred lower body',
    }
    sources = sorted([*(ROOT / 'scripts/offline-pose').glob('*.py'), *(ROOT / 'scripts/offline-pose').glob('*.mjs'), *(ROOT / 'studio').glob('*.js')])
    manifest['pipeline_sha256'] = hashlib.sha256(b''.join(p.relative_to(ROOT).as_posix().encode() + b'\0' + p.read_bytes() for p in sources)).hexdigest()
    mf = run / 'manifest.json'
    if mf.exists() and json.loads(mf.read_text()) != manifest:
        parser.exit(2, 'Run inputs changed: choose a new --run ID to preserve previous results\n')
    write_json(mf, manifest)

    status_path = base / 'status.json'
    if status_path.exists() and not (run / 'previous-status.json').exists():
        shutil.copy2(status_path, run / 'previous-status.json')

    jobs = {}
    mutex = threading.RLock()
    active = []
    stop = threading.Event()
    for g in groups:
        for v in g['views']:
            key = f"{g['id']}_{v}"
            image_rel, _, _ = resolve_source(key)
            jobs[key] = {'image': image_rel, 'stage': 'queued', 'status': 'queued', 'updatedAt': now(), 'message': '已加入按姿势分组的全量队列'}

    def flush():
        with mutex:
            write_json(status_path, {'schema': 'pose-atlas/offline-progress@1', 'run': args.run, 'pid': os.getpid(), 'updatedAt': now(), 'jobs': list(jobs.values())})

    def update(keys, stage, status, message, **extra):
        with mutex:
            for key in keys:
                jobs[key].update(stage=stage, status=status, message=message, updatedAt=now(), **extra)
            flush()

    def heartbeat():
        while not stop.wait(15):
            with mutex:
                for key in active:
                    jobs[key]['updatedAt'] = now()
                flush()

    def interrupted(signum, _frame):
        raise KeyboardInterrupt(f'Signal {signum}')

    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    flush()
    thread = threading.Thread(target=heartbeat, daemon=True)
    thread.start()

    adapter = None
    model = None
    renderer = PersistentRenderer(args.url)
    (run / 'worker.pid').write_text(str(os.getpid()) + '\n')

    try:
        adapter = load_adapter(Path(args.adapter).resolve())
        model = adapter.load_model(Path(args.model).resolve(), args.threads)
        review_path = ROOT / 'output/sketch-pose-offline/review.json'
        review = json.loads(review_path.read_text()) if review_path.exists() else {}
        reviews = {Path(r['image']).stem: r for r in review.get('results', [])}
        detectdir = ROOT / 'output/sketch-pose-offline' / args.run
        detectdir.mkdir(parents=True, exist_ok=True)

        for number, group in enumerate(groups, 1):
            pose = group['id']
            keys = [f'{pose}_{v}' for v in group['views']]
            receipt = run / (pose + '.json')
            if receipt.exists():
                saved = json.loads(receipt.read_text())
                jobs.update(saved['jobs'])
                flush()
                continue
            active[:] = keys
            print(f'{number}/{len(groups)} {pose}: start', flush=True)
            if is_duo_pose(pose):
                update(keys, 'unsupported', 'failed', '单人 18 点识别器不能拆分双人/情侣；需要多人检测与角色匹配，未生成假双人姿势。')
                write_json(receipt, {'jobs': {k: jobs[k] for k in keys}})
                active.clear()
                continue
            try:
                records = []
                excluded = {}
                unusable = []
                ref_paths = {}
                for view, key in zip(group['views'], keys):
                    update([key], 'landmarks', 'running', '本地识别关键点；原始热图值未经概率校准')
                    image_rel, detect_source, ref_source = resolve_source(key)
                    ref_paths[view] = ref_source
                    record_path = detectdir / (key + '.json')
                    with Image.open(detect_source) as original:
                        actual_size = original.size
                    record = validate_pose(adapter.predict(model, detect_source), actual_size)
                    record.update(
                        image=image_rel,
                        body_region='upper' if is_upper_pose(pose) else 'full',
                        provenance={
                            'model_sha256': manifest['model_sha256'],
                            'adapter_sha256': manifest['adapter_sha256'],
                            'source_sha256': sha256(detect_source),
                        },
                    )
                    overlay = detectdir / (key + '.overlay.png')
                    make_overlay(detect_source, record, overlay)
                    record['overlay'] = overlay.name
                    write_json(record_path, record)

                    omit = reviews.get(key, {}).get('exclude_points', [])
                    annotation = ROOT / 'scripts/offline-pose/annotations' / (key + '.json')
                    if annotation.exists():
                        manual = json.loads(annotation.read_text())
                        if manual.get('image') != record['image']:
                            raise ValueError('Annotation source mismatch')
                        record = manual
                        omit = []
                    try:
                        if reviews.get(key, {}).get('status') == 'reject':
                            raise ValueError('Previous visual review rejected landmarks')
                        observations(record, rig, omit)
                        records.append(record)
                        excluded[view] = omit
                    except ValueError as error:
                        unusable.append({'view': view, 'reason': str(error)})
                        update([key], 'landmarks', 'failed', '关键点不足或已有人工排除：' + str(error))

                if len(records) < 2:
                    raise ValueError('Fewer than two usable views; shared 3D fitting withheld')

                fitkeys = [Path(r['image']).stem for r in records]
                update(fitkeys, 'fit', 'running', '同组共用一套骨架，联合拟合各视角相机；接触与朝向按证据保留待复核项')
                prior, initialization = prior_for(pose, rig)
                contact = profile_for(pose)
                scenes, report = fit_multiview(
                    records,
                    rig,
                    excludes=excluded,
                    prior=prior,
                    starts=1,
                    max_evaluations=args.max_evaluations,
                    pose_weight=.035 if pose.startswith('ws_') else .025,
                    camera_weight=.18 if contact else .025,
                    contact_profile=contact,
                    fixed_pose=bool(contact),
                    allow_root_yaw=pose.startswith('ws_'),
                    camera_sides={v: (1 if v == 's' else -1) for v in ['s', 'd'] if v in excluded} if contact else None,
                )
                report.update(initialization=initialization, unusable_views=unusable, run=args.run)
                report['observations'] = [
                    {'image': r['image'], 'kind': r['confidence_kind'], 'note': r.get('note', 'Unreviewed automatic 2D estimate')}
                    for r in records
                ]

                draftdir = base / 'drafts'
                readydir = base / 'ready'
                draftdir.mkdir(exist_ok=True)
                readydir.mkdir(exist_ok=True)
                mp = run / (pose + '.multiview.json')
                write_json(mp, report)

                renderjob = {'views': [], 'report': str(run / (pose + '.ground.json')), 'hands': {'l': 0, 'r': 0} if contact else None}
                for view, s in scenes.items():
                    key = pose + '_' + view
                    image_rel, _, _ = resolve_source(key)
                    for folder in [draftdir, readydir]:
                        for suffix in ['.scene.json', '.fit.json', '.png']:
                            old = folder / (key + suffix)
                            if old.exists():
                                backup = run / 'before' / folder.name / old.name
                                backup.parent.mkdir(parents=True, exist_ok=True)
                                if not backup.exists():
                                    shutil.copy2(old, backup)
                    write_json(draftdir / (key + '.scene.json'), s)
                    vr = next(v for v in report['views'] if v['view'] == view)
                    write_json(
                        draftdir / (key + '.fit.json'),
                        {
                            'schema': 'pose-atlas/offline-fit@1',
                            'image': image_rel,
                            'mesh': rig.data['mesh'],
                            'status': report['status'],
                            'verified': False,
                            'elapsed_ms': report['elapsed_ms'],
                            'reprojection_rms_px': vr['reprojection_rms_px'],
                            'used_points': vr['used_points'],
                            'shared_pose': pose,
                            'quality_gate': report['quality_gate'],
                        },
                    )
                    renderjob['views'].append({
                        'view': view,
                        'input': str(draftdir / (key + '.scene.json')),
                        'output': str(readydir / (key + '.scene.json')),
                        'render': str(readydir / (key + '.png')),
                    })
                jobfile = run / (pose + '.render-job.json')
                write_json(jobfile, renderjob)
                update(fitkeys, 'render', 'running', '用同一姿势逐视角渲染，并按真实蒙皮检查地面高度')
                renderer.render(jobfile)
                ground = json.loads(Path(renderjob['report']).read_text())
                report['actual_skin_ground'] = ground
                if contact:
                    bad = any(
                        v['regionMinimumClearanceM'].get(s + '_ankle', 999) > .015 or v['regionMinimumClearanceM'].get(s + '_knee', 999) > .015
                        for v in ground['views']
                        for s in ['l', 'r']
                    )
                    if bad:
                        report['quality_gate']['passed'] = False
                        report['quality_gate']['reasons'].append('actual_skinned_knee_or_foot_not_grounded')
                        report['status'] = 'draft-rejected-needs-correction'
                write_json(mp, report)

                comparison = run / (pose + '.jpg')
                sheet = Image.new('RGB', (300 * 2 * len(scenes), 430), 'white')
                draw = ImageDraw.Draw(sheet)
                for j, view in enumerate(scenes):
                    key = pose + '_' + view
                    for col, file, label in [(0, ref_paths[view], 'Reference'), (1, readydir / (key + '.png'), '3D draft')]:
                        with Image.open(file) as im:
                            sheet.paste(im.convert('RGB').resize((300, 400)), ((2 * j + col) * 300, 30))
                        draw.text(((2 * j + col) * 300 + 8, 8), label + ' ' + view, fill='black')
                sheet.save(comparison, quality=90)

                reasons = report['quality_gate']['reasons']
                message = '已生成同一骨架的多视角草稿；' + ('数值检查待修正：' + ', '.join(reasons) if reasons else '数值检查通过，仍需原图和接触人工复核')
                if is_upper_pose(pose):
                    message += '；只拟合可见上半身，下肢未重建'
                for view in scenes:
                    key = pose + '_' + view
                    update(
                        [key],
                        'review',
                        'needs_review',
                        message,
                        artifacts={
                            'scene': f'/output/offline-pose/ready/{key}.scene.json',
                            'render': f'/output/offline-pose/ready/{key}.png',
                            'comparison': '/' + comparison.relative_to(ROOT).as_posix(),
                            'multiReport': '/' + mp.relative_to(ROOT).as_posix(),
                        },
                    )
                print(json.dumps({'pose': pose, 'views': len(scenes), 'rms': [round(v['reprojection_rms_px'], 1) for v in report['views']], 'gate': report['quality_gate'], 'verified': False}), flush=True)
            except Exception as error:
                update([k for k in keys if jobs[k]['status'] != 'failed'], 'failed', 'failed', type(error).__name__ + ': ' + str(error))
                print(f'{pose}: FAILED {error}', flush=True)
            write_json(receipt, {'jobs': {k: jobs[k] for k in keys}})
            active.clear()
        write_json(run / 'finished.json', {'finishedAt': now(), 'groups': len(groups), 'verified': 0})
    except BaseException:
        if active:
            update(active, 'interrupted', 'failed', '转换进程中断；已有产物保留，可用相同 run 继续')
        raise
    finally:
        stop.set()
        thread.join()
        renderer.close()
        if model is not None and callable(getattr(adapter, 'close', None)):
            adapter.close(model)
        flush()
        fcntl.flock(lock, fcntl.LOCK_UN)
        lock.close()


if __name__ == '__main__':
    main()
