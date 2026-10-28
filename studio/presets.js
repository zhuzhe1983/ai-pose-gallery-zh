// SPDX-License-Identifier: GPL-3.0-only
// Hand-authored starting poses. These are approximations, not reconstructed 3D scans.
const both = (part, values) =>
  Object.fromEntries(
    ["l", "r"].flatMap((side) =>
      Object.entries(values).map(([key, value]) => [
        `${side}_${part}.${key}`,
        value,
      ]),
    ),
  );
const sit = {
  ...both("leg", { raise: 90, straddle: 10 }),
  ...both("knee", { bend: 75 }),
  ...both("ankle", { bend: 0 }),
};
const kneel = {
  ...both("leg", { raise: 12, straddle: 8 }),
  ...both("knee", { bend: 145 }),
  ...both("ankle", { bend: 45 }),
};
const wSit = {
  ...both("leg", { raise: 90, straddle: 12, turn: -80 }),
  ...both("knee", { bend: 145 }),
  ...both("ankle", { bend: 25 }),
  "torso.bend": 16,
};
const handHip = {
  "l_arm.raise": 6,
  "l_arm.straddle": 38,
  "l_arm.turn": -84,
  "l_elbow.bend": 72,
  "l_wrist.bend": -15,
};
const headHands = {
  ...both("arm", { raise: 72, straddle: 35, turn: -26 }),
  ...both("elbow", { bend: 147 }),
};
const one = (values, hands) => [
  { sex: "female", values, ...(hands ? { hands } : {}) },
];

export const PRESETS = {
  "solo_stand_contrapposto-hip": {
    actors: one({
      ...handHip,
      "body.tilt": 5,
      "torso.tilt": -5,
      "l_leg.straddle": 6,
      "r_leg.straddle": 12,
      "r_knee.bend": 14,
    }),
    view: "d",
  },
  "solo_stand_hands-hips": {
    actors: one({
      ...handHip,
      "r_arm.raise": 6,
      "r_arm.straddle": 38,
      "r_arm.turn": -84,
      "r_elbow.bend": 72,
      "r_wrist.bend": -15,
    }),
    view: "f",
  },
  "solo_stand_arms-up-stretch": {
    actors: one(
      {
        ...both("arm", { raise: 178, straddle: 5, turn: 0 }),
        ...both("elbow", { bend: 2 }),
        ...both("leg", { straddle: 3 }),
      },
      { l: 0, r: 0 },
    ),
    view: "f",
  },
  "solo_stand_look-bk": {
    actors: one({
      "torso.turn": 30,
      "neck.turn": 32.5,
      "head.turn": 32.5,
      "body.turn": -130,
    }),
    view: "d",
  },
  "solo_stand_hands-hair": {
    actors: one({ ...headHands, "neck.tilt": 6, "head.tilt": 6 }),
    view: "f",
  },
  "solo_sit_lean-bk-kn-up": {
    actors: one({
      ...sit,
      "body.bend": -15,
      "l_leg.raise": 118,
      "l_knee.bend": 115,
      "r_leg.raise": 108,
      "r_knee.bend": 30,
      "l_arm.raise": 30,
      "l_elbow.bend": 85,
      "r_arm.raise": -25,
      "r_arm.straddle": 18,
      "r_elbow.bend": 8,
      "r_wrist.bend": -65,
    }),
    view: "d",
  },
  "solo_sit_hands-bk-chest-up": {
    actors: one({
      ...sit,
      "body.bend": -18,
      ...both("leg", { raise: 110 }),
      ...both("knee", { bend: 40 }),
      ...both("arm", { raise: -25, straddle: 16 }),
      ...both("elbow", { bend: 5 }),
      ...both("wrist", { bend: -70 }),
    }),
    view: "f",
  },
  "solo_sit_kn-up-chin": {
    actors: one({
      ...sit,
      "l_leg.raise": 125,
      "l_knee.bend": 125,
      "r_knee.bend": 35,
      "l_arm.raise": 45,
      "l_elbow.bend": 130,
      "l_wrist.bend": 20,
      "neck.nod": 6,
      "head.nod": 6,
    }),
    view: "d",
  },
  "solo_sit_kn-up-hands-hd": {
    actors: one({
      ...sit,
      ...headHands,
      "l_leg.raise": 120,
      "l_knee.bend": 125,
      "r_knee.bend": 30,
    }),
    view: "f",
  },
  "solo_kneel_hands-thighs": {
    actors: one(
      {
        // Shared front/side draft, refined against real skinned contact samples.
        // Palm-facing, knee/shin/toe support; still not an approved reconstruction.
        ...both("leg", { raise: 18, straddle: 8, turn: -35 }),
        ...both("knee", { bend: 98.27 }),
        ...both("ankle", { bend: -44.92, tilt: -24.31, turn: 28.28 }),
        ...both("arm", { raise: 5.45, straddle: 4.34, turn: -52.12 }),
        ...both("elbow", { bend: 29.52 }),
        ...both("wrist", { bend: 4.8, turn: -38.21 }),
        "l_wrist.tilt": 26.56,
        "r_wrist.tilt": -26.56,
      },
      { l: 0, r: 0 },
    ),
    view: "d",
  },
  "solo_kneel_arms-up": {
    actors: one({
      ...kneel,
      ...both("arm", { raise: 170, straddle: 15 }),
      ...both("elbow", { bend: 8 }),
    }),
    view: "f",
  },
  "solo_kneel_one-kn-hand-kn": {
    actors: one({
      ...kneel,
      "l_leg.raise": 90,
      "l_knee.bend": 90,
      "l_arm.raise": 36,
      "l_elbow.bend": 40,
      "r_arm.raise": 8,
    }),
    view: "d",
  },
  "solo_squat_hands-kns": {
    actors: one({
      ...both("leg", { raise: 130, straddle: 24 }),
      ...both("knee", { bend: 150 }),
      ...both("ankle", { bend: -20 }),
      "body.bend": 18,
      ...both("arm", { raise: 45, straddle: 20 }),
      ...both("elbow", { bend: 35 }),
    }),
    view: "d",
  },
  "solo_lie_supine-arms-up": {
    actors: one({
      "body.bend": -90,
      ...both("arm", { raise: 175, straddle: 8 }),
      ...both("leg", { straddle: 5 }),
      ...both("elbow", { bend: 10 }),
    }),
    view: "hi",
  },
  "solo_lie_side-chin": {
    actors: one({
      "body.tilt": 90,
      "l_leg.raise": 20,
      "l_knee.bend": 30,
      "r_leg.raise": 5,
      "r_knee.bend": 10,
      "l_arm.raise": 85,
      "l_arm.straddle": 45,
      "l_elbow.bend": 115,
      "r_arm.raise": 20,
      "neck.tilt": -7.5,
      "head.tilt": -7.5,
    }),
    view: "d",
  },
  "solo_lie_prone-arm-pillow": {
    actors: one({
      "body.bend": 90,
      ...both("arm", { raise: 150, straddle: 35 }),
      ...both("elbow", { bend: 120 }),
      ...both("leg", { straddle: 8 }),
      "neck.turn": 17.5,
      "head.turn": 17.5,
    }),
    view: "hi",
  },
  "solo_bend_hands-kns": {
    actors: one({
      "body.bend": 40,
      "torso.bend": 10,
      ...both("arm", { raise: 8, straddle: 8 }),
      ...both("elbow", { bend: 12 }),
      ...both("knee", { bend: 12 }),
      ...both("leg", { raise: 4, straddle: 12 }),
      "neck.nod": -7.5,
      "head.nod": -7.5,
    }),
    view: "d",
  },
  "solo_twist_stand-arms-out": {
    actors: one({
      "torso.turn": 38,
      ...both("arm", { straddle: 85 }),
      ...both("elbow", { bend: 12 }),
      "neck.turn": 10,
      "head.turn": 10,
    }),
    view: "d",
  },
  "solo_side-sit_w-sit-hands-fw": {
    actors: one({
      ...wSit,
      ...both("arm", { raise: 35, straddle: -4 }),
      ...both("elbow", { bend: 8 }),
      ...both("wrist", { bend: -70 }),
    }),
    view: "hi",
  },
  "sexy_sit_w-sit-hands-fw": {
    actors: one({
      ...wSit,
      "body.bend": 10,
      ...both("arm", { raise: 30, straddle: -7 }),
      ...both("elbow", { bend: 8 }),
      ...both("wrist", { bend: -70 }),
      "neck.tilt": 4,
      "head.tilt": 4,
      "neck.nod": -6,
      "head.nod": -6,
    }),
    view: "hi",
  },
  upper_cute_salute: {
    actors: one({
      "r_arm.raise": 68,
      "r_arm.straddle": 30,
      "r_arm.turn": -29,
      "r_elbow.bend": 134,
      "r_wrist.bend": 10,
      "neck.tilt": 2.5,
      "head.tilt": 2.5,
    }),
    view: "f",
  },
  "upper_cute_heart-over-hd": {
    actors: one(
      {
        ...both("arm", { raise: 180, straddle: 30, turn: -90 }),
        ...both("elbow", { bend: 70 }),
        ...both("wrist", { bend: 25, tilt: 0, turn: 90 }),
      },
      { l: 0, r: 0 },
    ),
    view: "f",
  },
  "upper_cute_palms-together": {
    actors: one({
      ...both("arm", { raise: 20, straddle: 15, turn: -65 }),
      ...both("elbow", { bend: 120 }),
      ...both("wrist", { bend: 15 }),
    }),
    view: "f",
  },
  "duo_stand-close_whisper-cheek": {
    actors: [
      {
        sex: "female",
        position: [-0.26, 0, 0],
        yaw: -0.2,
        values: {
          "neck.turn": -12.5,
          "head.turn": -12.5,
          "neck.tilt": -3,
          "head.tilt": -3,
          "r_arm.raise": 35,
          "r_elbow.bend": 45,
        },
      },
      {
        sex: "male",
        position: [0.32, 0, -0.08],
        yaw: -0.7,
        values: {
          "body.bend": 12,
          "neck.turn": -15,
          "head.turn": -15,
          "neck.nod": 6,
          "head.nod": 6,
          "l_arm.raise": 50,
          "l_arm.straddle": 10,
          "l_elbow.bend": 100,
        },
      },
    ],
    view: "d",
  },
};

export const NEUTRAL = {
  "body.bend": 0,
  "body.tilt": 0,
  "body.turn": -90,
  ...Object.fromEntries(
    ["pelvis", "waist", "chest"].flatMap((k) =>
      ["bend", "tilt", "turn"].map((p) => [`${k}.${p}`, 0]),
    ),
  ),
  "neck.nod": 0,
  "neck.tilt": 0,
  "neck.turn": 0,
  "head.nod": 0,
  "head.tilt": 0,
  "head.turn": 0,
  ...both("leg", { raise: 0, straddle: 6, turn: 0 }),
  ...both("knee", { bend: 0 }),
  ...both("ankle", { bend: 0, turn: 0, tilt: 0 }),
  ...both("arm", { raise: 0, straddle: 8, turn: 0 }),
  ...both("elbow", { bend: 8 }),
  ...both("wrist", { bend: 0, turn: 0, tilt: 0 }),
};

export const JOINTS = [
  "body",
  "pelvis",
  "waist",
  "chest",
  "neck",
  "head",
  "l_arm",
  "l_elbow",
  "l_wrist",
  "r_arm",
  "r_elbow",
  "r_wrist",
  "l_leg",
  "l_knee",
  "l_ankle",
  "r_leg",
  "r_knee",
  "r_ankle",
];
const axes = (labels, ranges) =>
  labels.map((property, i) => ({
    property,
    min: ranges[i][0],
    max: ranges[i][1],
  }));
export function jointAxes(key) {
  if (key === "body")
    return axes(
      ["bend", "tilt", "turn"],
      [
        [-180, 180],
        [-180, 180],
        [-180, 180],
      ],
    );
  if (key === "torso")
    return axes(
      ["bend", "tilt", "turn"],
      [
        [-35, 65],
        [-30, 30],
        [-60, 60],
      ],
    );
  if (["pelvis", "waist", "chest"].includes(key))
    return axes(
      ["bend", "tilt", "turn"],
      {
        pelvis: [
          [-30, 30],
          [-20, 20],
          [-45, 45],
        ],
        waist: [
          [-25, 40],
          [-20, 20],
          [-25, 25],
        ],
        chest: [
          [-20, 30],
          [-20, 20],
          [-40, 40],
        ],
      }[key],
    );
  if (key === "neck" || key === "head")
    return axes(
      ["nod", "tilt", "turn"],
      key === "neck"
        ? [
            [-35, 45],
            [-25, 25],
            [-45, 45],
          ]
        : [
            [-30, 35],
            [-20, 20],
            [-40, 40],
          ],
    );
  if (key.endsWith("_arm"))
    return axes(
      ["raise", "straddle", "turn"],
      [
        [-60, 180],
        [-15, 90],
        [-90, 90],
      ],
    );
  if (key.endsWith("_leg"))
    return axes(
      ["raise", "straddle", "turn"],
      [
        [-30, 145],
        [-15, 70],
        [-80, 80],
      ],
    );
  if (key.endsWith("_knee") || key.endsWith("_elbow"))
    return axes(["bend"], [[0, 150]]);
  return key.endsWith("_ankle")
    ? axes(
        ["bend", "tilt", "turn"],
        [
          [-45, 60],
          [-25, 25],
          [-35, 35],
        ],
      )
    : axes(
        ["bend", "tilt", "turn"],
        [
          [-80, 80],
          [-30, 30],
          [-90, 90],
        ],
      );
}

// Stable Euler conventions: changing one slider preserves the other two angles.
// Upstream getters reorder rotations per access, which is unsuitable for a multi-axis inspector.
function convention(key) {
  const side = key.startsWith("l_") ? -1 : 1;
  if (key === "neck" || key === "head")
    return {
      order: "YXZ",
      axes: { nod: ["z", -1], tilt: ["x", -1], turn: ["y", 1] },
    };
  if (key === "waist")
    return {
      order: "YXZ",
      axes: { bend: ["z", -2], tilt: ["x", -2], turn: ["y", 2] },
    };
  if (["body", "torso", "pelvis", "chest"].includes(key))
    return {
      order: "YXZ",
      axes: { bend: ["z", -1], tilt: ["x", -1], turn: ["y", 1] },
    };
  if (key.endsWith("_arm") || key.endsWith("_leg"))
    return {
      order: "ZXY",
      axes: { raise: ["z", 1], straddle: ["x", -side], turn: ["y", -side] },
    };
  if (key.endsWith("_elbow") || key.endsWith("_knee"))
    return { order: "XYZ", axes: { bend: ["z", 1] } };
  if (key.endsWith("_wrist"))
    return {
      order: "YXZ",
      axes: { bend: ["x", -side], tilt: ["z", side], turn: ["y", side] },
    };
  return {
    order: "YXZ",
    axes: { bend: ["z", -1], tilt: ["x", side], turn: ["y", side] },
  };
}
export function readAngles(model, key) {
  if (key === "torso") {
    const a = readAngles(model, "waist"),
      b = readAngles(model, "chest");
    return Object.fromEntries(Object.keys(a).map((p) => [p, a[p] + b[p]]));
  }
  const c = convention(key),
    r = model[key].rotation;
  if (r.order !== c.order) r.reorder(c.order);
  return Object.fromEntries(
    Object.entries(c.axes).map(([p, [axis, factor]]) => [
      p,
      ((r[axis] * 180) / Math.PI) * factor,
    ]),
  );
}
export function writeAngles(model, key, values) {
  if (key === "torso") {
    // Legacy angle API: distribute bending, side bend and twist separately.
    const weights = { bend: 0.6, tilt: 0.5, turn: 0.35 };
    for (const [p, value] of Object.entries(values)) {
      if (!Number.isFinite(value) || !(p in weights))
        throw Error("Invalid joint angle");
      writeAngles(model, "waist", { [p]: value * weights[p] });
      writeAngles(model, "chest", { [p]: value * (1 - weights[p]) });
    }
    return;
  }
  const c = convention(key),
    r = model[key].rotation;
  if (r.order !== c.order) r.reorder(c.order);
  for (const [p, value] of Object.entries(values)) {
    const [axis, factor] = c.axes[p];
    if (!Number.isFinite(value)) throw new Error("Invalid joint angle");
    const limit = jointAxes(key).find((a) => a.property === p);
    r[axis] =
      (Math.max(limit.min, Math.min(limit.max, value)) * Math.PI) /
      180 /
      factor;
  }
  if (key === "waist") model.waist_mid.quaternion.copy(model.waist.quaternion);
}
export function applyValues(model, values) {
  const grouped = {};
  for (const [path, value] of Object.entries(values)) {
    const [joint, property] = path.split(".");
    if ((!model[joint] && joint !== "torso") || !Number.isFinite(value))
      throw new Error(`Invalid preset parameter: ${path}`);
    (grouped[joint] ??= {})[property] = value;
  }
  for (const [key, angles] of Object.entries(grouped))
    writeAngles(model, key, angles);
}

// Shared by the gizmo, imports, presets and API. Root body orientation is free;
// individual anatomical joints obey the same documented artistic limits.
export function constrainJoint(model, key) {
  const values = readAngles(model, key);
  if (key.endsWith("_knee") || key.endsWith("_elbow"))
    model[key].rotation.set(0, 0, 0, "XYZ");
  writeAngles(model, key, values);
}
export function constrainFingers(model) {
  // The public hand control is one curl per hand. Canonical fixed-order thumb
  // rotations avoid Euler ambiguity at ±90° during URL/JSON round-trips.
  for (const side of ["l", "r"]) {
    const curl = Math.max(0, Math.min(100, model[`${side}_fingers`].bend));
    const sign = side === "l" ? -1 : 1;
    for (let i = 0; i < 5; i++) {
      const root = model[`${side}_finger_${i}`],
        bend = ((i === 0 ? curl / 2 : curl) * Math.PI) / 180;
      if (i === 0)
        root.rotation.set(
          (sign * 20 * Math.PI) / 180,
          (-sign * Math.PI) / 2,
          Math.min((45 * Math.PI) / 180, bend),
          "YXZ",
        );
      else root.rotation.set(0, 0, bend, "XYZ");
      root.mid.rotation.set(0, 0, bend, "XYZ");
      root.tip.rotation.set(0, 0, bend, "XYZ");
    }
  }
}
export function constrainFigure(model) {
  for (const key of JOINTS) constrainJoint(model, key);
  constrainFingers(model);
}
