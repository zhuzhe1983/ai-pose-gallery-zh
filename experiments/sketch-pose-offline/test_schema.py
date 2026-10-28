"""Protocol tests with artificial fixture coordinates, never recognition evidence."""
import copy
import unittest

from schema import CONFIDENCE_KIND, COORDINATE_SYSTEM, NAMES, validate_pose


def fixture():
    return {
        "width": 100, "height": 200, "confidence_kind": CONFIDENCE_KIND,
        "coordinate_system": COORDINATE_SYSTEM,
        "points": [{"name": name, "x": i * 3, "y": i * 5, "confidence": 0.8}
                   for i, name in enumerate(NAMES)],
    }


class ProtocolTests(unittest.TestCase):
    def test_order_and_ids_are_canonical(self):
        value = fixture()
        value["points"].reverse()
        result = validate_pose(value, (100, 200))
        self.assertEqual([p["name"] for p in result["points"]], list(NAMES))
        self.assertEqual([p["id"] for p in result["points"]], list(range(18)))
        self.assertEqual(result["review_status"], "unreviewed")

    def test_outside_coordinates_and_uncalibrated_peaks_are_preserved(self):
        value = fixture()
        value["points"][0].update(x=-20, y=220, confidence=1.2)
        value["points"][1]["confidence"] = -0.1
        result = validate_pose(value)
        self.assertEqual(result["points"][0]["x"], -20)
        self.assertEqual(result["points"][0]["confidence"], 1.2)
        self.assertEqual(result["points"][1]["confidence"], -0.1)
        self.assertEqual(result["diagnostics"]["out_of_image_points"], ["head"])

    def test_invalid_values_cannot_be_used_for_fitting(self):
        mutations = [
            lambda v: v["points"][0].update(x=float("nan")),
            lambda v: v["points"][0].update(confidence=float("inf")),
            lambda v: v["points"][0].update(x=True),
            lambda v: v["points"][0].update(name="left_toe"),
            lambda v: v["points"][0].update(id=2),
            lambda v: v["points"].pop(),
            lambda v: v.update(width=100.0),
            lambda v: v.update(confidence_kind="probability"),
            lambda v: v.update(coordinate_system="normalized"),
        ]
        for mutate in mutations:
            value = copy.deepcopy(fixture())
            mutate(value)
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_pose(value)
        with self.assertRaises(ValueError):
            validate_pose(fixture(), (200, 100))

    def test_coincident_points_are_flagged_not_silently_moved(self):
        value = fixture()
        value["points"][1].update(x=0, y=0)
        result = validate_pose(value)
        self.assertIn(["head", "neck"], result["diagnostics"]["coincident_points"])


if __name__ == "__main__":
    unittest.main()
