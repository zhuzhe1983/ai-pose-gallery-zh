"""Validate vertex correspondence, then pack sparse CC0 MakeHuman morph deltas."""
from pathlib import Path
import json,struct,hashlib
ROOT=Path(__file__).resolve().parents[1]
STAGE=ROOT/'output/bust-morphs'
OUT=ROOT/'studio/assets/humans'
def positions(path):
    raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+length])
    primitive=g['meshes'][0]['primitives'][0]
    acc=g['accessors'][primitive['attributes']['POSITION']];view=g['bufferViews'][acc['bufferView']]
    assert acc['componentType']==5126 and acc['type']=='VEC3'
    offset=20+length+8+view.get('byteOffset',0)+acc.get('byteOffset',0);stride=view.get('byteStride',12)
    points=[struct.unpack_from('<3f',raw,offset+i*stride) for i in range(acc['count'])]
    ia=g['accessors'][primitive['indices']];iv=g['bufferViews'][ia['bufferView']]
    start=20+length+8+iv.get('byteOffset',0)+ia.get('byteOffset',0)
    size={5123:2,5125:4}[ia['componentType']]
    topology=raw[start:start+ia['count']*size]
    return points,topology
base,topology=positions(OUT/'female.glb');rebuilt,rebuilt_topology=positions(STAGE/'baseline.glb')
assert len(base)==len(rebuilt),(len(base),len(rebuilt))
# glTF triangulation can choose a different diagonal for deformed quads. Vertex
# correspondence, not triangle byte order, is what these position deltas need.
# The shipped display eyes were adjusted after the initial build. Only the
# authored chest region is transferred; face, limbs and rig stay byte-identical.
region=[i for i,p in enumerate(base) if .93<p[1]<1.34 and abs(p[0])<.24 and p[2]>-.01]
error=max(abs(base[i][j]-rebuilt[i][j]) for i in region for j in range(3))
assert error<1e-5, f'Chest correspondence mismatch: {error}'
names=['small-soft','medium-soft','large-soft','small-neutral','baseline','large-neutral','small-firm','medium-firm','large-firm']
loaded=[positions(STAGE/(name+'.glb')) for name in names]
targets=[p for p,_ in loaded]
assert all(len(target)==len(base) for target in targets)
region_set=set(region)
outside=[i for i,p in enumerate(rebuilt) if i not in region_set and p[1]<1.4]
assert max(abs(t[i][j]-rebuilt[i][j]) for t in targets for i in outside for j in range(3))<1e-5, 'Unexpected changes outside chest'
indices=[i for i in region if max(abs(q[i][j]-rebuilt[i][j]) for q in targets for j in range(3))>1e-6]
payload=bytearray(struct.pack('<'+str(len(indices))+'I',*indices))
for target in targets:
    for i in indices: payload.extend(struct.pack('<3f',*(target[i][j]-rebuilt[i][j] for j in range(3))))
(OUT/'female-bust.bin').write_bytes(payload)
manifest={'schema':'pose-atlas/bust-morphs@1','license':'CC0-1.0','source':'manifest.json',
    'base_sha256':hashlib.sha256((OUT/'female.glb').read_bytes()).hexdigest(),'vertices':len(base),'affected':len(indices),
    'targets':names,'sizeStops':[0,.75,1],'firmnessStops':[0,.75,1],'baseSize':.75,'baseFirmness':.75,'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest(),
    'description':'Authored MakeHuman cupsize/firmness morphs. Appearance controls, not bra measurements or dynamic physics.'}
(OUT/'female-bust.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Packed {len(indices)}/{len(base)} affected vertices, {len(payload)} bytes; baseline max error {error}.')
