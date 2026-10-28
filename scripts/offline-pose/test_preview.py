"""Security and provenance tests. Artificial fixtures are not recognition results."""
from datetime import datetime, timezone
import functools
import http.client
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import tempfile
import threading
import unittest

from preview_server import POINT_NAMES, PreviewHandler, safe_path, scan_state


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.image = "solo_stand_test_f"
        self.write("data/pose-3d-status.json", {"total": 1, "verified": 0, "poses": [{"id": "solo_stand_test", "views": ["f"], "status": "not-started"}]})
        self.write("studio/human.js", 'model.userData.mesh = "makehuman-v3";')
        self.write("img/" + self.image + ".png", b"test image fixture")
        self.write("preview/index.html", "<title>Fixture</title>")

    def tearDown(self):
        self.temporary.cleanup()

    def write(self, path, value):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(value, bytes):
            target.write_bytes(value)
        else:
            target.write_text(value if isinstance(value, str) else json.dumps(value))
        return target

    def points(self):
        return {"schema": "pose-keypoints/1", "image": f"img/{self.image}.png", "width": 900, "height": 1200, "confidence_kind": "heatmap_peak_uncalibrated", "points": [{"name": name, "x": i, "y": i, "confidence": 1.1} for i, name in enumerate(sorted(POINT_NAMES))]}

    def status(self, status, age=0, **extra):
        timestamp = datetime.fromtimestamp(1000 - age, timezone.utc).isoformat()
        self.write("output/offline-pose/status.json", {"schema": "pose-atlas/offline-progress@1", "jobs": [{"image": f"img/{self.image}.png", "status": status, "stage": "fit", "updatedAt": timestamp, **extra}]})

    def test_artifact_counts_are_separate_and_never_approve(self):
        self.write(f"output/sketch-pose-offline/{self.image}.json", self.points())
        self.write("output/sketch-pose-offline/run/results.json", {"results": [self.points(), self.points()]})
        self.write(f"output/offline-pose/drafts/{self.image}.fit.json", {"schema": "pose-atlas/offline-fit@1", "image": f"img/{self.image}.png", "mesh": "makehuman-v2"})
        self.write(f"output/offline-pose/ready/{self.image}.scene.json", {"schema": "pose-atlas/studio@3", "figures": [{"mesh": "makehuman-v2"}]})
        state = scan_state(self.root, 1000)
        self.assertEqual(state["counts"]["detectedImages"], 1)
        self.assertEqual(state["counts"]["fitImages"], 1)
        self.assertEqual(state["counts"]["groundedImages"], 1)
        self.assertEqual(state["counts"]["verifiedGroups"], 0)
        self.assertEqual(state["counts"]["running"], 0)
        self.assertEqual(state["items"][0]["status"], "needs_review")
        self.assertTrue(state["items"][0]["legacyMesh"])
        self.assertIn("previewScene=", state["items"][0]["studioURL"])

    def test_real_status_updates_without_invented_completion(self):
        self.assertEqual(scan_state(self.root, 1000)["items"][0]["status"], "not_started")
        self.status("running", progress={"completed": 1, "total": 3, "unit": "steps"})
        current = scan_state(self.root, 1000)
        self.assertEqual(current["counts"]["running"], 1)
        self.assertEqual(current["counts"]["runningGroups"], 1)
        self.assertEqual(current["counts"]["fitImages"], 0)
        self.status("running", age=181)
        stale = scan_state(self.root, 1000)
        self.assertEqual(stale["counts"]["running"], 0)
        self.assertEqual(stale["items"][0]["status"], "stale")
        self.status("failed", message="Actual worker failure")
        self.assertEqual(scan_state(self.root, 1000)["counts"]["failed"], 1)
        self.status("done")
        done = scan_state(self.root, 1000)
        self.assertEqual(done["counts"]["verifiedGroups"], 0)
        self.assertEqual(done["counts"]["fitImages"], 0)

    def test_negative_control_dedup_and_partial_files(self):
        blank = self.points()
        blank["image"] = "output/sketch-pose-offline/blank-control.png"
        self.write("output/sketch-pose-offline/blank-control.png", b"blank fixture")
        self.write("output/sketch-pose-offline/blank-control.json", blank)
        self.write("output/sketch-pose-offline/review.json", {"results": [{"image": blank["image"], "status": "reject", "exclude_points": list(POINT_NAMES)}]})
        self.write("output/sketch-pose-offline/partial.json", '{"points":')
        self.write("output/sketch-pose-offline/private-photo.json", {**self.points(), "image": "/private/user-photo.png"})
        state = scan_state(self.root, 1000)
        self.assertEqual(state["counts"]["controls"], 1)
        self.assertEqual(state["counts"]["detectedImages"], 0)
        self.assertTrue(state["warnings"])
        self.assertEqual(next(i for i in state["items"] if i["control"])["status"], "rejected")
        self.assertEqual(len(state["items"]), 2)

    def test_pose_groups_compare_same_model_but_not_per_view_cameras(self):
        self.write("data/pose-3d-status.json", {"total": 1, "verified": 0, "poses": [{"id": "solo_stand_test", "views": ["f", "s"], "status": "not-started"}]})
        self.write("img/solo_stand_test_s.png", b"test side")
        figure = {"id":"A", "sex":"female", "height":1.65, "scale":1, "outfit":"ivory", "mesh":"makehuman-v3", "position":[0,0,0], "rotation":[0,0,0,1], "joints":{"head":[0,0,0,1], "pelvis":[0,0,0,1]}}
        f = {"schema":"pose-atlas/studio@3", "figures":[figure], "camera":{"position":[0,0,5]}, "reference":{"view":"f"}}
        side = json.loads(json.dumps(f)); side["camera"]["position"] = [5,0,0]; side["reference"]["view"] = "s"
        side["figures"][0]["joints"]["head"] = [0,0,0,-1] # same quaternion, opposite sign
        side["figures"][0]["position"][0] = 0.000005
        self.write("output/offline-pose/ready/solo_stand_test_f.scene.json", f)
        only = scan_state(self.root, 1000)
        self.assertEqual(only["groups"][0]["sceneConsistency"], "single")
        self.write("output/offline-pose/ready/solo_stand_test_s.scene.json", side)
        shared = scan_state(self.root, 1000)
        self.assertEqual(len(shared["groups"]), 1)
        self.assertEqual(len(shared["groups"][0]["views"]), 2)
        self.assertEqual(shared["groups"][0]["sceneConsistency"], "shared")
        self.assertEqual(shared["groups"][0]["sceneCount"], 2)
        self.assertEqual(shared["counts"]["verifiedGroups"], 0)
        self.write("output/offline-pose/status.json", {"schema":"pose-atlas/offline-progress@1", "jobs":[
            {"image":"img/solo_stand_test_f.png", "status":"running", "updatedAt":datetime.fromtimestamp(1000, timezone.utc).isoformat()},
            {"image":"img/solo_stand_test_s.png", "status":"running", "updatedAt":datetime.fromtimestamp(1000, timezone.utc).isoformat()}]})
        active = scan_state(self.root, 1000)
        self.assertEqual(active["counts"]["running"], 2) # per-view status records remain separate
        self.assertEqual(active["counts"]["runningGroups"], 1) # one task in the UI
        self.assertEqual(len(active["groups"][0]["views"]), 2)

        side["figures"][0]["position"][0] = .01
        self.write("output/offline-pose/ready/solo_stand_test_s.scene.json", side)
        self.assertEqual(scan_state(self.root, 1000)["groups"][0]["sceneConsistency"], "conflict")
        side["figures"][0].pop("joints")
        self.write("output/offline-pose/ready/solo_stand_test_s.scene.json", side)
        self.assertEqual(scan_state(self.root, 1000)["groups"][0]["sceneConsistency"], "unknown")
        side["schema"] = "pose-atlas/studio@2"
        self.write("output/offline-pose/ready/solo_stand_test_s.scene.json", side)
        self.assertEqual(scan_state(self.root, 1000)["groups"][0]["sceneConsistency"], "unknown")

    def test_empty_and_negative_control_are_not_mixed_into_gallery_group(self):
        self.write("output/sketch-pose-offline/blank-control.png", b"blank")
        blank = self.points(); blank["image"] = "output/sketch-pose-offline/blank-control.png"
        self.write("output/sketch-pose-offline/blank-control.json", blank)
        state = scan_state(self.root, 1000)
        self.assertEqual(len(state["groups"]), 2)
        self.assertEqual(next(g for g in state["groups"] if not g["control"])["sceneConsistency"], "none")
        self.assertEqual(next(g for g in state["groups"] if g["control"])["id"], "blank-control")
        self.assertEqual(state["counts"]["verifiedGroups"], 0)

    def test_comparison_links_require_valid_same_pose_report(self):
        image = "/output/offline-pose/comparisons/sample.jpg"
        report = "/output/offline-pose/comparisons/sample.multiview.json"
        self.write(image.lstrip("/"), b"comparison")
        self.write(report.lstrip("/"), {"schema": "pose-atlas/multiview-fit@1", "pose": "other_pose_bad"})
        self.status("needs_review", artifacts={"comparison": image, "multiReport": report})
        item = scan_state(self.root, 1000)["items"][0]
        self.assertIn("comparison", item["artifacts"])
        self.assertNotIn("multiReport", item["artifacts"])
        self.write(report.lstrip("/"), {"schema": "pose-atlas/multiview-fit@1", "pose": "solo_stand_test"})
        item = scan_state(self.root, 1000)["items"][0]
        self.assertIn("multiReport", item["artifacts"])
        self.assertEqual(scan_state(self.root, 1000)["counts"]["verifiedGroups"], 0)

    def test_path_allowlist_rejects_sensitive_files_and_symlinks(self):
        self.write(".git/config", "private")
        self.write("output/sketch-pose-offline/weights.onnx", b"weights")
        self.write("output/offline-pose/tool.py", "print('private')")
        (self.root / "preview/link.json").symlink_to(self.root / ".git/config")
        for path in ["/.git/config", "/../etc/passwd", "/%2e%2e/etc/passwd", "/%252e%252e/etc/passwd", "/studio/../../.git/config", "/output/sketch-pose-offline/weights.onnx", "/output/offline-pose/tool.py", "/preview/link.json", "/output/offline-pose/"]:
            with self.subTest(path=path):
                self.assertIsNone(safe_path(self.root, path))
        self.assertEqual(safe_path(self.root, "/preview/"), (self.root / "preview/index.html").resolve())

    def test_http_read_only_host_and_endpoint(self):
        class QuietHandler(PreviewHandler):
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, root=self.root))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            def request(method, path, host="127.0.0.1"):
                connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=3)
                try:
                    connection.request(method, path, headers={"Host": host})
                    result = connection.getresponse()
                    return result.status, result.read(), result.getheader("Content-Type")
                finally:
                    connection.close()
            status, body, mime = request("GET", "/api/preview-state")
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body)["counts"]["images"], 1)
            self.assertIn("application/json", mime)
            self.write("output/offline-pose/status.json", {"schema": "pose-atlas/offline-progress@1", "jobs": [{"image": f"img/{self.image}.png", "status": "running", "updatedAt": datetime.now(timezone.utc).isoformat()}]})
            self.assertEqual(json.loads(request("GET", "/api/preview-state")[1])["counts"]["running"], 1)
            self.write("output/offline-pose/status.json", {"schema": "pose-atlas/offline-progress@1", "jobs": [{"image": f"img/{self.image}.png", "status": "failed", "message": "unit-test fixture"}]})
            self.assertEqual(json.loads(request("GET", "/api/preview-state")[1])["counts"]["failed"], 1)
            self.assertEqual(request("HEAD", "/preview/")[:2], (200, b""))
            self.assertEqual(request("GET", "/preview/", "evil.example")[0], 403)
            self.assertEqual(request("POST", "/api/preview-state")[0], 405)
            self.assertEqual(request("GET", "/%2e%2e/etc/passwd")[0], 404)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(3)


if __name__ == "__main__":
    unittest.main()
