#!/usr/bin/env python3
"""Integration checks using an exported real rig; no model-accuracy claims."""
import argparse, copy, json
from pathlib import Path
import numpy as np
from fit_pose import Rig, fit, observations, project
p=argparse.ArgumentParser();p.add_argument('--rig',required=True);p.add_argument('--blank',required=True);args=p.parse_args()
rig=Rig(json.loads(Path(args.rig).read_text()))
assert np.max(np.abs(rig.forward(rig.defaults)-np.array(rig.data['worldPoints'])))<1e-8
values=rig.defaults.copy()
for i,c in enumerate(rig.controls):
 if c['key']=='l_arm' and c['property']=='raise':values[i]=90
 if c['key']=='l_elbow':values[i]=70
xy,_=project(rig.forward(values),[0,5,3.5,0,0],900,1200)
record={'schema':'pose-keypoints/1','image':'synthetic_f.png','width':900,'height':1200,
 'coordinate_system':'original_image_pixels_x_right_y_down','confidence_kind':'heatmap_peak_uncalibrated',
 'points':[{'name':m['name'],'x':float(q[0]),'y':float(q[1]),'confidence':1.0} for m,q in zip(rig.data['points'],xy)]}
scene,report=fit(record,rig,starts=2,max_evaluations=150)
assert report['reprojection_rms_px']<report['initial_reprojection_rms_px']*.2
for c in rig.controls:assert c['min']-1e-8<=report['angles'][f"{c['key']}.{c['property']}"]<=c['max']+1e-8
assert scene['schema']==rig.data['template']['schema'] and not scene['floorLock']
def rejects(r):
 try:observations(r,rig)
 except ValueError:return
 raise AssertionError('Invalid observations accepted')
rejects(json.loads(Path(args.blank).read_text()))
bad=copy.deepcopy(record);bad['points'][0]['x']=float('nan');rejects(bad)
bad=copy.deepcopy(record);bad['points'][0]['name']=bad['points'][1]['name'];rejects(bad)
bad=copy.deepcopy(record);bad['coordinate_system']='normalized';rejects(bad)
print(json.dumps({'neutral_fk':'matched','synthetic_rms_px':report['reprojection_rms_px'],
 'initial_rms_px':report['initial_reprojection_rms_px'],'joint_limits':'passed','invalid_and_blank':'rejected'}))
