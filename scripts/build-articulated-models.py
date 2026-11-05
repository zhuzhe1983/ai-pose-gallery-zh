"""Derive CC0 articulated display mannequins from the shipped MakeHuman assets.

blender --background --factory-startup --python scripts/build-articulated-models.py
The original anatomy and bind pivots are retained. Rigid shells meet at narrow
seams and inset spherical joints; fingers retain the original articulated rig.
"""
import bpy
import bmesh
import json
import hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'studio/assets/articulated'
OUT.mkdir(parents=True, exist_ok=True)

def region(name):
    if name in ('Root', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01') or name.startswith('clavicle'): return 'torso'
    if name.startswith(('thumb_', 'index_', 'middle_', 'ring_', 'pinky_')):
        return 'hand_' + name[-1]
    if name.startswith('ball_'): return 'foot_' + name[-1]
    return name

def clip(poly, a, b):
    result = []
    for p, q in zip(poly, poly[1:] + poly[:1]):
        dp = p[2].get(a, 0) - p[2].get(b, 0)
        dq = q[2].get(a, 0) - q[2].get(b, 0)
        if dp >= -1e-9: result.append(p)
        if (dp > 0) != (dq > 0) and abs(dp-dq) > 1e-12:
            t = dp / (dp-dq)
            weights = {k: p[1].get(k, 0)*(1-t)+q[1].get(k, 0)*t for k in p[1].keys() | q[1].keys()}
            zones = {k: p[2].get(k, 0)*(1-t)+q[2].get(k, 0)*t for k in p[2].keys() | q[2].keys()}
            result.append((p[0].lerp(q[0], t), weights, zones))
    return result

def color(obj, value):
    attr = obj.data.color_attributes.new(name='Shell finish', type='FLOAT_COLOR', domain='CORNER')
    for item in attr.data: item.color = (value, value, value, 1)

for sex in ('female', 'male'):
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / f'studio/assets/humans/{sex}.glb'))
    rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    source = max((o for o in bpy.context.scene.objects if o.type == 'MESH'), key=lambda o: len(o.data.vertices))
    names = {g.index: g.name for g in source.vertex_groups}
    vertices = []
    for v in source.data.vertices:
        weights = {names[g.group]: g.weight for g in v.groups if g.weight > 1e-7}
        zones = {}
        for k, w in weights.items(): zones[region(k)] = zones.get(region(k), 0) + w
        vertices.append((source.matrix_world @ v.co, weights, zones))
    source.data.calc_loop_triangles()
    pieces = {}
    for tri in source.data.loop_triangles:
        original = [vertices[i] for i in tri.vertices]
        zones = set().union(*(v[2] for v in original))
        for zone in zones - {'head'}:
            poly = original
            for other in zones - {zone}:
                poly = clip(poly, zone, other)
                if len(poly) < 3: break
            if len(poly) < 3: continue
            points, faces, weights = pieces.setdefault(zone, ([], [], []))
            start = len(points)
            for point, ws, _ in poly:
                points.append(point)
                if zone == 'torso':
                    trunk = {}
                    for name, weight in ws.items():
                        key = name if name in ('Root','pelvis','spine_01','spine_02','spine_03','neck_01') else ('neck_01' if name=='head' else 'pelvis' if name.startswith(('thigh','calf','foot')) else 'spine_03')
                        trunk[key] = trunk.get(key,0)+weight
                    weights.append(trunk)
                else:
                    weights.append(ws if zone.startswith('hand_') else {zone: 1.0})
            faces.extend((start, start+i, start+i+1) for i in range(1, len(poly)-1))
    objects = []
    for zone, (points, faces, weights) in pieces.items():
        mesh = bpy.data.meshes.new(zone); mesh.from_pydata(points, [], faces); mesh.update()
        obj = bpy.data.objects.new(zone, mesh); bpy.context.collection.objects.link(obj)
        groups = {name: obj.vertex_groups.new(name=name) for name in set().union(*weights)}
        for i, ws in enumerate(weights):
            total = sum(ws.values())
            for name, value in ws.items(): groups[name].add([i], value / total, 'REPLACE')
        bm = bmesh.new(); bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.000005)
        boundary = {v for edge in bm.edges if edge.is_boundary for v in edge.verts}
        # Each opening becomes a planar, smooth manufactured rim. Influence-map
        # contours otherwise make serrated seams and badly triangulated caps.
        unseen = set(boundary)
        while unseen and zone not in ('torso','neck_01'):
            seed = unseen.pop(); loop = {seed}; frontier = [seed]
            while frontier:
                v = frontier.pop()
                for e in v.link_edges:
                    other = e.other_vert(v)
                    if e.is_boundary and other in unseen:
                        unseen.remove(other); loop.add(other); frontier.append(other)
            if len(loop) < 4: continue
            coords = np.array([tuple(v.co) for v in loop]); origin = coords.mean(axis=0)
            _, _, basis = np.linalg.svd(coords-origin, full_matrices=False)
            normal = Vector(basis[-1]); origin = Vector(origin)
            delta = {}
            for v in loop:
                offset = -normal * (v.co-origin).dot(normal)
                delta[v] = offset; v.co += offset
            # Feather the displacement into the surface, keeping a clean rim.
            seen = set(loop); ring = set(loop)
            for factor in (.6,.3,.1):
                nxt = {e.other_vert(v) for v in ring for e in v.link_edges} - seen
                for v in nxt:
                    nearby = [e.other_vert(v) for e in v.link_edges if e.other_vert(v) in delta]
                    if nearby:
                        delta[v] = sum((delta[n] for n in nearby),Vector())/len(nearby)
                        v.co += delta[v]*factor
                seen.update(nxt); ring=nxt
        # Painted influence contours are not manufactured edges. Relax each rim,
        # retaining its broad shape while removing tiny weight-map scallops.
        for _ in range(24):
            updates = {}
            for v in boundary:
                adjacent = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
                if len(adjacent) == 2:
                    updates[v] = v.co.lerp((adjacent[0].co + adjacent[1].co)*.5, .65)
            for v, co in updates.items(): v.co = co
        center = sum((v.co for v in bm.verts), Vector()) / len(bm.verts)
        for v in boundary:
            direction = center-v.co
            if direction.length: v.co += direction.normalized() * 0.0012
        for face in bm.faces: face.smooth = True
        caps = bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)['faces']
        for face in caps: face.smooth = False
        bmesh.ops.triangulate(bm, faces=caps)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(mesh); bm.free()
        color(obj, 1.0)
        objects.append(obj)
    def joint(name, radius, scale=(1,1,1), center=None, shade=.77):
        at = center if center is not None else rig.matrix_world @ rig.data.bones[name].head_local
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, radius=radius, location=at)
        obj = bpy.context.object; obj.name = name + ' connector'
        obj.scale = scale; bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        group = obj.vertex_groups.new(name=name); group.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
        for face in obj.data.polygons: face.use_smooth = True
        color(obj, shade); objects.append(obj)
        return obj
    for side in ('l', 'r'):
        for name, radius in [('upperarm',.051 if sex=='female' else .060),('lowerarm',.030),('hand',.020),('thigh',.067),('calf',.042),('foot',.028)]:
            joint(name+'_'+side, radius)
    # A smooth tapered head, with no eye sockets, ears, lips or facial anatomy.
    head_points = [p for p, _, zones in vertices if zones.get('head',0) > .85]
    lo = Vector(tuple(min(p[i] for p in head_points) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in head_points) for i in range(3)))
    center = (lo+hi)*.5
    size = (hi-lo)*.5; size.x *= .87; size.y *= .92
    head = joint('head', 1, center=center, shade=1)
    for v in head.data.vertices:
        z = v.co.z
        taper = 1 + min(z,0)*.23
        v.co.x *= size.x*taper; v.co.y *= size.y*taper; v.co.z *= size.z
    head.name = 'Faceless display head'
    bpy.data.objects.remove(source, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]; bpy.ops.object.join()
    body = bpy.context.object; body.name = 'POSE Atlas articulated ' + sex
    material = bpy.data.materials.new('Satin porcelain'); material.diffuse_color = (.76,.75,.73,1)
    material.use_nodes = True; shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value=.34
    vertex_color = material.node_tree.nodes.new('ShaderNodeVertexColor')
    vertex_color.layer_name = 'Shell finish'
    material.node_tree.links.new(vertex_color.outputs['Color'], shader.inputs['Base Color'])
    body.data.materials.clear(); body.data.materials.append(material)
    for face in body.data.polygons: face.material_index=0
    mod=body.modifiers.new('Articulated skeleton','ARMATURE');mod.object=rig
    body.parent = rig
    bpy.ops.object.select_all(action='DESELECT');body.select_set(True);rig.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / (sex+'.glb')),export_format='GLB',use_selection=True,export_animations=False,export_morph=False,export_extras=False,export_texcoords=False,export_all_vertex_colors=True)
    print('ARTICULATED',sex,len(body.data.vertices),len(body.data.polygons),flush=True)

manifest={'source':'../humans/manifest.json','license':'CC0-1.0','generator':'scripts/build-articulated-models.py','revision':'articulated-v1','assets':{}}
for p in OUT.glob('*.glb'):
    raw=p.read_bytes();manifest['assets'][p.name]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
