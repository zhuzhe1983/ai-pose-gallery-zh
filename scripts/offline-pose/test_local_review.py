"""Artificial fixtures verify review provenance; they do not approve gallery poses."""
import json
from pathlib import Path
import tempfile
import unittest
from local_review import CHECKS, SCHEMA, fingerprint, load_reviews, approved_dataset


class LocalReviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.group = {'id': 'solo_stand_test', 'control': False, 'sceneCount': 2,
                      'sceneConsistency': 'shared', 'views': []}
        for view in ('f', 's'):
            image = f'img/solo_stand_test_{view}.png'
            render = f'output/offline-pose/ready/solo_stand_test_{view}.png'
            scene = f'output/offline-pose/ready/solo_stand_test_{view}.scene.json'
            self.write(image, b'reference fixture'); self.write(render, b'render fixture')
            self.write(scene, {'figures': [{'id': 'A', 'joints': {'head': [0, 0, 0, 1]}}],
                               'camera': {'position': [0 if view == 'f' else 3, 1, 3]}})
            self.group['views'].append({'view': view, 'source': '/'+image,
                                       'artifacts': {'scene': '/'+scene, 'render': '/'+render}})
        self.record = {'id': self.group['id'], 'status': 'approved', 'reviewer': 'fixture',
                       'reviewedAt': '2026-10-29T00:00:00Z', 'visualViews': ['f', 's'],
                       'checks': dict.fromkeys(CHECKS, 'pass'), 'issues': [], 'evidence': {}}
        for v in self.group['views']:
            for url in [v['source'], *v['artifacts'].values()]:
                self.record['evidence'][url[1:]] = fingerprint(self.root, url[1:])

    def tearDown(self): self.tmp.cleanup()

    def write(self, relative, value):
        p = self.root / relative; p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(value if isinstance(value, bytes) else json.dumps(value).encode())

    def load(self):
        self.write('output/offline-pose/local-review.json', {'schema': SCHEMA, 'groups': [self.record]})
        return load_reviews(self.root, [self.group])

    def test_approved_pose_has_one_figure_set_and_two_cameras(self):
        reviews, summary = self.load()
        self.assertEqual(summary['counts']['approved'], 1)
        result = approved_dataset(self.root, [self.group], reviews)
        self.assertEqual(len(result['poses']), 1)
        self.assertEqual(len(result['poses'][0]['scene']['figures']), 1)
        self.assertEqual(set(result['poses'][0]['cameras']), {'f', 's'})

    def test_numerical_success_does_not_approve(self):
        self.record.update(status='screened', numericPassed=True)
        reviews, summary = self.load()
        self.assertEqual(summary['counts']['approved'], 0)
        self.assertEqual(approved_dataset(self.root, [self.group], reviews)['poses'], [])

    def test_missing_hand_review_cannot_approve(self):
        self.record['checks']['hands'] = 'unobserved'
        reviews, _ = self.load()
        self.assertEqual(reviews[self.group['id']]['status'], 'incomplete')

    def test_unseen_view_cannot_approve(self):
        self.record['visualViews'] = ['f']
        reviews, _ = self.load()
        self.assertEqual(reviews[self.group['id']]['status'], 'incomplete')

    def test_changed_scene_expires_approval(self):
        self.load()
        self.write('output/offline-pose/ready/solo_stand_test_s.scene.json', {'figures': []})
        reviews, summary = self.load()
        self.assertEqual(reviews[self.group['id']]['status'], 'outdated')
        self.assertEqual(summary['counts']['approved'], 0)

    def test_inconsistent_views_cannot_approve(self):
        self.group['sceneConsistency'] = 'conflict'
        reviews, _ = self.load()
        self.assertEqual(reviews[self.group['id']]['status'], 'incomplete')


if __name__ == '__main__': unittest.main()
