"""Download the explicitly selected public references, keeping source provenance.
Run with a Python environment containing Pillow. No API key or paid service.
"""
import json, subprocess, hashlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/wavespeed'
selection = json.loads((OUT / 'selection.json').read_text())
for name in ('originals', 'img', 'thumbs', 'line'): (OUT/name).mkdir(exist_ok=True)
jobs = []
for pose in selection['poses']:
    for kind, images in pose['images'].items():
        for view, remote in zip(('f', 'd', 's'), images):
            jobs.append((pose['id']+'_'+view, kind, remote))
def download(job):
    stem, kind, remote = job
    raw = OUT/'originals'/remote
    if not raw.exists():
        subprocess.run(['/usr/bin/curl', '--fail', '--silent', '--show-error', '--retry', '2',
            'https://static.wavespeed.ai/media/images/'+remote, '-o', str(raw)], check=True)
    with Image.open(raw) as im:
        im.load()
        assert im.size == (900,1200), (remote, im.size)
        im.convert('RGB').save(OUT/('img' if kind=='3d' else 'line')/(stem+'.png'))
        if kind == '3d':
            thumb=im.convert('RGB');thumb.thumbnail((300,400));thumb.save(OUT/'thumbs'/(stem+'.jpg'),quality=88)
    return {'id':stem,'kind':kind,'url':'https://static.wavespeed.ai/media/images/'+remote,
        'sha256':hashlib.sha256(raw.read_bytes()).hexdigest()}
with ThreadPoolExecutor(max_workers=4) as pool: sources=list(pool.map(download,jobs))
# Originals are retained as provenance; display PNGs are lossless re-encodings.
(OUT/'sources.json').write_text(json.dumps(sources,indent=2)+'\n')
systems={'zh':'扩展姿势 · WaveSpeed','en':'More poses · WaveSpeed','ja':'追加ポーズ · WaveSpeed'}
categories={'zh':'地面坐姿','en':'Floor sitting','ja':'床に座る'}
views={'zh':{'f':'正面','d':'斜侧','s':'侧面'},'en':{'f':'Front','d':'Diagonal','s':'Side'},'ja':{'f':'正面','d':'斜め','s':'横'}}
for lang in systems:
    rows=[]
    for n,pose in enumerate(selection['poses'],1):
        for view in ('f','d','s'):
            stem=pose['id']+'_'+view
            rows.append({'id':stem,'source_id':pose['source_id']+'_'+view,'体系':systems[lang],
                '姿势编号':f'WS{n:02}','分类':categories[lang],'姿势名称':pose['name'][lang],'角度':views[lang][view],
                '原图':f'data/wavespeed/img/{stem}.png','缩略图':f'data/wavespeed/thumbs/{stem}.jpg',
                'lineArt':f'data/wavespeed/line/{stem}.png','source':{'name':'WaveSpeed AI','url':selection['source']},
                '检索':' '.join([stem,pose['source_id'],*pose['name'].values(),systems[lang],categories[lang]])})
    (OUT/f'pose-{lang}.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
(OUT/'sit.json').write_text(json.dumps([{'pose':p['id'].split('_')[2],'name':p['name'],'views':['f','d','s']} for p in selection['poses']],ensure_ascii=False,indent=2)+'\n')
(OUT/'catalog.json').write_text(json.dumps({'systems':{'ws':{'name':systems,
    'image_template':'data/wavespeed/img/{stem}.png','thumbnail_template':'data/wavespeed/thumbs/{stem}.jpg',
    'categories':{'sit':{'name':categories,'index':'data/wavespeed/sit.json','pose_count':len(selection['poses'])}}}}},ensure_ascii=False,indent=2)+'\n')
print(f'Imported {len(selection["poses"])} poses, {len(sources)} images, three languages.')
