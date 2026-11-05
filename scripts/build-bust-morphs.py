"""Build CC0 authored breast size/firmness corners without replacing the base GLB.
blender --background --factory-startup --python scripts/build-bust-morphs.py -- output/model-research/mpfb2
Then run: python3 scripts/pack-bust-morphs.py
"""
import runpy, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
variants = [
    ('female', .75, .75, 'baseline'),
    ('female', 0, 0, 'small-soft'),
    ('female', 1, 0, 'large-soft'),
    ('female', 0, 1, 'small-firm'),
    ('female', 1, 1, 'large-firm'),
    ('female', .75, 0, 'medium-soft'),
    ('female', .75, 1, 'medium-firm'),
    ('female', 0, .75, 'small-neutral'),
    ('female', 1, .75, 'large-neutral'),
]
if '--missing-only' in sys.argv:
    sys.argv.remove('--missing-only')
    variants = [v for v in variants if not (ROOT/'output/bust-morphs'/(v[3]+'.glb')).exists()]
runpy.run_path(str(ROOT/'scripts/build-human-models.py'), init_globals={
    'POSE_OUTPUT': str(ROOT/'output/bust-morphs'),
    'POSE_VARIANTS': variants,
})
