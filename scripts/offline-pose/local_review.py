"""Local review evidence, separate from public coverage and conversion progress."""
from functools import lru_cache
import hashlib
import json
from pathlib import Path

SCHEMA = 'pose-atlas/local-review@1'
CHECKS = ('pose', 'views', 'head', 'hands', 'feet', 'contact', 'skin', 'persistence')
STATUSES = {'screened', 'needs_correction', 'unsupported', 'approved'}


@lru_cache(maxsize=12000)
def _digest(path, modified, size):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def fingerprint(root, relative):
    path = (root / relative).resolve()
    path.relative_to(root.resolve())
    stat = path.stat()
    return _digest(str(path), stat.st_mtime_ns, stat.st_size)


def load_reviews(root, groups):
    path = root / 'output/offline-pose/local-review.json'
    if not path.is_file():
        return {}, None
    try:
        data = json.loads(path.read_text())
        if data.get('schema') != SCHEMA or not isinstance(data.get('groups'), list):
            return {}, None
    except (ValueError, OSError):
        return {}, None
    known = {g['id']: g for g in groups if not g['control']}
    reviews = {}
    for record in data['groups']:
        if not isinstance(record, dict):
            continue
        group = known.get(record.get('id'))
        if not group or record.get('status') not in STATUSES:
            continue
        expected = {item['source'].lstrip('/') for item in group['views']}
        for item in group['views']:
            expected.update(url.lstrip('/') for key, url in item['artifacts'].items()
                            if key in {'scene', 'render', 'multiReport'} and url)
        evidence = record.get('evidence', {})
        current = isinstance(evidence, dict) and expected.issubset(evidence)
        if current:
            try:
                current = all(isinstance(sha, str) and len(sha) == 64 and
                              relative.startswith(('img/', 'output/offline-pose/')) and
                              fingerprint(root, relative) == sha
                              for relative, sha in evidence.items())
            except (OSError, ValueError, TypeError):
                current = False
        result = {k: record.get(k) for k in ('status', 'reviewedAt', 'reviewer', 'issues',
                   'visualViews', 'numericPassed', 'checks', 'sourceDiscrepancies')}
        result['issues'] = [s for s in result.get('issues') or [] if isinstance(s, str)]
        if not current:
            result['status'] = 'outdated'
        elif record['status'] == 'approved':
            checks = record.get('checks', {})
            views = {item['view'] for item in group['views']}
            complete = (set(checks) == set(CHECKS) and
                        all(value in {'pass', 'not_applicable'} for value in checks.values()) and
                        set(record.get('visualViews', [])) == views and
                        group['sceneCount'] == len(views) and
                        group['sceneConsistency'] in {'shared', 'single'} and
                        bool(record.get('reviewer')) and bool(record.get('reviewedAt')))
            if not complete:
                result['status'] = 'incomplete'
        reviews[group['id']] = result
    counts = {status: sum(r['status'] == status for r in reviews.values())
              for status in (*sorted(STATUSES), 'outdated', 'incomplete')}
    counts['visualReviewed'] = sum(bool(r['visualViews']) and r['status'] not in {'outdated', 'incomplete'}
                                  for r in reviews.values())
    return reviews, {'run': data.get('run'), 'reviewedAt': data.get('reviewedAt'),
                     'counts': counts, 'criteria': '/preview/REVIEW.md'}


def approved_dataset(root, groups, reviews):
    """One figure set per pose; camera/reference metadata varies by view only."""
    poses = []
    for group in groups:
        review = reviews.get(group['id'], {})
        if review.get('status') != 'approved':
            continue
        views = sorted(group['views'], key=lambda v: ['f', 's', 'd', 'hi', 'lo'].index(v['view']))
        scenes = {v['view']: json.loads((root / v['artifacts']['scene'].lstrip('/')).read_text())
                  for v in views}
        scene = dict(next(iter(scenes.values())))
        scene['reference'] = None
        scene['grid'] = False
        poses.append({'id': group['id'], 'scene': scene,
                      'cameras': {view: s['camera'] for view, s in scenes.items()},
                      'views': list(scenes), 'review': review})
    return {'schema': 'pose-atlas/local-approved@1', 'poses': poses}
