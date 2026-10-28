// SPDX-License-Identifier: GPL-3.0-only
import {
  readPoseImage,
  detectPoseImage,
  POSE_CONNECTIONS,
  EDITABLE_POINTS,
  pointConfidence,
} from "./pose-detection.js";
import { usablePerson } from "./pose-retarget.js";

const COLORS = [
  "#bb234e",
  "#147664",
  "#4645c6",
  "#aa6500",
  "#007caa",
  "#9e309d",
];
export function setupPosePhotoUI({ t, applyDetectedPose }) {
  const $ = (id) => document.getElementById(id),
    dialog = $("posePhotoDialog"),
    canvas = $("posePhotoCanvas");
  let image,
    result,
    controller,
    busy = false,
    selected = new Set(),
    drag,
    statusKey = "",
    statusValues = {},
    generation = 0;
  const format = (key, values = {}) =>
    Object.entries(values).reduce(
      (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
      t(key),
    );
  function status(key, values = {}, error = false) {
    statusKey = key;
    statusValues = values;
    $("photoStatus").textContent = format(key, values);
    $("photoStatus").classList.toggle("error", error);
  }
  function setBusy(value) {
    busy = value;
    $("photoProgress").hidden = !value;
    $("photoCancel").hidden = !value;
    $("photoRetry").disabled = value || !image;
    $("photoApply").disabled = value || !result || !selected.size;
    $("photoPeople")
      .querySelectorAll("input")
      .forEach((input) => (input.disabled = value));
    canvas.style.cursor = value ? "wait" : "crosshair";
  }
  function draw() {
    if (!image) return;
    const ctx = canvas.getContext("2d");
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(image, 0, 0);
    if (!result) return;
    const thickness = Math.max(2, canvas.width / 350);
    result.people.forEach((person, i) => {
      if (!selected.has(i)) return;
      const lm = person.landmarks;
      ctx.strokeStyle = COLORS[i];
      ctx.fillStyle = COLORS[i];
      ctx.lineWidth = thickness;
      for (const [a, b] of POSE_CONNECTIONS) {
        ctx.setLineDash(
          Math.min(pointConfidence(lm[a]), pointConfidence(lm[b])) < 0.35
            ? [thickness * 2, thickness * 2]
            : [],
        );
        ctx.beginPath();
        ctx.moveTo(lm[a].x * canvas.width, lm[a].y * canvas.height);
        ctx.lineTo(lm[b].x * canvas.width, lm[b].y * canvas.height);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const index of EDITABLE_POINTS) {
        const p = lm[index];
        ctx.beginPath();
        ctx.arc(
          p.x * canvas.width,
          p.y * canvas.height,
          thickness * 1.8,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.strokeStyle = COLORS[i];
        ctx.lineWidth = thickness;
      }
      const hip = lm[23];
      ctx.font = `bold ${Math.max(16, canvas.width / 45)}px sans-serif`;
      ctx.fillStyle = COLORS[i];
      ctx.fillText(
        String(i + 1),
        hip.x * canvas.width + 10,
        hip.y * canvas.height - 10,
      );
    });
  }
  function renderPeople() {
    $("photoPeople").replaceChildren();
    result?.people.forEach((person, i) => {
      const label = document.createElement("label"),
        input = document.createElement("input"),
        span = document.createElement("span");
      input.type = "checkbox";
      input.checked = selected.has(i);
      input.disabled = busy;
      input.onchange = () => {
        input.checked ? selected.add(i) : selected.delete(i);
        setBusy(false);
        draw();
      };
      span.textContent = format(
        usablePerson(person) ? "detectedPerson" : "uncertainPerson",
        { n: i + 1 },
      );
      label.style.color = COLORS[i];
      label.append(input, span);
      $("photoPeople").append(label);
    });
  }
  function stop() {
    generation++;
    controller?.abort();
    controller = null;
    setBusy(false);
    status("poseCancelled");
  }
  async function apply() {
    if (!result || busy) return;
    const run = ++generation;
    controller = new AbortController();
    setBusy(true);
    try {
      const report = await applyDetectedPose(
        { ...result, people: result.people.filter((_p, i) => selected.has(i)) },
        {
          sex: $("photoSex").value,
          signal: controller.signal,
          onProgress: (key, n, total) => status(key, { n, total }),
        },
      );
      if (run !== generation) return;
      status("photoApplied", { n: report.applied, added: report.added });
      const skipped = report.reports.reduce((n, r) => n + r.skipped.length, 0);
      $("photoSummary").textContent = format("photoAppliedHint", {
        skipped,
        ignored: report.ignored,
      });
      $("reviewPhoto").hidden = false;
    } catch (e) {
      if (run === generation)
        status(
          e.name === "AbortError" ? "poseCancelled" : e.message,
          {},
          e.name !== "AbortError",
        );
    } finally {
      if (run === generation) {
        controller = null;
        setBusy(false);
      }
    }
  }
  async function recognize() {
    if (!image || busy) return;
    const run = ++generation;
    controller = new AbortController();
    result = null;
    selected.clear();
    renderPeople();
    draw();
    setBusy(true);
    status("modelLoading");
    $("photoSummary").textContent = "";
    try {
      result = await detectPoseImage(image, {
        signal: controller.signal,
        onProgress: (key) => status(key),
      });
      if (run !== generation) return;
      result.people.forEach((person, i) => {
        person.originalLandmarks = structuredClone(person.landmarks);
        selected.add(i);
      });
      setBusy(false);
      renderPeople();
      draw();
      if (!result.people.length) {
        status("poseNoPeople", {}, true);
        return;
      }
      status("photoDetected", { n: result.people.length, ms: result.elapsed });
      await apply();
    } catch (e) {
      if (run === generation)
        status(
          e.name === "AbortError" ? "poseCancelled" : e.message,
          {},
          e.name !== "AbortError",
        );
    } finally {
      if (run === generation) {
        controller = null;
        setBusy(false);
      }
    }
  }
  async function load(source) {
    if (busy) stop();
    const run = ++generation;
    controller = new AbortController();
    setBusy(true);
    if (!dialog.open) dialog.showModal();
    status("photoReading");
    result = null;
    image = null;
    canvas.width = canvas.height = 1;
    selected.clear();
    renderPeople();
    $("photoSummary").textContent = "";
    try {
      const next = await readPoseImage(source, { signal: controller.signal });
      if (run !== generation) return;
      image = next;
      draw();
      setBusy(false);
      await recognize();
    } catch (e) {
      if (run === generation)
        status(
          e.name === "AbortError" ? "poseCancelled" : e.message,
          {},
          e.name !== "AbortError",
        );
    } finally {
      if (run === generation) {
        controller = null;
        setBusy(false);
      }
    }
  }
  const close = () => {
    if (busy) stop();
    dialog.close();
  };
  $("uploadPose").onclick = () => $("posePhotoFile").click();
  $("posePhotoFile").onchange = () => {
    const file = $("posePhotoFile").files[0];
    $("posePhotoFile").value = "";
    if (file) load(file);
  };
  $("reviewPhoto").onclick = () => dialog.showModal();
  $("photoRetry").onclick = recognize;
  $("photoApply").onclick = apply;
  $("closePhoto").onclick = $("photoDone").onclick = close;
  $("photoCancel").onclick = stop;
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  const pointer = (e) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
      rect,
    };
  };
  canvas.addEventListener("pointerdown", (e) => {
    if (busy || !result) return;
    const p = pointer(e);
    let closest = 24;
    result.people.forEach((person, i) => {
      if (!selected.has(i)) return;
      for (const index of EDITABLE_POINTS) {
        const point = person.landmarks[index],
          distance = Math.hypot(
            (p.x - point.x) * p.rect.width,
            (p.y - point.y) * p.rect.height,
          );
        if (distance < closest) {
          closest = distance;
          drag = { person, index };
        }
      }
    });
    if (drag) {
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag || busy) return;
    const p = pointer(e),
      point = drag.person.landmarks[drag.index];
    point.x = Math.max(0, Math.min(1, p.x));
    point.y = Math.max(0, Math.min(1, p.y));
    point.visibility = point.presence = 1;
    draw();
    status("photoEdited");
  });
  canvas.addEventListener("pointerup", () => {
    drag = null;
  });
  canvas.addEventListener("pointercancel", () => {
    drag = null;
  });
  return {
    translate: () => {
      if (statusKey) status(statusKey, statusValues);
      renderPeople();
    },
  };
}
