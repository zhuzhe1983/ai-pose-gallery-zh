"""Actual exported mesh checks; these are not recognition accuracy tests."""
import copy
import json
import os
from pathlib import Path
import unittest
import numpy as np
from contacts import Contacts, profile_for
from fit_pose import Rig, observations
from fit_multiview import resolve_prior

class ContactTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path=Path(os.environ.get('POSE_CONTACT_RIG','output/offline-pose/rig-contact.json'))
        if not path.exists():raise unittest.SkipTest('Export the real contact rig')
        cls.rig=Rig(json.loads(path.read_text()))

    def test_python_skin_matches_exported_browser_skin(self):
        r=self.rig
        if not all('world' in v for v in r.data['skinSamples']['vertices'].values()):self.skipTest('Re-export browser sample positions')
        world,_=r.transforms(r.defaults);actual=r.skin_points(world)
        expected=np.array([v['world'] for v in r.data['skinSamples']['vertices'].values()])
        self.assertLess(float(np.max(np.linalg.norm(actual-expected,axis=1))),1e-6)

    def test_contact_refinement_improves_previous_kneel_and_keeps_limits(self):
        r=self.rig;pose='solo_kneel_hands-thighs';v,n=resolve_prior(r,pose);c=Contacts(r,profile_for(pose))
        after=c.assess(v)
        old=v.copy()
        for s in 'lr':
            for key,val in {'leg.raise':5,'knee.bend':95,'ankle.tilt':0,'ankle.turn':0,'arm.raise':5,'arm.straddle':5,'arm.turn':-20,'elbow.bend':20,'wrist.bend':0,'wrist.tilt':0,'wrist.turn':0}.items():old[n.index(s+'_'+key)]=val
        before=c.assess(old)
        self.assertLess(after['ground_height_spread_m'],.008)
        self.assertLess(after['ground_height_spread_m'],before['ground_height_spread_m'])
        self.assertTrue(all(p['gap_m']<.012 and p['normal_error_degrees']<10 for p in after['palms']))
        self.assertTrue(all(c['min']<=x<=c['max'] for c,x in zip(r.controls,v)))
        print(json.dumps({'contact_samples_only':True,'before':before,'after':after}))

    def test_no_contact_evidence_is_unresolved(self):
        c=Contacts(self.rig,None)
        self.assertFalse(c.assess(self.rig.defaults)['passed'])
        self.assertEqual(c.residual(self.rig.defaults).size,0)

    def test_upper_crop_never_uses_hallucinated_lower_body(self):
        names=[p['name'] for p in self.rig.data['points']]
        record={'schema':'pose-keypoints/1','body_region':'upper','coordinate_system':'original_image_pixels_x_right_y_down',
                'confidence_kind':'heatmap_peak_uncalibrated','width':900,'height':1200,
                'points':[{'name':n,'x':300+i*12,'y':100+i*20,'confidence':1} for i,n in enumerate(names)]}
        _,weights,_,_=observations(record,self.rig)
        self.assertTrue(np.all(weights[8:]==0))
        record['points'][2]['confidence']=.1
        with self.assertRaises(ValueError):observations(record,self.rig)

if __name__=='__main__':unittest.main()
