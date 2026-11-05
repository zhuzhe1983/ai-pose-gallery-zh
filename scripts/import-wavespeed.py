"""Import registered WaveSpeed references without inflating their original WebP files.
Run with Pillow. --assets-only can prefetch while names are being translated.
Existing PNG reference links are intentionally retained for compatibility.
"""
import argparse
import hashlib
import json
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/wavespeed'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--selection', type=Path, default=OUT/'selection.json')
parser.add_argument('--assets-only', action='store_true')
args = parser.parse_args()
selection = json.loads(args.selection.read_text())
for name in ('img', 'thumbs', 'line'): (OUT/name).mkdir(exist_ok=True)
cache = ROOT/'output/wavespeed-import/cache';cache.mkdir(parents=True,exist_ok=True)
jobs = []
for pose in selection['poses']:
    assert re.fullmatch(r'ws_[a-z]+_[a-z0-9-]+',pose['id'])
    for kind, images in pose['images'].items():
        assert kind in ('3d','line') and len(images)==3
        for view, remote in zip(('f','d','s'), images):
            assert re.fullmatch(r'[a-f0-9-]+\.webp',remote)
            jobs.append((pose['id']+'_'+view,kind,remote))

def download(job):
    stem, kind, remote = job
    target=OUT/('img' if kind=='3d' else 'line')/(stem+'.webp')
    raw=target if target.exists() else OUT/'originals'/remote
    if not raw.exists():
        raw=cache/remote
        if not raw.exists():
            temp=raw.with_suffix('.part')
            subprocess.run(['/usr/bin/curl','--fail','--silent','--show-error','--retry','2','--retry-delay','1','--max-time','45',
                'https://static.wavespeed.ai/media/images/'+remote,'-o',str(temp)],check=True)
            with Image.open(temp) as im: im.verify()
            temp.replace(raw)
    with Image.open(raw) as im:
        im.load();assert im.size==(900,1200),(remote,im.size)
        if kind=='3d' and not (OUT/'thumbs'/(stem+'.jpg')).exists():
            thumb=im.convert('RGB');thumb.thumbnail((300,400));thumb.save(OUT/'thumbs'/(stem+'.jpg'),quality=88)
    if raw!=target: target.write_bytes(raw.read_bytes())
    return {'id':stem,'kind':kind,'path':target.relative_to(ROOT).as_posix(),
        'url':'https://static.wavespeed.ai/media/images/'+remote,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}

sources=[]
with ThreadPoolExecutor(max_workers=4) as pool:
    for result in pool.map(download,jobs):
        sources.append(result)
        if len(sources)%100==0: print(f'Images {len(sources)}/{len(jobs)}',flush=True)
if args.assets_only:
    print(f'Prefetched {len(sources)} original images. Catalog unchanged.');raise SystemExit

systems={'zh':'扩展姿势 · WaveSpeed','en':'More poses · WaveSpeed','ja':'追加ポーズ · WaveSpeed'}
ui=json.loads((ROOT/'data/ui.json').read_text())
views={lang:{view:ui[lang][key] for view,key in [('f','angleFront'),('d','angleDiag'),('s','angleSide')]} for lang in systems}
categories=selection['categories']
for lang in systems:
    rows=[]
    for n,pose in enumerate(selection['poses'],1):
        assert set(pose['name'])=={'zh','en','ja'}
        for view in ('f','d','s'):
            stem=pose['id']+'_'+view
            rows.append({'id':stem,'source_id':pose['source_id']+'_'+view,'体系':systems[lang],
                '姿势编号':f'WS{n:03}','分类':categories[pose['category']]['name'][lang],'姿势名称':pose['name'][lang],'角度':views[lang][view],
                '原图':f'data/wavespeed/img/{stem}.webp','缩略图':f'data/wavespeed/thumbs/{stem}.jpg',
                'lineArt':f'data/wavespeed/line/{stem}.webp','source':{'name':'WaveSpeed AI','url':pose['source_url']},
                '检索':' '.join([stem,pose['source_id'],*pose['name'].values(),systems[lang],*categories[pose['category']]['name'].values()])})
    (OUT/f'pose-{lang}.json').write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':'))+'\n')
config={}
for category,meta in categories.items():
    poses=[p for p in selection['poses'] if p['category']==category]
    (OUT/(category+'.json')).write_text(json.dumps([{'pose':p['id'].split('_')[2],'name':p['name'],'views':['f','d','s']} for p in poses],ensure_ascii=False,indent=2)+'\n')
    config[category]={'name':meta['name'],'index':f'data/wavespeed/{category}.json','pose_count':len(poses)}
(OUT/'catalog.json').write_text(json.dumps({'systems':{'ws':{'name':systems,
    'image_template':'data/wavespeed/img/{stem}.webp','thumbnail_template':'data/wavespeed/thumbs/{stem}.jpg','categories':config}}},ensure_ascii=False,indent=2)+'\n')
(OUT/'sources.json').write_text(json.dumps(sources,indent=2)+'\n')
(OUT/'selection.json').write_text(json.dumps(selection,ensure_ascii=False,indent=2)+'\n')
print(f'Imported {len(selection["poses"])} poses, {len(sources)} images, {len(categories)} categories, three languages.')
