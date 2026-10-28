// SPDX-License-Identifier: GPL-3.0-only
// Reflect joint rotations across the figure's sagittal plane. Editor angle
// conventions already account for left/right except the wrist's tilt axis.
const PAIRED = /^(l|r)_(arm|elbow|wrist|leg|knee|ankle)$/;

export function mirrorJoint(key, values) {
  const match = PAIRED.exec(key);
  if (!match) return null;
  const other = `${match[1] === "l" ? "r" : "l"}_${match[2]}`;
  return {
    key: other,
    values: Object.fromEntries(
      Object.entries(values).map(([property, value]) => [
        property,
        match[2] === "wrist" && property === "tilt" ? -value : value,
      ]),
    ),
  };
}
