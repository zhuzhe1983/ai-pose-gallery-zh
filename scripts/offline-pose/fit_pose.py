#!/usr/bin/env python3
"""Original constrained 2D-to-editor fitting; NOT the full Sketch2Pose algorithm.

Consumes reviewed 18-point pixel observations and the actual editor FK rig.
Writes draft editor scene JSON (schema inherited from the rig) plus diagnostics. Does not use SMPL-X,
SPIN, upstream implementation code, downloaded weights, or an inference server.
"""
import argparse
import copy
import json
import math
from pathlib import Path
import time

import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation
from orientation_hints import load_orientation_hints, orientation_assessment


class Rig:
    def __init__(self, data):
        if data.get('schema') != 'pose-atlas/fitting-rig@1':
            raise ValueError('Unsupported rig schema')
        self.data = data
        self.nodes = data['nodes']
        self.controls = data['controls']
        self.defaults = np.array([c['value'] for c in self.controls], dtype=float)
        self.parents = [n['parent'] for n in self.nodes]
        self.base_euler = np.array([n['euler'] for n in self.nodes])
        self.local = np.tile(np.eye(4), (len(self.nodes), 1, 1))
        self.local[:, :3, 3] = np.array([n['position'] for n in self.nodes])
        self.scale = np.array([n['scale'] for n in self.nodes])
        self.base_rotation = Rotation.from_quat([n['quaternion'] for n in self.nodes]).as_matrix()
        self.groups = {}
        for control in self.controls:
            for driver in control['drivers']:
                self.groups.setdefault(driver['order'], set()).add(driver['node'])
        self.groups = {order: np.array(sorted(ids)) for order, ids in self.groups.items()}
        for i, parent in enumerate(self.parents):
            if parent >= i or parent < -1:
                raise ValueError('Rig nodes must be in parent-first order')

    def transforms(self, values):
        euler = self.base_euler.copy()
        for control, delta in zip(self.controls, np.asarray(values) - self.defaults):
            for driver in control['drivers']:
                euler[driver['node'], driver['component']] += delta * driver['factor']
        rotation = self.base_rotation.copy()
        for order, ids in self.groups.items():
            axes = ['XYZ'.index(axis) for axis in order]
            rotation[ids] = Rotation.from_euler(order, euler[ids][:, axes]).as_matrix()
        local = self.local.copy()
        local[:, :3, :3] = rotation * self.scale[:, None, :]
        world = local.copy()
        for i, parent in enumerate(self.parents):
            if parent >= 0:
                world[i] = world[parent] @ local[i]
        return world, rotation

    def forward(self, values):
        world, _ = self.transforms(values)
        return np.array([sum(term['weight'] * (world[term['node']] @ np.array([*term['offset'], 1]))[:3]
                             for term in marker['terms']) for marker in self.data['points']])

    def angles(self, values):
        return {f"{c['key']}.{c['property']}": float(v) for c, v in zip(self.controls, values)}


def camera_vectors(camera):
    azimuth, elevation, distance, tx, ty = camera
    azimuth, elevation = np.deg2rad([azimuth, elevation])
    direction = np.array([math.sin(azimuth)*math.cos(elevation), math.sin(elevation), math.cos(azimuth)*math.cos(elevation)])
    right = np.array([math.cos(azimuth), 0, -math.sin(azimuth)])
    up = np.cross(direction, right)
    target = np.array([0, .15, 0]) + tx * right + ty * up
    position = target + distance * direction
    return position, target, right, up, direction


def project(points, camera, width, height):
    position, _, right, up, direction = camera_vectors(camera)
    relative = points - position
    depth = -relative @ direction
    focal = height / (2 * math.tan(math.radians(35)/2))
    xy = np.column_stack([width/2 + focal * (relative @ right) / np.maximum(depth, .1),
                          height/2 - focal * (relative @ up) / np.maximum(depth, .1)])
    return xy, depth


def observations(record, rig, excluded=()):
    if record.get('schema') != 'pose-keypoints/1' or record.get('coordinate_system') != 'original_image_pixels_x_right_y_down':
        raise ValueError('Expected pose-keypoints/1 original pixel coordinates')
    if record.get('confidence_kind') != 'heatmap_peak_uncalibrated':
        raise ValueError('Expected uncalibrated heatmap peaks; do not label them probabilities')
    width, height = float(record['width']), float(record['height'])
    if not all(math.isfinite(n) and n > 0 for n in [width, height]):
        raise ValueError('Invalid image dimensions')
    points = record['points']
    if len(points) != 18 or len({p['name'] for p in points}) != 18:
        raise ValueError('Expected 18 distinct named observations')
    by_name = {p['name']: p for p in points}
    expected = [p['name'] for p in rig.data['points']]
    if set(excluded) - set(expected):
        raise ValueError('Unknown excluded point name')
    if set(by_name) != set(expected):
        raise ValueError('Point names do not match the rig')
    values = np.array([[by_name[name]['x'], by_name[name]['y'], by_name[name]['confidence']] for name in expected],dtype=float)
    if not np.isfinite(values).all():
        raise ValueError('Nonfinite observations')
    # A conservative heuristic, NOT a calibrated confidence/visibility estimate.
    valid = (values[:,2] >= .3) & (values[:,0] >= 0) & (values[:,0] <= width) & (values[:,1] >= 0) & (values[:,1] <= height)
    valid &= np.array([name not in excluded for name in expected])
    if np.count_nonzero(valid) < 8 or np.count_nonzero(valid[[2,5,10,13]]) < 3:
        raise ValueError('Too few usable points; no draft generated')
    weights = np.sqrt(np.clip((values[:,2]-.2)/.6,0,1)) * valid
    weights[[0,1,8,9,16,17]] *= .6 # approximate marker definitions / stylized proportions
    return values[:,:2], weights, width, height


def fit(record, rig, excluded=(), starts=4, max_evaluations=200, orientations=None):
    observed, weights, width, height = observations(record, rig, excluded)
    stem = Path(record['image']).stem
    pose_id = stem.rsplit('_',1)[0]
    manual_angles, orientation_report = load_orientation_hints(orientations, rig, pose_id)
    toe_observed = {'l': bool(weights[16] > 0), 'r': bool(weights[17] > 0)}
    orientation_report = orientation_assessment(manual_angles, orientation_report['evidence'], toe_observed)
    prior = rig.defaults.copy()
    preset = rig.data.get('presets',{}).get(pose_id,{})
    for i, control in enumerate(rig.controls):
        key = f"{control['key']}.{control['property']}"
        prior[i] = manual_angles.get(key, preset.get(key, prior[i]))
    # Root body and pelvis share a pivot. Optimizing both creates duplicate
    # rotations and makes the torso, head and legs lean together needlessly.
    # Head/hand orientation is not determined by head center or wrist position.
    # The only automatic ankle control uses an approximate ankle-to-toe marker.
    active = [i for i,c in enumerate(rig.controls) if not (
        c['key'] in ('body', 'head', 'l_wrist', 'r_wrist') or
        (c['key'].endswith('_ankle') and c['property']!='bend') or
        (c['key'].endswith('_ankle') and not toe_observed[c['key'][0]]) or
        f"{c['key']}.{c['property']}" in manual_angles)]
    low = np.array([rig.controls[i]['min'] for i in active] + [-180,-80,.6,-3,-3])
    high = np.array([rig.controls[i]['max'] for i in active] + [180,80,15,3,3])
    extent = max(100, float(np.ptp(observed[weights>0,1])))
    distance = np.clip(rig.data['template']['figures'][0]['height'] * height/(2*math.tan(math.radians(35)/2)*extent),1,10)
    category = record.get('category','')
    azimuth = 175 if 'back' in category else (70 if 'side' in category else 0)
    view = stem.rsplit('_',1)[-1]
    elevation = 45 if view=='hi' else -25 if view=='lo' else 5
    if '_lie_' in stem:
        elevation=60
    start_camera=np.array([azimuth,elevation,distance,0,0],float)
    initial_angles=prior.copy()
    if not preset:
        for side, a,b,c in [('r',2,3,4),('l',5,6,7),('r',10,11,12),('l',13,14,15)]:
            upper=observed[b]-observed[a];lower=observed[c]-observed[b]
            bend=np.rad2deg(np.arccos(np.clip(upper@lower/max(1e-6,np.linalg.norm(upper)*np.linalg.norm(lower)),-1,1)))
            key=f"{side}_{'elbow' if a<10 else 'knee'}"
            for i,control in enumerate(rig.controls):
                if control['key']==key: initial_angles[i]=min(145,bend)
    prior_sigma=np.array([65 if rig.controls[i]['key'].endswith(('_arm','_leg')) else 45 for i in active])
    normalizer=max(width,height)
    def unpack(x):
        values=prior.copy();values[active]=x[:-5];return values,x[-5:]
    def residual(x):
        values,camera=unpack(x)
        xy,depth=project(rig.forward(values),camera,width,height)
        data=((xy-observed)/normalizer*weights[:,None]).ravel()
        # A single view leaves depth unconstrained. Keep the draft and view hint
        # as explicit soft priors rather than chasing pixels with extreme twists.
        regularization=.04*(values[active]-prior[active])/prior_sigma
        camera_prior=.04*(camera[:2]-start_camera[:2])/np.array([30,20])
        return np.r_[data,regularization,camera_prior,.1*np.maximum(.2-depth,0)]
    initial=np.r_[initial_angles[active],start_camera]
    initial=np.clip(initial,low+1e-6,high-1e-6)
    initial_xy,_=project(rig.forward(initial_angles),start_camera,width,height)
    candidates=[];started=time.perf_counter()
    offsets=[0,50,-50,175,-175,90,-90]
    for offset in offsets[:starts]:
        x=initial.copy();x[-5]=np.clip(azimuth+offset,-179.9,179.9)
        solved=least_squares(residual,x,bounds=(low,high),method='trf',loss='soft_l1',f_scale=.025,
                             max_nfev=max_evaluations,x_scale='jac',ftol=1e-7,xtol=1e-7,gtol=1e-7)
        candidates.append(solved)
    best=min(candidates,key=lambda r:float(np.sum(residual(r.x)**2)))
    angles,camera=unpack(best.x);world=rig.forward(angles);xy,depth=project(world,camera,width,height)
    errors=np.linalg.norm(xy-observed,axis=1);used=weights>0
    _,rotations=rig.transforms(angles)
    scene=copy.deepcopy(rig.data['template']);figure=scene['figures'][0]
    for i,node in enumerate(rig.nodes):
        if node['name'] in figure['joints']:
            figure['joints'][node['name']]=Rotation.from_matrix(rotations[i]).as_quat().tolist()
    figure['position']=[0,0,0]
    position,target,*_=camera_vectors(camera)
    scene['camera']={'position':position.tolist(),'target':target.tolist()}
    scene['floorLock']=False
    scene['reference']={'stem':pose_id,'view':view} if view in ['f','d','s','hi','lo'] else None
    report={'schema':'pose-atlas/offline-fit@1','status':'draft-needs-review','image':record['image'],
      'method':'original constrained editor FK + perspective reprojection; not full Sketch2Pose',
      'initialization':'existing manual draft preset' if preset else 'neutral + projected hinge angles',
      'mesh':rig.data['mesh'],'elapsed_ms':round((time.perf_counter()-started)*1000),
      'width':width,'height':height,'used_points':int(used.sum()),'excluded_points':list(excluded),
      'initial_reprojection_rms_px':float(np.sqrt(np.mean(np.sum((initial_xy[used]-observed[used])**2,axis=1)))),
      'reprojection_rms_px':float(np.sqrt(np.mean(errors[used]**2))),
      'reprojection_warning':'Error against inferred 2D points, not manual ground truth or a measure of 3D correctness.',
      'orientation_assessment':orientation_report,
      'root_orientation':'fixed to preset or neutral prior; pelvis is separately fitted',
      'angles':rig.angles(angles),'camera_parameters':camera.tolist(),
      'points':[{'name':point['name'],'observed':observed[i].tolist(),'projected':xy[i].tolist(),
                 'error_px':float(errors[i]),'weight':float(weights[i]),'world':world[i].tolist()}
                 for i,point in enumerate(rig.data['points'])],
      'optimizer':{'converged':bool(best.success),'message':best.message,'starts':len(candidates),'evaluations':int(best.nfev)},
      'limitations':['Single view cannot resolve depth or hidden limbs uniquely.','Approximate head/spine/toe markers; fixed bone lengths.','Head and hand axes and ankle tilt/turn remain unresolved without explicit manual hints.','Manual hints are input assumptions, not evidence of correct 3D reconstruction.','No self-contact, surface collision, learned pose prior, or SMPL-X.','Rendering and manual review required before publication.']}
    return scene,report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rig',required=True);parser.add_argument('--input',required=True)
    parser.add_argument('--output-dir',required=True);parser.add_argument('--starts',type=int,default=4)
    parser.add_argument('--max-evaluations',type=int,default=200)
    parser.add_argument('--exclude',nargs='*',default=[])
    parser.add_argument('--orientations',help='Optional reviewed manual endpoint angles with reference evidence')
    args=parser.parse_args()
    if not 1<=args.starts<=7 or not 1<=args.max_evaluations<=2000:parser.error('Invalid solver budget')
    rig=Rig(json.loads(Path(args.rig).read_text()));record=json.loads(Path(args.input).read_text())
    orientations=json.loads(Path(args.orientations).read_text()) if args.orientations else None
    scene,report=fit(record,rig,args.exclude,args.starts,args.max_evaluations,orientations)
    out=Path(args.output_dir);out.mkdir(parents=True,exist_ok=True);stem=Path(record['image']).stem
    (out/(stem+'.scene.json')).write_text(json.dumps(scene,indent=2)+'\n')
    (out/(stem+'.fit.json')).write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ['image','status','elapsed_ms','used_points','reprojection_rms_px','initialization']}))

if __name__=='__main__':main()
