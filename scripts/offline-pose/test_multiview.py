"""Numerical validation on the real exported v3 rig, not recognition evidence."""
import copy
import json
import os
from pathlib import Path
import unittest

import numpy as np

from fit_pose import Rig, project
from fit_multiview import fit_multiview, resolve_prior

ROOT = Path(__file__).resolve().parents[2]


class MultiViewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = Path(os.environ.get("POSE_MULTIVIEW_TEST_RIG", ROOT / "output/offline-pose/rig-v3.json"))
        if not path.is_file():
            raise unittest.SkipTest("Export the actual v3 rig, or set POSE_MULTIVIEW_TEST_RIG")
        cls.rig = Rig(json.loads(path.read_text()))
        cls.pose = "solo_stand_hands-hair"
        cls.prior, cls.names = resolve_prior(cls.rig, cls.pose)
        cls.truth = cls.prior.copy()
        for key, value in {"l_arm.raise": 65, "l_arm.straddle": 23, "l_arm.turn": -35,
                           "l_elbow.bend": 80, "r_arm.raise": 35, "r_elbow.bend": 38,
                           "l_leg.raise": 12, "r_leg.raise": -5, "l_knee.bend": 18,
                           "r_knee.bend": 25, "l_ankle.bend": -8, "r_ankle.bend": 6}.items():
            cls.truth[cls.names.index(key)] = value
        cls.world = cls.rig.forward(cls.truth)
        cls.records = []
        # A negative-side view deliberately tests the signed-side branch choice.
        for view, camera in [("f", [0, 5, 3.8, .03, -.05]), ("s", [-90, 3, 3.5, -.04, .02])]:
            xy, _ = project(cls.world, camera, 900, 1200)
            cls.records.append({"schema": "pose-keypoints/1", "coordinate_system": "original_image_pixels_x_right_y_down",
                                "confidence_kind": "heatmap_peak_uncalibrated", "image": f"img/{cls.pose}_{view}.png",
                                "width": 900, "height": 1200, "category": "synthetic_numerical_validation_not_recognition",
                                "points": [{"name": marker["name"], "x": float(point[0]), "y": float(point[1]), "confidence": 1.0}
                                           for marker, point in zip(cls.rig.data["points"], xy)]})

    def test_known_two_view_pose_low_error_shared_joints_and_fixed_root(self):
        scenes, report = fit_multiview(self.records, self.rig, starts=2, max_evaluations=500)
        for view in report["views"]:
            self.assertLess(view["reprojection_rms_px"], 2.5, report)
        reconstructed = np.array([p["world"] for p in report["views"][0]["points"]])
        world_rms = float(np.sqrt(np.mean(np.sum((reconstructed - self.world) ** 2, axis=1))))
        self.assertLess(world_rms, .025, f"3D landmark RMS {world_rms}")
        self.assertEqual(report["camera_branch"]["s"], -1)
        self.assertEqual(scenes["f"]["figures"][0]["joints"], scenes["s"]["figures"][0]["joints"])
        for i, control in enumerate(self.rig.controls):
            key = self.names[i]
            self.assertGreaterEqual(report["angles"][key], control["min"] - 1e-8)
            self.assertLessEqual(report["angles"][key], control["max"] + 1e-8)
            if control["key"] in {"body", "neck", "head"} or control["key"].endswith("_wrist"):
                self.assertEqual(report["angles"][key], self.prior[i])
        self.assertFalse(report["verified"])
        self.assertEqual(report["endpoint_orientation"]["joints"]["head"]["turn"], "unresolved")
        self.assertEqual(report["endpoint_orientation"]["joints"]["l_ankle"]["tilt"], "unresolved")
        print(json.dumps({"synthetic_only": True, "rms_px": [v["reprojection_rms_px"] for v in report["views"]],
                          "world_landmark_rms_m": world_rms, "side_branch": report["camera_branch"]["s"]}))

    def test_missing_toes_freezes_ankle_and_manual_head_hint_stays_fixed(self):
        hints = {"head.nod": 8}
        _, report = fit_multiview(self.records, self.rig, excludes={"s": ["left_toe"]}, manual_hints=hints,
                                  camera_sides={"s": -1}, starts=1, max_evaluations=160)
        self.assertEqual(report["angles"]["l_ankle.bend"], self.prior[self.names.index("l_ankle.bend")])
        self.assertEqual(report["angles"]["head.nod"], 8)
        self.assertEqual(report["endpoint_orientation"]["joints"]["l_ankle"]["bend"], "unresolved")
        self.assertEqual(report["endpoint_orientation"]["joints"]["head"]["nod"], "recorded_manual")

    def test_inconsistent_views_fail_residual_gate(self):
        records = copy.deepcopy(self.records)
        wrist = next(p for p in records[1]["points"] if p["name"] == "right_wrist")
        wrist["y"] += 350
        _, report = fit_multiview(records, self.rig, camera_sides={"s": -1}, starts=1, max_evaluations=250)
        self.assertFalse(report["quality_gate"]["passed"])
        self.assertTrue(any("high_reprojection_residual" in reason for reason in report["quality_gate"]["reasons"]))
        self.assertFalse(report["verified"])

    def test_opposing_spine_angles_fail_gate_even_with_matching_points(self):
        # Matching projections alone cannot approve a compensating torso pose.
        truth = self.truth.copy()
        truth[self.names.index("pelvis.bend")] = -20
        truth[self.names.index("waist.bend")] = 25
        records = copy.deepcopy(self.records)
        world = self.rig.forward(truth)
        cameras = [[0, 5, 3.8, .03, -.05], [-90, 3, 3.5, -.04, .02]]
        for record, camera in zip(records, cameras):
            xy, _ = project(world, camera, record["width"], record["height"])
            for point, coordinate in zip(record["points"], xy):
                point.update(x=float(coordinate[0]), y=float(coordinate[1]))
        _, report = fit_multiview(records, self.rig, prior=dict(zip(self.names, truth)),
                                  camera_sides={"s": -1}, starts=1, max_evaluations=250)
        self.assertLess(max(v["reprojection_rms_px"] for v in report["views"]), 2.5)
        self.assertTrue(report["spine_counterrotations"])
        self.assertIn("opposing_spine_rotations_need_manual_review", report["quality_gate"]["reasons"])
        self.assertFalse(report["quality_gate"]["passed"])
        self.assertEqual(report["status"], "draft-rejected-needs-correction")
        self.assertFalse(report["verified"])

    def test_old_rig_old_protocol_bad_views_and_mixed_groups_are_rejected(self):
        invalid = []
        item = copy.deepcopy(self.records); item[0]["coordinate_system"] = "normalized"; invalid.append(item)
        item = copy.deepcopy(self.records); item[0]["schema"] = "old-format"; invalid.append(item)
        item = copy.deepcopy(self.records); item[1]["image"] = "img/solo_stand_contrapposto-hip_bad.png"; invalid.append(item)
        item = copy.deepcopy(self.records); item[1]["view"] = "f"; invalid.append(item)
        item = copy.deepcopy(self.records); item[1]["image"] = "img/solo_stand_other_s.png"; invalid.append(item)
        item = copy.deepcopy(self.records); item[1]["image"] = item[0]["image"]; invalid.append(item)
        for item in invalid:
            with self.subTest(item=item[1]["image"]), self.assertRaises(ValueError):
                fit_multiview(item, self.rig, starts=1, max_evaluations=1)
        old = copy.deepcopy(self.rig.data); old["mesh"] = "makehuman-v2"
        with self.assertRaises(ValueError):
            fit_multiview(self.records, Rig(old))
        with self.assertRaises(ValueError):
            fit_multiview(self.records, self.rig, excludes={"lo": ["head"]})
        with self.assertRaises(ValueError):
            fit_multiview(self.records, self.rig, camera_sides={"s": 0})


if __name__ == "__main__":
    unittest.main()
