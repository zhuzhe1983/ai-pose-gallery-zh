// SPDX-License-Identifier: GPL-3.0-only
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { scene } from "./vendor/mannequin/scene.js";
import {
  createFigure,
  groundFigure,
  disposeFigure,
  bones,
  setOutfit,
  figureBounds,
} from "./figure.js";
import {
  PRESETS,
  NEUTRAL,
  JOINTS,
  jointAxes,
  applyValues,
  readAngles,
  writeAngles,
  constrainJoint,
  constrainFigure,
  constrainFingers,
} from "./presets.js";
import { locales, translate } from "./i18n.js";
import { FIGURE_IDS, MAX_FIGURES, SCALE_RANGE, BASE_HEIGHT } from "./config.js";
import { shareURL, sceneFragment, decodeScene } from "./scene-url.js";
import { readPoseImage, detectPoseImage } from "./pose-detection.js";
import {
  retargetPerson,
  validateDetection,
  usablePerson,
} from "./pose-retarget.js";
import { setupPosePhotoUI } from "./pose-photo-ui.js";

const $ = (id) => document.getElementById(id),
  STORE = "pose-atlas-studio-v1",
  FLOOR = -0.7;
const params = new URLSearchParams(location.search);
let lang = params.get("lang");
try {
  lang ||= localStorage.getItem("pose-language");
} catch {}
if (!locales.includes(lang)) lang = "zh";
const t = (key) => translate(key, lang);
const canvas = $("sceneCanvas");
let renderer,
  camera,
  orbit,
  gizmo,
  grid,
  helper,
  catalog,
  figures = [],
  active = "A",
  joint = "torso",
  moveMode = false,
  capturing = false;
let reference = null,
  referenceRequest = 0,
  rows = [],
  history = [],
  historyIndex = -1,
  restoring = false,
  toastTimer,
  libraryRequest = 0,
  urlTimer,
  urlRevision = 0,
  sharingReady = false;
let applyingPhoto = false,
  photoUI;
const cache = new Map(),
  sliders = new Map();
const rad = THREE.MathUtils.degToRad,
  deg = THREE.MathUtils.radToDeg;
const current = () => figure(active);
function figure(id) {
  const f = figures.find((f) => f.id === id);
  if (!f) throw Error(`Unknown figure: ${id}`);
  return f;
}
function finite(v, min, max, label = "value") {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw Error(`Invalid ${label} (${min}…${max})`);
  return v;
}
function vector(a, n, min, max) {
  if (!Array.isArray(a) || a.length !== n) throw Error("Invalid vector");
  return a.map((v) => finite(v, min, max));
}
function safeRead() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "null");
  } catch {
    return null;
  }
}
function notify(key, error = false) {
  $("toast").textContent = t(key);
  $("toast").classList.toggle("error", error);
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 4000);
}
function guarded(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      console.error(e);
      notify(e.message || "invalidScene", true);
    }
  };
}
function localName(value) {
  return value?.[lang] || value?.en || "";
}
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function translatePage() {
  document.documentElement.lang = { zh: "zh-CN", en: "en", ja: "ja" }[lang];
  document.title = `${t("studio")} · POSE Atlas`;
  document
    .querySelectorAll("[data-t]")
    .forEach((e) => (e.textContent = t(e.dataset.t)));
  document
    .querySelectorAll("[data-aria]")
    .forEach((e) => e.setAttribute("aria-label", t(e.dataset.aria)));
  document
    .querySelectorAll("[data-placeholder]")
    .forEach((e) => (e.placeholder = t(e.dataset.placeholder)));
  $("language").value = lang;
  $("language").setAttribute("aria-label", t("language"));
  $("galleryLink").href = $("galleryNav").href = `../?lang=${lang}`;
  if (renderer)
    $("backend").textContent = renderer.backend.isWebGPUBackend
      ? "WebGPU"
      : t("fallback");
  photoUI?.translate();
}
function makeFigure(
  sex = "female",
  height = BASE_HEIGHT[sex],
  id = FIGURE_IDS.find((id) => !figures.some((f) => f.id === id)),
  scale = 1,
  outfit = "ivory",
) {
  if (!["female", "male"].includes(sex)) throw Error("Invalid body type");
  if (!["white", "ivory"].includes(outfit)) throw Error("Invalid outfit");
  finite(height, 1.2, 2.2, "height");
  if (!id || figures.length >= MAX_FIGURES) throw Error("Six figures maximum");
  finite(scale, SCALE_RANGE.min, SCALE_RANGE.max, "scale");
  const model = createFigure(sex, height);
  setOutfit(model, outfit);
  model.scale.multiplyScalar(scale);
  groundFigure(model);
  const f = { id, sex, height, scale, outfit, model };
  figures.push(f);
  return f;
}
function addFigure(options = {}) {
  if (figures.length >= MAX_FIGURES) throw Error("Six figures maximum");
  const f = makeFigure(
    options.sex,
    options.height,
    undefined,
    options.scale,
    options.outfit,
  );
  const placements = [
    [0, 0],
    [0.8, 0],
    [-0.8, 0],
    [1.6, 0],
    [-1.6, 0],
    [0, -0.9],
    [0.8, -0.9],
    [-0.8, -0.9],
  ];
  const location = placements.find(([x, z]) =>
    figures.every(
      (other) =>
        other === f ||
        Math.hypot(other.model.position.x - x, other.model.position.z - z) >
          0.65,
    ),
  );
  const [x, z] = location || [0, 1];
  f.model.position.x = x;
  f.model.position.z = z;
  active = f.id;
  refresh();
  frameAll();
  commit();
  return f.id;
}
function removeFigure(id) {
  if (figures.length === 1) throw Error("Keep at least one figure");
  const f = figure(id);
  gizmo.detach();
  disposeFigure(f.model);
  figures = figures.filter((x) => x !== f);
  if (active === id) active = figures[0].id;
  refresh();
  commit();
}
function selectFigure(id) {
  figure(id);
  active = id;
  refresh();
  return getState();
}
function setFigure(id, changes = {}) {
  const f = figure(id);
  if (
    changes.outfit !== undefined &&
    !["white", "ivory"].includes(changes.outfit)
  )
    throw Error("Invalid outfit");
  if (changes.sex !== undefined && !["female", "male"].includes(changes.sex))
    throw Error("Invalid body type");
  if (changes.height !== undefined) finite(changes.height, 1.2, 2.2, "height");
  if (changes.scale !== undefined)
    finite(changes.scale, SCALE_RANGE.min, SCALE_RANGE.max, "scale");
  if (changes.position !== undefined) vector(changes.position, 3, -10, 10);
  if (changes.yaw !== undefined) finite(changes.yaw, -180, 180, "yaw");
  if (changes.sex && changes.sex !== f.sex) {
    const old = f.model,
      state = figureState(f);
    f.sex = changes.sex;
    f.height = changes.height ?? BASE_HEIGHT[f.sex];
    f.model = createFigure(f.sex, f.height);
    setOutfit(f.model, f.outfit);
    f.model.scale.multiplyScalar(f.scale);
    restoreFigure(f, { ...state, sex: f.sex });
    disposeFigure(old);
  }
  if (changes.height !== undefined) {
    f.model.scale.multiplyScalar(changes.height / f.height);
    f.height = changes.height;
  }
  if (changes.scale !== undefined) {
    f.model.scale.multiplyScalar(changes.scale / f.scale);
    f.scale = changes.scale;
  }
  if (changes.yaw !== undefined) f.model.rotation.y = rad(changes.yaw);
  if (changes.outfit !== undefined) {
    setOutfit(f.model, changes.outfit);
    f.outfit = changes.outfit;
  }
  if (changes.position) f.model.position.fromArray(changes.position);
  if (changes.ground === true || (!changes.position && $("floorLock").checked))
    groundFigure(f.model);
  refresh();
  commit();
  return figureState(f);
}
function setJoint(id, key, values, { record = true } = {}) {
  if (!JOINTS.includes(key) || !values || typeof values !== "object")
    throw Error("Unknown joint");
  const axes = jointAxes(key),
    f = figure(id);
  for (const [property, v] of Object.entries(values)) {
    const a = axes.find((a) => a.property === property);
    if (!a) throw Error(`Unknown axis: ${property}`);
    finite(v, a.min, a.max, property);
  }
  writeAngles(f.model, key, values);
  if ($("floorLock").checked) groundFigure(f.model);
  if (id === active) refreshValues();
  if (record) commit();
  return getJoint(id, key);
}
function getJoint(id, key) {
  if (!JOINTS.includes(key)) throw Error("Unknown joint");
  return readAngles(figure(id).model, key);
}
function setHand(id, side, curl, { record = true } = {}) {
  if (!["l", "r"].includes(side)) throw Error("Invalid hand");
  finite(curl, 0, 100, "curl");
  figure(id).model[`${side}_fingers`].bend = curl;
  constrainFingers(figure(id).model);
  refreshValues();
  if (record) commit();
}
function neutralFigure(id) {
  const f = figure(id);
  applyValues(f.model, NEUTRAL);
  f.model.l_fingers.bend = f.model.r_fingers.bend = 10;
  constrainFingers(f.model);
  groundFigure(f.model);
  refresh();
  commit();
}
async function detectImage(source, options = {}) {
  const image = await readPoseImage(source, options);
  return detectPoseImage(image, options);
}
async function applyDetectedPose(
  raw,
  { sex = "female", signal, onProgress = () => {} } = {},
) {
  if (applyingPhoto) throw Error("poseBusy");
  if (!["female", "male"].includes(sex)) throw Error("Invalid body type");
  const detection = structuredClone(validateDetection(raw));
  const people = detection.people.filter(usablePerson);
  if (!people.length)
    throw Error(detection.people.length ? "poseLowConfidence" : "poseNoPeople");
  const before = JSON.stringify(getState());
  const targets = [...figures].sort((a, b) => a.id.localeCompare(b.id));
  const staged = [],
    reports = [];
  applyingPhoto = true;
  try {
    // Stage hidden models. Cancellation/failure leaves the existing scene untouched.
    const centers = people.map(
      (p) => (p.landmarks[23].x + p.landmarks[24].x) / 2,
    );
    const center = (Math.min(...centers) + Math.max(...centers)) / 2;
    const centersY = people.map(
      (p) => (p.landmarks[23].y + p.landmarks[24].y) / 2,
    );
    const centerY = (Math.min(...centersY) + Math.max(...centersY)) / 2;
    const bodyPixels = people
      .map((p) => {
        const a = p.landmarks;
        return Math.hypot(
          ((a[11].x + a[12].x - a[23].x - a[24].x) * detection.width) / 2,
          ((a[11].y + a[12].y - a[23].y - a[24].y) * detection.height) / 2,
        );
      })
      .sort((a, b) => a - b);
    const metersPerPixel =
      0.43 / Math.max(25, bodyPixels[Math.floor(bodyPixels.length / 2)]);
    for (let i = 0; i < people.length; i++) {
      signal?.throwIfAborted();
      onProgress("fittingPose", i + 1, people.length);
      const prior = targets[i];
      const id =
        prior?.id ||
        FIGURE_IDS.find(
          (id) =>
            !figures.some((f) => f.id === id) &&
            !staged.some((f) => f.id === id),
        );
      const f = {
        id,
        sex: prior?.sex || sex,
        height: prior?.height || BASE_HEIGHT[sex],
        scale: prior?.scale || 1,
        outfit: prior?.outfit || "ivory",
      };
      f.model = createFigure(f.sex, f.height);
      f.model.visible = false;
      staged.push(f);
      f.model.scale.multiplyScalar(f.scale);
      setOutfit(f.model, f.outfit);
      reports.push({
        id,
        ...(await retargetPerson(f.model, people[i], {
          width: detection.width,
          height: detection.height,
          signal,
        })),
      });
      const hip = f.model.l_leg
        .getWorldPosition(new THREE.Vector3())
        .add(f.model.r_leg.getWorldPosition(new THREE.Vector3()))
        .multiplyScalar(0.5);
      f.model.position.x = THREE.MathUtils.clamp(
        (centers[i] - center) * detection.width * metersPerPixel - hip.x,
        -8,
        8,
      );
      f.model.position.z = 0;
      if (people.length === 1) groundFigure(f.model);
      else
        f.model.position.y +=
          THREE.MathUtils.clamp(
            -(centersY[i] - centerY) * detection.height * metersPerPixel,
            -7,
            7,
          ) - hip.y;
    }
    if (people.length > 1) {
      const bounds = new THREE.Box3();
      for (const f of staged) bounds.union(figureBounds(f.model));
      const shift = FLOOR - bounds.min.y + 0.003;
      for (const f of staged)
        f.model.position.y = THREE.MathUtils.clamp(
          f.model.position.y + shift,
          -9,
          9,
        );
    }
    signal?.throwIfAborted();
    if (JSON.stringify(getState()) !== before) throw Error("poseSceneChanged");
    gizmo.detach();
    for (const f of staged) {
      const index = figures.findIndex((old) => old.id === f.id);
      if (index >= 0) {
        disposeFigure(figures[index].model);
        figures[index] = f;
      } else figures.push(f);
      f.model.visible = true;
    }
    active = staged[0].id;
    joint = "torso";
    moveMode = false;
    reference = null;
    referenceRequest++;
    renderReference();
    renderLibrary();
    if (people.length > 1) $("floorLock").checked = false;
    refresh();
    frameAll([0, 0, 1]);
    document
      .querySelectorAll("[data-camera]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.camera === "f")),
      );
    commit();
    return {
      applied: staged.length,
      added: Math.max(0, staged.length - targets.length),
      ignored: detection.people.length - people.length,
      reports,
    };
  } catch (e) {
    for (const f of staged) if (!figures.includes(f)) disposeFigure(f.model);
    throw e;
  } finally {
    applyingPhoto = false;
  }
}
async function poseFromImage(source, options = {}) {
  const detection = await detectImage(source, options);
  const report = await applyDetectedPose(detection, options);
  return { detection, ...report };
}
function figureState(f) {
  return {
    id: f.id,
    sex: f.sex,
    height: f.height,
    scale: f.scale,
    outfit: f.outfit,
    position: f.model.position.toArray(),
    rotation: f.model.quaternion.toArray(),
    joints: Object.fromEntries(
      Object.entries(bones(f.model)).map(([k, j]) => [
        k,
        j.quaternion.toArray(),
      ]),
    ),
  };
}
function getState() {
  return {
    schema: "pose-atlas/studio@2",
    figures: figures.map(figureState),
    selected: active,
    joint,
    camera: {
      position: camera.position.toArray(),
      target: orbit.target.toArray(),
    },
    floorLock: $("floorLock").checked,
    grid: $("showGrid").checked,
    reference: reference
      ? { stem: reference.stem, view: reference.view }
      : null,
  };
}
function validateState(s) {
  if (
    !s ||
    !["pose-atlas/studio@1", "pose-atlas/studio@2"].includes(s.schema) ||
    !Array.isArray(s.figures) ||
    s.figures.length < 1 ||
    s.figures.length > MAX_FIGURES
  )
    throw Error("Invalid scene");
  const keys = Object.keys(bones(current().model)),
    ids = new Set();
  const quaternion = (q) => {
    vector(q, 4, -1, 1);
    if (Math.abs(Math.hypot(...q) - 1) > 0.01) throw Error("Invalid rotation");
  };
  for (const f of s.figures) {
    if (
      !FIGURE_IDS.includes(f.id) ||
      ids.has(f.id) ||
      !["female", "male"].includes(f.sex)
    )
      throw Error("Invalid figure");
    ids.add(f.id);
    finite(f.height, 1.2, 2.2);
    finite(f.scale ?? 1, SCALE_RANGE.min, SCALE_RANGE.max, "scale");
    if (f.outfit !== undefined && !["white", "ivory"].includes(f.outfit))
      throw Error("Invalid outfit");
    vector(f.position, 3, -10, 10);
    quaternion(f.rotation);
    if (!f.joints || Object.keys(f.joints).length !== keys.length)
      throw Error("Missing joints");
    for (const k of keys) quaternion(f.joints[k]);
  }
  if (!ids.has(s.selected) || !JOINTS.includes(s.joint))
    throw Error("Invalid selection");
  vector(s.camera?.position, 3, -100, 100);
  vector(s.camera?.target, 3, -20, 20);
  if (
    new THREE.Vector3()
      .fromArray(s.camera.position)
      .distanceTo(new THREE.Vector3().fromArray(s.camera.target)) < 0.1
  )
    throw Error("Invalid camera");
  if (typeof s.floorLock !== "boolean" || typeof s.grid !== "boolean")
    throw Error("Invalid preferences");
  if (
    s.reference &&
    (!/^[a-z0-9-]+_[a-z0-9-]+_[a-z0-9-]+$/.test(s.reference.stem) ||
      !["f", "d", "s", "hi", "lo"].includes(s.reference.view))
  )
    throw Error("Invalid reference");
  const validated = structuredClone(s);
  validated.schema = "pose-atlas/studio@2";
  validated.figures.forEach((f) => {
    f.scale ??= 1;
    f.outfit ??= "ivory";
  });
  return validated;
}
function restoreFigure(f, s) {
  f.model.position.fromArray(s.position);
  f.model.quaternion.fromArray(s.rotation);
  for (const [k, j] of Object.entries(bones(f.model)))
    j.quaternion.fromArray(s.joints[k]);
  constrainFigure(f.model);
  f.model.updateMatrixWorld(true);
}
function restoreState(raw) {
  const s = validateState(raw);
  restoring = true;
  gizmo.detach();
  try {
    const old = figures;
    figures = [];
    for (const state of s.figures) {
      const f = makeFigure(
        state.sex,
        state.height,
        state.id,
        state.scale,
        state.outfit,
      );
      restoreFigure(f, state);
    }
    old.forEach((f) => disposeFigure(f.model));
    active = s.selected;
    joint = s.joint;
    $("floorLock").checked = s.floorLock;
    $("showGrid").checked = s.grid;
    grid.visible = s.grid;
    camera.position.fromArray(s.camera.position);
    orbit.target.fromArray(s.camera.target);
    orbit.update();
    refresh();
    if (s.reference) {
      reference = {
        ...s.reference,
        entry: {
          name: {
            zh: s.reference.stem,
            en: s.reference.stem,
            ja: s.reference.stem,
          },
          views: [s.reference.view],
        },
      };
      renderReference();
      showReference(s.reference.stem, s.reference.view).catch(() => {
        reference = null;
        renderReference();
      });
    } else {
      referenceRequest++;
      reference = null;
      renderReference();
    }
  } finally {
    restoring = false;
  }
}
function persist() {
  try {
    localStorage.setItem(STORE, JSON.stringify(getState()));
  } catch {
    notify("storedError", true);
  }
}
function commit() {
  if (restoring || !camera || !figures.length) return;
  const serialized = JSON.stringify(getState());
  if (history[historyIndex] !== serialized) {
    history = history.slice(0, historyIndex + 1);
    history.push(serialized);
    if (history.length > 60) history.shift();
    historyIndex = history.length - 1;
  }
  persist();
  updateHistory();
  scheduleURL();
}
function updateHistory() {
  $("undo").disabled = historyIndex <= 0;
  $("redo").disabled = historyIndex >= history.length - 1;
}
function undo() {
  if (historyIndex > 0) {
    restoreState(JSON.parse(history[--historyIndex]));
    persist();
    updateHistory();
    scheduleURL();
  }
  return getState();
}
function redo() {
  if (historyIndex < history.length - 1) {
    restoreState(JSON.parse(history[++historyIndex]));
    persist();
    updateHistory();
    scheduleURL();
  }
  return getState();
}
function setHighlight(enabled = true) {
  for (const f of figures)
    f.model.traverse((o) => {
      if (o.isMesh && o.material.emissive)
        o.material.emissive.setHex(
          enabled &&
            f.id === active &&
            o.userData.joint === joint &&
            !o.userData.suit
            ? 0x201849
            : 0x000000,
        );
    });
}
function attachGizmo() {
  if (!figures.length) return;
  gizmo.detach();
  gizmo.setMode(moveMode ? "translate" : "rotate");
  gizmo.setSpace(moveMode ? "world" : "local");
  gizmo.attach(moveMode ? current().model : current().model[joint]);
  gizmo.showX =
    moveMode || (!joint.endsWith("_knee") && !joint.endsWith("_elbow"));
  gizmo.showY = gizmo.showX;
  gizmo.showZ = true;
  helper.visible = true;
  $("moveMode").setAttribute("aria-pressed", String(moveMode));
  $("canvasMove").setAttribute("aria-pressed", String(moveMode));
  $("canvasRotate").setAttribute("aria-pressed", String(!moveMode));
  $("modeHint").textContent = t(moveMode ? "moveAxisHint" : "rotateAxisHint");
  setHighlight();
}
function slider(
  container,
  key,
  label,
  min,
  max,
  step,
  getter,
  setter,
  unit = "",
) {
  const row = document.createElement("div");
  row.className = "slider-row";
  const labelEl = document.createElement("label");
  labelEl.textContent = label;
  labelEl.htmlFor = `range-${key}`;
  const number = document.createElement("input");
  Object.assign(number, {
    type: "number",
    min,
    max,
    step,
    id: `number-${key}`,
  });
  number.setAttribute("aria-label", label);
  const input = document.createElement("input");
  Object.assign(input, { type: "range", min, max, step, id: `range-${key}` });
  input.setAttribute("aria-label", label);
  row.append(labelEl, number, input);
  container.append(row);
  function update() {
    const v = getter();
    const rounded = Number(v.toFixed(step < 1 ? 2 : 1));
    input.value = rounded;
    number.value = rounded;
    number.title = `${min}…${max}${unit}`;
  }
  input.addEventListener("input", () => {
    setter(Number(input.value));
    update();
  });
  input.addEventListener("change", commit);
  number.addEventListener("change", () => {
    const n = Number(number.value);
    if (number.value !== "" && Number.isFinite(n)) {
      setter(Math.max(min, Math.min(max, n)));
      update();
      commit();
    } else update();
  });
  sliders.set(key, update);
  update();
}
function refreshValues() {
  sliders.forEach((fn) => fn());
  if (joint.endsWith("_wrist")) {
    $("fingerCurl").value = current().model[`${joint[0]}_fingers`].bend;
    $("fingerValue").textContent =
      `${Math.round(Number($("fingerCurl").value))}°`;
  }
}
function refresh() {
  if (!figures.length) return;
  $("actorCount").textContent = `${figures.length} / ${MAX_FIGURES}`;
  $("actors").replaceChildren();
  for (const f of figures) {
    const button = document.createElement("button");
    button.className = "actor-button";
    button.dataset.actor = f.id;
    button.setAttribute("aria-pressed", String(f.id === active));
    const badge = document.createElement("span");
    badge.className = "actor-letter";
    badge.textContent = f.id;
    const name = document.createElement("span");
    name.textContent = t(f.sex);
    const sub = document.createElement("span");
    sub.className = "actor-sub";
    sub.textContent = `${(f.height * f.scale).toFixed(2)} m · ${Math.round(f.scale * 100)}%`;
    name.append(sub);
    button.append(badge, name);
    button.onclick = () => selectFigure(f.id);
    const row = document.createElement("div");
    row.className = "actor-row";
    const remove = document.createElement("button");
    remove.className = "actor-delete";
    remove.dataset.deleteActor = f.id;
    remove.textContent = t("deleteFigure");
    remove.setAttribute("aria-label", `${t("deleteFigure")} ${f.id}`);
    remove.title = figures.length === 1 ? t("keepOne") : t("deleteFigure");
    remove.disabled = figures.length === 1;
    remove.onclick = () => removeFigure(f.id);
    row.append(button, remove);
    $("actors").append(row);
  }
  $("addFemale").disabled = $("addMale").disabled =
    figures.length === MAX_FIGURES;
  $("removeActor").disabled = figures.length === 1;
  $("joint").replaceChildren(...JOINTS.map((key) => new Option(t(key), key)));
  $("joint").value = joint;
  $("sex").value = current().sex;
  $("outfit").value = current().outfit;
  sliders.clear();
  $("jointControls").replaceChildren();
  $("figureControls").replaceChildren();
  for (const a of jointAxes(joint))
    slider(
      $("jointControls"),
      a.property,
      t(a.property),
      a.min,
      a.max,
      1,
      () => readAngles(current().model, joint)[a.property],
      (v) => setJoint(active, joint, { [a.property]: v }, { record: false }),
      "°",
    );
  $("fingerRow").hidden = !joint.endsWith("_wrist");
  const f = current();
  slider(
    $("figureControls"),
    "scale",
    t("scale"),
    80,
    120,
    1,
    () => f.scale * 100,
    (v) => {
      f.model.scale.multiplyScalar(v / 100 / f.scale);
      f.scale = v / 100;
      if ($("floorLock").checked) groundFigure(f.model);
      const sub = $("actors").querySelector(
        `[data-actor="${f.id}"] .actor-sub`,
      );
      if (sub)
        sub.textContent = `${(f.height * f.scale).toFixed(2)} m · ${Math.round(f.scale * 100)}%`;
    },
    "%",
  );
  for (const [axis, label] of [
    ["x", "positionX"],
    ["z", "positionZ"],
    ["y", "positionY"],
  ])
    slider(
      $("figureControls"),
      label,
      t(label),
      -3,
      3,
      0.01,
      () => f.model.position[axis],
      (v) => {
        f.model.position[axis] = v;
        if (axis === "y") $("floorLock").checked = false;
      },
    );
  slider(
    $("figureControls"),
    "yaw",
    t("yaw"),
    -180,
    180,
    1,
    () => deg(f.model.rotation.y),
    (v) => {
      f.model.rotation.y = rad(v);
    },
  );
  refreshValues();
  attachGizmo();
  updateHistory();
}
function sceneBounds() {
  const box = new THREE.Box3();
  for (const f of figures) {
    box.union(figureBounds(f.model));
  }
  return box;
}
function frameAll(direction) {
  const box = sceneBounds(),
    center = box.getCenter(new THREE.Vector3()),
    size = box.getSize(new THREE.Vector3());
  const dir = direction
    ? new THREE.Vector3(...direction).normalize()
    : camera.position.clone().sub(orbit.target).normalize();
  const radius = size.length() / 2,
    distance =
      ((radius / Math.sin(rad(camera.fov / 2))) * 1.12) /
      Math.min(1, camera.aspect);
  orbit.target.copy(center);
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = 0.03;
  camera.far = 100;
  camera.updateProjectionMatrix();
  orbit.update();
}
const VIEWS = {
  f: [0, 0.06, 1],
  d: [1, 0.35, 1.8],
  s: [1, 0.05, 0],
  hi: [0.2, 1.8, 1],
  lo: [0.15, -0.28, 1],
};
function setCamera(view) {
  if (!VIEWS[view]) throw Error("Unknown camera view");
  frameAll(VIEWS[view]);
  document
    .querySelectorAll("[data-camera]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.camera === view)),
    );
  commit();
}
async function categoryRows(system, category) {
  const config = catalog.systems[system]?.categories[category];
  if (!config) throw Error("Unknown category");
  const path = config.index;
  if (!cache.has(path)) {
    const response = await fetch("../" + path);
    if (!response.ok) throw Error("Library unavailable");
    cache.set(path, await response.json());
  }
  return cache.get(path);
}
function renderCollections() {
  const previous = $("collection").value;
  $("collection").replaceChildren(
    ...Object.entries(catalog.systems).map(
      ([k, v]) => new Option(localName(v.name), k),
    ),
  );
  $("collection").value = previous || "solo";
  renderCategories();
}
function renderCategories() {
  const previous = $("category").value,
    system = catalog.systems[$("collection").value];
  $("category").replaceChildren(
    ...Object.entries(system.categories).map(
      ([k, v]) => new Option(localName(v.name), k),
    ),
  );
  if (system.categories[previous]) $("category").value = previous;
  else if (system.categories.stand) $("category").value = "stand";
}
async function loadLibrary() {
  const token = ++libraryRequest;
  try {
    const data = await categoryRows($("collection").value, $("category").value);
    if (token !== libraryRequest) return;
    rows = data;
    renderLibrary();
  } catch {
    if (token === libraryRequest) {
      $("poseList").textContent = t("fetchFailed");
      notify("fetchFailed", true);
    }
  }
}
function renderLibrary() {
  const system = $("collection").value,
    category = $("category").value,
    query = $("poseSearch").value.trim().toLowerCase();
  $("poseList").replaceChildren();
  let count = 0;
  for (const row of rows) {
    const stem = `${system}_${category}_${row.pose}`,
      preset = Boolean(PRESETS[stem]);
    if ($("onlyPresets").checked && !preset) continue;
    if (
      query &&
      !`${stem} ${Object.values(row.name).join(" ")}`
        .toLowerCase()
        .includes(query)
    )
      continue;
    count++;
    const button = document.createElement("button");
    button.className = "pose-tile";
    button.dataset.pose = stem;
    button.title = localName(row.name);
    button.setAttribute("aria-pressed", String(reference?.stem === stem));
    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = "";
    img.src = `../thumbs/${stem}_${row.views.includes("f") ? "f" : row.views[0]}.jpg`;
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = localName(row.name);
    button.append(img, name);
    if (preset) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = t("draftBadge");
      button.append(badge);
    }
    button.onclick = guarded(async () => {
      if (preset) await loadPreset(stem);
      else {
        await showReference(stem);
        commit();
        notify("referenceOnly");
      }
    });
    $("poseList").append(button);
  }
  $("poseCount").textContent = String(count);
  if (!count) {
    const empty = document.createElement("span");
    empty.className = "empty-list";
    empty.textContent = t("noResults");
    $("poseList").append(empty);
  }
}
async function showReference(stem, view) {
  const request = ++referenceRequest;
  const [system, category, pose, ...extra] = stem.split("_");
  if (extra.length) throw Error("Invalid pose");
  const entry = (await categoryRows(system, category)).find(
    (r) => r.pose === pose,
  );
  if (!entry) throw Error("Unknown pose");
  if (view && !entry.views.includes(view)) throw Error("Unavailable view");
  if (request !== referenceRequest) return { cancelled: true };
  reference = { stem, view: view || entry.views[0], entry };
  renderReference();
  renderLibrary();
  return { stem, view: reference.view, hasPreset: Boolean(PRESETS[stem]) };
}
function renderReference(forceOpen = false) {
  $("detectReference").disabled = !reference;
  const collapsed = Boolean(reference) && innerWidth <= 540 && !forceOpen;
  $("reference").hidden = !reference || collapsed;
  $("showReference").hidden = !collapsed;
  if (!reference) return;
  $("referenceImage").src = `../thumbs/${reference.stem}_${reference.view}.jpg`;
  $("referenceImage").alt = localName(reference.entry.name);
  $("referenceLink").href = `../img/${reference.stem}_${reference.view}.png`;
  $("referenceName").textContent = localName(reference.entry.name);
  $("referenceView").replaceChildren(
    ...reference.entry.views.map(
      (v) =>
        new Option(
          t({ f: "front", d: "diagonal", s: "side", hi: "high", lo: "low" }[v]),
          v,
        ),
    ),
  );
  $("referenceView").value = reference.view;
  $("referenceState").textContent = t(
    PRESETS[reference.stem] ? "approximation" : "referenceOnly",
  );
}
async function loadPreset(stem, { actorId = active, view } = {}) {
  const preset = PRESETS[stem];
  if (!preset) throw Error("No 3D preset for this reference");
  figure(actorId);
  // Validate/fetch the reference before mutating the figures.
  const shown = await showReference(stem, view || preset.view);
  if (shown.cancelled) return getState();
  if (preset.actors.length === 2 && figures.length === 1)
    makeFigure(preset.actors[1].sex);
  const targets = preset.actors.length === 2 ? figures : [figure(actorId)];
  preset.actors.forEach((p, i) => {
    const f = targets[i];
    applyValues(f.model, NEUTRAL);
    f.model.l_fingers.bend = f.model.r_fingers.bend = 10;
    constrainFingers(f.model);
    applyValues(f.model, p.values);
    if (p.position) f.model.position.fromArray(p.position);
    f.model.rotation.set(0, p.yaw || 0, 0);
    groundFigure(f.model);
  });
  active = actorId;
  moveMode = false;
  refresh();
  setCamera(view || preset.view);
  commit();
  notify("approximation");
  return getState();
}
function reset(options = {}) {
  const sex = options.sex || "female";
  if (!["female", "male"].includes(sex)) throw Error("Invalid body type");
  gizmo.detach();
  figures.forEach((f) => disposeFigure(f.model));
  figures = [];
  makeFigure(sex);
  active = "A";
  joint = "torso";
  referenceRequest++;
  reference = null;
  renderReference();
  $("floorLock").checked = true;
  moveMode = false;
  refresh();
  setCamera("d");
  commit();
  return getState();
}
async function capture({
  width = 1600,
  height = 1600,
  download: save = false,
  filename = "pose-atlas.png",
} = {}) {
  finite(width, 256, 4096, "width");
  finite(height, 256, 4096, "height");
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width * height > 16777216
  )
    throw Error("Invalid image size");
  if (capturing) throw Error("Capture in progress");
  capturing = true;
  $("exportPng").disabled = true;
  const size = renderer.getSize(new THREE.Vector2()),
    ratio = renderer.getPixelRatio(),
    aspect = camera.aspect,
    gridVisible = grid.visible,
    helperVisible = helper.visible;
  try {
    helper.visible = false;
    grid.visible = false;
    setHighlight(false);
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // Capture the freshly rendered GPU canvas in the same frame, before it can be cleared.
    const dataUrl = await new Promise((resolve, reject) =>
      requestAnimationFrame(() => {
        try {
          renderer.render(scene, camera);
          resolve(canvas.toDataURL("image/png"));
        } catch (e) {
          reject(e);
        }
      }),
    );
    if (save) {
      const blob = await (await fetch(dataUrl)).blob();
      download(blob, filename.replace(/[^a-zA-Z0-9._-]/g, "_"));
      notify("captured");
    }
    return { mimeType: "image/png", width, height, dataUrl };
  } finally {
    renderer.setPixelRatio(ratio);
    renderer.setSize(size.x, size.y, false);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    grid.visible = gridVisible;
    helper.visible = helperVisible;
    setHighlight();
    capturing = false;
    $("exportPng").disabled = false;
  }
}
async function getShareURL() {
  return shareURL(getState());
}
function scheduleURL() {
  if (!sharingReady) return;
  clearTimeout(urlTimer);
  const revision = ++urlRevision;
  urlTimer = setTimeout(async () => {
    try {
      const url = await getShareURL();
      if (revision === urlRevision) window.history.replaceState(null, "", url);
    } catch {
      notify("shareFailed", true);
    }
  }, 250);
}
async function openShare() {
  try {
    const url = await getShareURL();
    window.history.replaceState(null, "", url);
    $("shareUrl").value = url;
    $("shareDialog").showModal();
    $("shareUrl").select();
  } catch {
    notify("shareFailed", true);
  }
}
async function loadShareURL(url) {
  const encoded = sceneFragment(url);
  if (!encoded) throw Error("Missing scene state");
  restoreState(await decodeScene(encoded));
  commit();
  return getState();
}
function bindUI() {
  $("shareScene").onclick = openShare;
  $("closeShare").onclick = () => $("shareDialog").close();
  $("copyShare").onclick = async () => {
    try {
      await navigator.clipboard.writeText($("shareUrl").value);
      notify("linkCopied");
    } catch {
      $("shareUrl").select();
      notify("copyManually");
    }
  };
  $("shareDialog").addEventListener("click", (e) => {
    if (e.target === $("shareDialog")) $("shareDialog").close();
  });
  window.addEventListener("hashchange", async () => {
    if (!sharingReady) return;
    try {
      await loadShareURL(location.href);
    } catch {
      notify("invalidShare", true);
    }
  });
  $("addFemale").onclick = () => addFigure({ sex: "female" });
  $("addMale").onclick = () => addFigure({ sex: "male" });
  $("removeActor").onclick = () => removeFigure(active);
  $("sex").onchange = () => setFigure(active, { sex: $("sex").value });
  $("outfit").onchange = () => setFigure(active, { outfit: $("outfit").value });
  $("joint").onchange = () => {
    joint = $("joint").value;
    moveMode = false;
    refresh();
  };
  $("fingerCurl").oninput = () =>
    setHand(active, joint[0], Number($("fingerCurl").value), { record: false });
  $("fingerCurl").onchange = commit;
  $("resetJoint").onclick = () => {
    const values = Object.fromEntries(
      jointAxes(joint).map((a) => [
        a.property,
        NEUTRAL[`${joint}.${a.property}`] || 0,
      ]),
    );
    setJoint(active, joint, values);
  };
  $("neutral").onclick = () => neutralFigure(active);
  $("ground").onclick = () => {
    groundFigure(current().model);
    refreshValues();
    commit();
  };
  $("moveMode").onclick = () => {
    moveMode = !moveMode;
    attachGizmo();
  };
  $("canvasMove").onclick = () => {
    moveMode = true;
    attachGizmo();
  };
  $("canvasRotate").onclick = () => {
    moveMode = false;
    attachGizmo();
  };
  $("floorLock").onchange = () => {
    if ($("floorLock").checked) figures.forEach((f) => groundFigure(f.model));
    refreshValues();
    commit();
  };
  $("showGrid").onchange = () => {
    grid.visible = $("showGrid").checked;
    commit();
  };
  $("undo").onclick = undo;
  $("redo").onclick = redo;
  document.addEventListener("keydown", (e) => {
    if (
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) &&
      !document.querySelector("dialog[open]")
    ) {
      if (e.key.toLowerCase() === "w") {
        moveMode = true;
        attachGizmo();
      }
      if (e.key.toLowerCase() === "e") {
        moveMode = false;
        attachGizmo();
      }
    }
    if (
      (e.ctrlKey || e.metaKey) &&
      e.key.toLowerCase() === "z" &&
      !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)
    ) {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    }
  });
  document
    .querySelectorAll("[data-camera]")
    .forEach((b) => (b.onclick = () => setCamera(b.dataset.camera)));
  $("fitCamera").onclick = () => {
    frameAll();
    commit();
  };
  $("collection").onchange = () => {
    renderCategories();
    loadLibrary();
  };
  $("category").onchange = loadLibrary;
  $("poseSearch").oninput = renderLibrary;
  $("onlyPresets").onchange = renderLibrary;
  $("hideReference").onclick = () => {
    $("reference").hidden = true;
    $("showReference").hidden = false;
  };
  $("showReference").onclick = () => renderReference(true);
  $("referenceView").onchange = () => {
    reference.view = $("referenceView").value;
    renderReference();
    setCamera(reference.view);
  };
  $("language").onchange = () => {
    lang = $("language").value;
    try {
      localStorage.setItem("pose-language", lang);
    } catch {}
    const url = new URL(location);
    url.searchParams.set("lang", lang);
    window.history.replaceState(null, "", url);
    scheduleURL();
    translatePage();
    refresh();
    renderCollections();
    loadLibrary();
    renderReference();
  };
  $("exportPng").onclick = guarded(() =>
    capture({ width: 1600, height: 1600, download: true }),
  );
  $("saveScene").onclick = () => {
    download(
      new Blob([JSON.stringify(getState(), null, 2)], {
        type: "application/json",
      }),
      "pose-atlas-scene.json",
    );
    notify("saved");
  };
  $("importScene").onclick = () => $("sceneFile").click();
  $("sceneFile").onchange = async () => {
    const file = $("sceneFile").files[0];
    try {
      if (!file || file.size > 1024 * 1024) throw Error("Invalid scene");
      restoreState(JSON.parse(await file.text()));
      commit();
      notify("imported");
    } catch {
      notify("invalidScene", true);
    } finally {
      $("sceneFile").value = "";
    }
  };
  let down = null;
  canvas.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY, dragged: false };
  });
  canvas.addEventListener("pointerup", (e) => {
    if (
      !down ||
      down.dragged ||
      Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5
    )
      return;
    const rect = canvas.getBoundingClientRect(),
      p = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      ray = new THREE.Raycaster();
    ray.setFromCamera(p, camera);
    for (const f of figures)
      f.model.traverse((o) => {
        if (o.isSkinnedMesh && o.visible) {
          o.computeBoundingSphere();
          o.computeBoundingBox();
        }
      });
    const hit = ray
      .intersectObjects(
        figures.map((f) => f.model),
        true,
      )
      .find((h) => h.object.visible && h.object.userData.joint);
    if (hit) {
      const f = figures.find((f) => {
        let o = hit.object;
        while (o) {
          if (o === f.model) return true;
          o = o.parent;
        }
        return false;
      });
      active = f.id;
      joint = hit.object.userData.joint;
      if (hit.object.userData.suit && hit.face) {
        const weights = new Map(),
          geometry = hit.object.geometry;
        for (const index of [hit.face.a, hit.face.b, hit.face.c])
          for (let channel = 0; channel < 4; channel++) {
            const key = geometry.attributes.skinIndex.getComponent(
                index,
                channel,
              ),
              weight = geometry.attributes.skinWeight.getComponent(
                index,
                channel,
              );
            weights.set(key, (weights.get(key) || 0) + weight);
          }
        const key =
          hit.object.userData.jointKeys[
            [...weights].sort((a, b) => b[1] - a[1])[0][0]
          ];
        joint = key === "pelvis" ? "body" : key === "neck" ? "head" : key;
      }
      refresh();
    }
  });
  gizmo.addEventListener("dragging-changed", (e) => {
    if (e.value && moveMode && gizmo.axis?.includes("Y"))
      $("floorLock").checked = false;
    orbit.enabled = !e.value;
    if (down) down.dragged = true;
    if (!e.value) commit();
  });
  gizmo.addEventListener("objectChange", () => {
    if (!figures.length) return;
    const f = current();
    if (moveMode) {
      f.model.position.clampScalar(-10, 10);
      if ($("floorLock").checked) groundFigure(f.model);
    } else {
      constrainJoint(f.model, joint);
      if ($("floorLock").checked) groundFigure(f.model);
    }
    refreshValues();
  });
  orbit.addEventListener("end", () => {
    if (!capturing) commit();
  });
}
async function init() {
  translatePage();
  renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  await renderer.init();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  $("backend").dataset.backend = renderer.backend.isWebGPUBackend
    ? "webgpu"
    : "webgl2";
  translatePage();
  scene.background = new THREE.Color(0xe9edf3);
  scene.fog = new THREE.Fog(0xe9edf3, 12, 35);
  camera = new THREE.PerspectiveCamera(35, 1, 0.03, 100);
  camera.position.set(2, 1.6, 4);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x78869c, 1.6));
  const key = new THREE.DirectionalLight(0xfff9f0, 2.7);
  key.position.set(-3, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {
    left: -4,
    right: 4,
    top: 4,
    bottom: -4,
    near: 0.1,
    far: 18,
  });
  key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc4d5ff, 1.9);
  rim.position.set(4, 3, -4);
  scene.add(rim);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0xe9edf3, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR - 0.006;
  floor.receiveShadow = true;
  scene.add(floor);
  grid = new THREE.GridHelper(8, 40, 0xb7c0ce, 0xd5dce5);
  grid.position.y = FLOOR;
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  scene.add(grid);
  orbit = new OrbitControls(camera, canvas);
  orbit.target.set(0, 0.15, 0);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.1;
  orbit.minDistance = 0.6;
  orbit.maxDistance = 30;
  orbit.maxPolarAngle = Math.PI * 0.85;
  gizmo = new TransformControls(camera, canvas);
  gizmo.setSize(0.72);
  helper = gizmo.getHelper();
  scene.add(helper);
  const resize = () => {
    if (capturing) return;
    const { width, height } = canvas.parentElement.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (figures.length) frameAll();
    if (sharingReady) {
      persist();
      scheduleURL();
    }
    if (reference && innerWidth <= 540) {
      $("reference").hidden = true;
      $("showReference").hidden = false;
    }
  };
  new ResizeObserver(resize).observe(canvas.parentElement);
  resize();
  makeFigure();
  bindUI();
  refresh();
  frameAll(VIEWS.d);
  const response = await fetch("../data/catalog.json");
  if (!response.ok) throw Error("Could not load catalog");
  catalog = await response.json();
  renderCollections();
  await loadLibrary();
  let shared = false;
  const encoded = sceneFragment();
  if (encoded) {
    try {
      restoreState(await decodeScene(encoded));
      shared = true;
    } catch {
      notify("invalidShare", true);
    }
  }
  const saved = safeRead();
  if (saved && !shared) {
    try {
      restoreState(saved);
    } catch {
      /* Ignore incompatible browser cache. */
    }
  }
  const queryPose = params.get("pose");
  if (queryPose && !shared) {
    const match = queryPose.match(
      /^([a-z0-9-]+_[a-z0-9-]+_[a-z0-9-]+)_(f|d|s|hi|lo)$/,
    );
    if (match) {
      try {
        const [system, category] = match[1].split("_");
        $("collection").value = system;
        renderCategories();
        $("category").value = category;
        await loadLibrary();
        if (PRESETS[match[1]]) await loadPreset(match[1], { view: match[2] });
        else {
          await showReference(match[1], match[2]);
          notify("referenceOnly");
        }
      } catch {
        notify("fetchFailed", true);
      }
    }
  } else if (!saved && !shared) {
    setCamera("d");
  }
  sharingReady = true;
  photoUI = setupPosePhotoUI({
    t,
    applyDetectedPose,
    referenceURL: () =>
      reference ? `../img/${reference.stem}_${reference.view}.png` : null,
  });
  commit();
  renderer.setAnimationLoop(() => {
    if (!capturing && !document.hidden) {
      orbit.update();
      renderer.render(scene, camera);
    }
  });
  $("loading").hidden = true;
  document.body.dataset.ready = "true";
  return true;
}
const api = {
  version: 3,
  detectImage,
  applyDetectedPose,
  poseFromImage,
  getShareURL,
  loadShareURL,
  getJointLimits: jointAxes,
  ready: null,
  getState,
  getJoint,
  addFigure,
  removeFigure,
  selectFigure,
  setFigure,
  setJoint,
  setHand,
  neutral: neutralFigure,
  loadPreset,
  showReference,
  listPresets: () =>
    Object.entries(PRESETS).map(([id, p]) => ({
      id,
      figures: p.actors.length,
      view: p.view,
      status: "draft-needs-review",
    })),
  setCamera,
  frame: () => {
    frameAll();
    commit();
  },
  capture,
  exportScene: getState,
  importScene: (s) => {
    restoreState(s);
    commit();
    return getState();
  },
  reset,
  undo,
  redo,
};
window.poseStudio = Object.freeze(
  Object.assign(api, {
    ready: init().catch((e) => {
      $("loading").hidden = true;
      $("fatal").hidden = false;
      $("fatalMessage").textContent = `${t("rendererHelp")} (${e.message})`;
      console.error(e);
      throw e;
    }),
  }),
);
