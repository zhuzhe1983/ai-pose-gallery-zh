#!/usr/bin/env python3
"""Validate manual evidence and exercise a real exported rig when supplied.

The 18-point model does not contain face, palm, finger or sole normal points.
These tests check the distinction between fixed manual input and inferred data.
"""
import copy
import json
import os
import unittest
from pathlib import Path

from orientation_hints import load_orientation_hints

POSE = 'solo_stand_arms-up-stretch'
IMAGE = f'img/{POSE}_f.png'

class FakeRig:
    def __init__(self):
        self.controls = [
            {'key': key, 'property': prop, 'min': minimum, 'max': maximum}
            for key, limits in {
                'neck': {'nod': (-35, 45), 'tilt': (-25, 25), 'turn': (-45, 45)},
                'head': {'nod': (-30, 35), 'tilt': (-20, 20), 'turn': (-40, 40)},
                'l_wrist': {'bend': (-80, 80), 'tilt': (-30, 30), 'turn': (-90, 90)},
                'r_wrist': {'bend': (-80, 80), 'tilt': (-30, 30), 'turn': (-90, 90)},
                'l_ankle': {'bend': (-45, 60), 'tilt': (-25, 25), 'turn': (-35, 35)},
                'r_ankle': {'bend': (-45, 60), 'tilt': (-25, 25), 'turn': (-35, 35)},
            }.items() for prop, (minimum, maximum) in limits.items()
        ]


def sample():
    return {'schema': 'pose-atlas/orientations@1', 'pose': POSE,
            'joints': {'head': {'nod': 8, 'turn': 12}, 'l_wrist': {'bend': -15},
                       'r_ankle': {'tilt': 8, 'bend': 20}},
            'evidence': {j: [{'image': IMAGE, 'note': 'Manual visual estimate; requires review.'}]
                         for j in ('head', 'l_wrist', 'r_ankle')}}


class HintValidation(unittest.TestCase):
    def setUp(self):
        self.rig = FakeRig()

    def check_rejected(self, data, rig=None):
        with self.assertRaises(ValueError):
            load_orientation_hints(data, rig or self.rig, POSE)

    def test_each_axis_status_and_approximate_toe(self):
        flat, report = load_orientation_hints(sample(), self.rig, POSE)
        self.assertEqual(flat['head.nod'], 8)
        self.assertEqual(report['joints']['head']['turn'], 'recorded_manual')
        self.assertEqual(report['joints']['head']['tilt'], 'unresolved')
        self.assertEqual(report['joints']['l_wrist']['bend'], 'recorded_manual')
        self.assertEqual(report['joints']['r_wrist']['turn'], 'unresolved')
        self.assertEqual(report['joints']['r_ankle']['bend'], 'recorded_manual')
        # A hints file alone does not assert that an estimated toe point exists.
        self.assertEqual(report['joints']['l_ankle']['bend'], 'unresolved')
        self.assertEqual(report['joints']['l_ankle']['tilt'], 'unresolved')
        self.assertEqual(report['evidence']['head'][0]['image'], IMAGE)
        self.assertEqual(load_orientation_hints(None, self.rig, POSE)[0], {})

    def test_wrong_or_missing_evidence(self):
        variants = []
        for change in (
            lambda d: d.update(extra=True),
            lambda d: d.update(schema='other'),
            lambda d: d.update(pose='solo_kneel_hands-thighs'),
            lambda d: d['evidence'].pop('head'),
            lambda d: d['evidence']['head'].clear(),
            lambda d: d['evidence']['head'][0].update(image='img/solo_kneel_hands-thighs_f.png'),
            lambda d: d['evidence']['head'][0].update(image=f'img/{POSE}_not-a-view.png'),
            lambda d: d['evidence']['head'][0].update(image=f'img/{POSE}_hi.png/../bad'),
            lambda d: d['evidence']['head'][0].update(note='   '),
            lambda d: d['evidence']['head'][0].update(note='X'*501),
            lambda d: d['evidence']['head'][0].update(untrusted=True),
            lambda d: d['joints'].update(body={'bend': 3}),
            lambda d: d['joints']['head'].update(roll=0),
            lambda d: d['joints']['head'].update(nod=float('nan')),
            lambda d: d['joints']['head'].update(nod=float('inf')),
            lambda d: d['joints']['head'].update(nod=True),
            lambda d: d['joints']['head'].update(nod='8'),
            lambda d: d['joints']['head'].update(nod=56),
        ):
            d = copy.deepcopy(sample()); change(d); variants.append(d)
        for d in variants:
            with self.subTest(data=d): self.check_rejected(d)

    def test_old_rig_requires_reexport_for_wrist(self):
        self.rig.controls = [c for c in self.rig.controls if not c['key'].endswith('_wrist')]
        with self.assertRaisesRegex(ValueError, 're-export'):
            load_orientation_hints(sample(), self.rig, POSE)

    def test_neck_hint_is_independent_and_requires_current_rig(self):
        hints = sample()
        hints['joints']['neck'] = {'nod': -10}
        hints['evidence']['neck'] = [{'image': IMAGE, 'note': 'Neck angle; skull adjusted separately.'}]
        flat, report = load_orientation_hints(hints, self.rig, POSE)
        self.assertEqual(flat['neck.nod'], -10)
        self.assertEqual(flat['head.nod'], 8)
        self.assertEqual(report['joints']['neck']['turn'], 'unresolved')
        self.rig.controls = [c for c in self.rig.controls if c['key'] != 'neck']
        with self.assertRaisesRegex(ValueError, 're-export'):
            load_orientation_hints(hints, self.rig, POSE)


class RealFit(unittest.TestCase):
    def test_fixed_controls_and_fk(self):
        path = os.environ.get('POSE_FITTING_RIG')
        if not path: self.skipTest('set POSE_FITTING_RIG to an exported browser rig')
        from fit_pose import Rig, fit, project
        import numpy as np
        rig = Rig(json.loads(Path(path).read_text()))
        self.assertIn(len(rig.controls), (43, 46))
        if rig.data.get('jointControlVersion', 4) >= 5:
            self.assertEqual(len(rig.controls), 46)
            for key in ('neck', 'head'):
                controls = [c for c in rig.controls if c['key'] == key]
                self.assertEqual(len(controls), 3)
                self.assertTrue(all(len(c['drivers']) == 1 for c in controls))
        np.testing.assert_allclose(rig.forward(rig.defaults), rig.data['worldPoints'], atol=1e-8)
        # Real offsets and constraints, synthetic observations with known rigid root.
        values = rig.defaults.copy()
        for i, c in enumerate(rig.controls):
            if c['key'] == 'l_arm' and c['property'] == 'raise': values[i] = 90
            if c['key'] == 'l_elbow': values[i] = 70
        xy, _ = project(rig.forward(values), [0, 5, 3.5, 0, 0], 900, 1200)
        record = {'schema':'pose-keypoints/1', 'image':IMAGE, 'width':900, 'height':1200,
                  'coordinate_system':'original_image_pixels_x_right_y_down',
                  'confidence_kind':'heatmap_peak_uncalibrated',
                  'points':[{'name':point['name'], 'x':float(q[0]), 'y':float(q[1]), 'confidence':1.}
                            for point,q in zip(rig.data['points'],xy)]}
        scene, result = fit(record, rig, starts=1, max_evaluations=120, orientations=sample())
        self.assertEqual(result['status'], 'draft-needs-review')
        for key, value in load_orientation_hints(sample(), rig, POSE)[0].items():
            self.assertAlmostEqual(result['angles'][key], value, places=8)
        self.assertEqual(result['orientation_assessment']['joints']['head']['turn'], 'recorded_manual')
        self.assertEqual(result['orientation_assessment']['joints']['r_wrist']['turn'], 'unresolved')
        self.assertEqual(result['orientation_assessment']['joints']['l_ankle']['bend'], 'fitted_approx')
        _, missing_toe = fit(record, rig, excluded=('left_toe',), starts=1,
                             max_evaluations=120, orientations=sample())
        self.assertEqual(missing_toe['orientation_assessment']['joints']['l_ankle']['bend'], 'unresolved')
        self.assertAlmostEqual(missing_toe['angles']['l_ankle.bend'],
                               rig.data['presets'][POSE]['l_ankle.bend'], places=8)
        for c in rig.controls:
            if c['key'] in ('body', 'neck'):
                key = f"{c['key']}.{c['property']}"
                expected = rig.data['presets'][POSE].get(key, c['value'])
                self.assertAlmostEqual(result['angles'][key], expected, places=8)
        self.assertEqual(scene['schema'], rig.data['template']['schema'])
        self.assertFalse(scene['floorLock'])


if __name__ == '__main__': unittest.main()
