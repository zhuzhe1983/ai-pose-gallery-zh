#!/usr/bin/env python3
"""Visual evaluation of offline 3D pose drafts via local OpenAI-compatible VLM (strata qwen3.8-flash-next-iq3_xxs).

Reads OpenCode's strata provider config dynamically from ~/.config/opencode/opencode.json
(or STRATA_BASE_URL / STRATA_API_KEY env vars) without storing secrets in the repository.
Never marks poses 'approved' automatically; outputs honest 'screened' / 'needs_correction' / 'unsupported'.
"""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/offline-pose'))
from local_review import CHECKS, SCHEMA, fingerprint
from preview_server import scan_state


def load_strata_config(model_override=None, base_url_override=None):
    base_url = base_url_override or os.environ.get('STRATA_BASE_URL')
    api_key = os.environ.get('STRATA_API_KEY')
    model = model_override or 'qwen3.8-flash-next-iq3_xxs'
    opencode_cfg = Path.home() / '.config/opencode/opencode.json'
    if (not base_url or not api_key) and opencode_cfg.is_file():
        cfg = json.loads(opencode_cfg.read_text(encoding='utf-8'))
        strata = cfg.get('provider', {}).get('strata', {})
        opts = strata.get('options', {})
        base_url = base_url or opts.get('baseURL')
        api_key = api_key or opts.get('apiKey')
        if not model_override and strata.get('models'):
            if 'qwen3.8-flash-next-iq3_xxs' in strata['models']:
                model = 'qwen3.8-flash-next-iq3_xxs'
            else:
                model = next(iter(strata['models']))
    if not base_url or not api_key:
        raise RuntimeError('Missing strata baseURL/apiKey; configure ~/.config/opencode/opencode.json or STRATA_BASE_URL + STRATA_API_KEY')
    return base_url.rstrip('/'), api_key, model


def call_vlm(base_url, api_key, model, image_path, pose_id, is_upper, numeric_passed):
    b64 = base64.b64encode(image_path.read_bytes()).decode('ascii')
    upper_hint = '注意：此为上半身裁剪图，下肢未重建属正常限制，请勿因下半身保持站立而扣分。' if is_upper else ''
    prompt = (
        f'你正在审查人体姿势 3D 拟合草稿（姿势ID: {pose_id}）。图片左侧为原参考图 Reference，右侧为 3D 素体拟合草稿 3D draft（共多视角对比）。\n'
        f'{upper_hint}\n'
        '请严格对比原图与 3D 草稿，直接输出一段 JSON（不要输出 Markdown 代码块以外的解释）：\n'
        '{"status": "screened"或"needs_correction", '
        '"issues": ["简明中文问题描述，无明显错误可为空数组"], '
        '"checks": {"pose": "pass"|"needs_correction", "views": "pass"|"needs_correction", '
        '"head": "pass"|"needs_correction", "hands": "pass"|"needs_correction"|"unobserved", '
        '"feet": "pass"|"needs_correction"|"not_applicable", "contact": "pass"|"needs_correction"|"unobserved"}}'
    )
    payload = {
        'model': model,
        'temperature': 0.1,
        'max_tokens': 1600,
        'chat_template_kwargs': {'enable_thinking': False},
        'messages': [{
            'role': 'user',
            'content': [
                {'type': 'text', 'text': prompt},
                {'type': 'image_url', 'image_url': {'url': f'data:image/jpeg;base64,{b64}'}},
            ],
        }],
    }
    req = urllib.request.Request(
        f'{base_url}/chat/completions',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {api_key}'},
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    raw = data['choices'][0]['message'].get('content') or ''
    m = re.search(r'\{[\s\S]*\}', raw)
    if not m:
        raise ValueError(f'Non-JSON VLM output: {raw[:200]}')
    parsed = json.loads(m.group(0))
    checks = {k: 'unobserved' for k in CHECKS}
    checks['skin'] = 'unobserved'
    checks['persistence'] = 'pass' if numeric_passed is not None else 'unobserved'
    for k, v in (parsed.get('checks') or {}).items():
        if k in checks and v in {'pass', 'needs_correction', 'unobserved', 'not_applicable'}:
            checks[k] = v
    issues = [str(x).strip() for x in (parsed.get('issues') or []) if str(x).strip()][:5]
    status = 'needs_correction' if (parsed.get('status') == 'needs_correction' or any(v == 'needs_correction' for v in checks.values()) or issues) else 'screened'
    return status, issues, checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True)
    parser.add_argument('--prefix', default='', help='Only review pose IDs with this prefix (e.g. ws_)')
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--limit', type=int, default=0, help='Optional limit for smoke testing')
    parser.add_argument('--overwrite', action='store_true')
    parser.add_argument('--model', default=None)
    parser.add_argument('--base-url', default=None)
    args = parser.parse_args()

    base_url, api_key, model = load_strata_config(args.model, args.base_url)
    review_path = ROOT / 'output/offline-pose/local-review.json'
    existing_data = json.loads(review_path.read_text()) if review_path.is_file() else {'schema': SCHEMA, 'run': args.run, 'groups': []}
    by_id = {g['id']: g for g in existing_data.get('groups', []) if isinstance(g, dict) and g.get('id')}

    state = scan_state(ROOT)
    run_dir = ROOT / 'output/offline-pose/runs' / args.run
    targets = []
    for group in state['groups']:
        if group['control']:
            continue
        gid = group['id']
        if args.prefix and not gid.startswith(args.prefix):
            continue
        if not args.overwrite and gid in by_id and by_id[gid].get('status') not in {'outdated', None}:
            continue
        targets.append(group)
    if args.limit > 0:
        targets = targets[:args.limit]

    print(f'VLM review ({model} @ {base_url}): {len(targets)} pose groups queued', flush=True)

    def review_one(group):
        gid = group['id']
        report_file = run_dir / f'{gid}.multiview.json'
        report = json.loads(report_file.read_text()) if report_file.is_file() else None
        numeric_passed = report['quality_gate']['passed'] if report else None

        evidence = {}
        available = []
        for v in group['views']:
            if v['artifacts'].get('render') and v['artifacts'].get('scene'):
                available.append(v)
            for url in [v['source']] + [u for k, u in v['artifacts'].items() if k in ('scene', 'render', 'multiReport') and u]:
                rel = url.lstrip('/')
                if (ROOT / rel).is_file():
                    evidence[rel] = fingerprint(ROOT, rel)

        is_duo = gid.startswith(('duo_', 'ws_duo_', 'ws_couple_'))
        if is_duo and not available:
            return {
                'id': gid,
                'status': 'unsupported',
                'reviewer': f'VLM ({model})',
                'reviewedAt': datetime.now(timezone.utc).isoformat(),
                'numericPassed': None,
                'visualViews': [],
                'issues': ['单人 18 点识别器不能拆分双人/情侣动作，未生成假双人结果。'],
                'checks': dict.fromkeys(CHECKS, 'not_applicable'),
                'sourceDiscrepancies': [],
                'evidence': evidence,
            }

        sheet = run_dir / f'{gid}.jpg'
        if not sheet.is_file() or not available:
            return {
                'id': gid,
                'status': 'needs_correction',
                'reviewer': f'VLM ({model})',
                'reviewedAt': datetime.now(timezone.utc).isoformat(),
                'numericPassed': numeric_passed,
                'visualViews': [],
                'issues': ['关键点不足或拟合失败，尚未生成可用 3D 渲染对照。'],
                'checks': dict.fromkeys(CHECKS, 'unobserved'),
                'sourceDiscrepancies': [],
                'evidence': evidence,
            }

        status, issues, checks = call_vlm(base_url, api_key, model, sheet, gid, gid.startswith(('upper_', 'ws_upper_')), numeric_passed)
        if report and not numeric_passed and status == 'screened':
            issues.append('数值复核提示：' + ', '.join(report['quality_gate']['reasons']))
        return {
            'id': gid,
            'status': status,
            'reviewer': f'VLM ({model})',
            'reviewedAt': datetime.now(timezone.utc).isoformat(),
            'numericPassed': numeric_passed,
            'visualViews': [v['view'] for v in available],
            'issues': issues,
            'checks': checks,
            'sourceDiscrepancies': [],
            'evidence': evidence,
        }

    done = 0
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(review_one, g): g['id'] for g in targets}
        for fut in as_completed(futures):
            gid = futures[fut]
            done += 1
            try:
                rec = fut.result()
                by_id[gid] = rec
                if done % 25 == 0 or done == len(targets):
                    print(f'VLM progress: {done}/{len(targets)} ({gid} -> {rec["status"]})', flush=True)
            except Exception as err:
                print(f'VLM failed for {gid}: {err}', flush=True)

    ordered = sorted(by_id.values(), key=lambda r: r['id'])
    out_doc = {
        'schema': SCHEMA,
        'run': args.run,
        'reviewedAt': datetime.now(timezone.utc).isoformat(),
        'groups': ordered,
    }
    tmp = review_path.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(out_doc, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(review_path)

    from collections import Counter
    counts = Counter(r['status'] for r in ordered if not args.prefix or r['id'].startswith(args.prefix))
    print('VLM review complete:', json.dumps(dict(counts), ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
