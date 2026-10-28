// SPDX-License-Identifier: GPL-3.0-only
// Scene state stays in the URL fragment; it is not sent to the hosting server.
const MAX_COMPRESSED = 60000,
  MAX_DECODED = 200000;
async function collect(stream, limit) {
  const reader = stream.getReader(),
    chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw Error("Scene URL is too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
export async function encodeScene(scene) {
  const json = JSON.stringify(scene, (_key, v) =>
    typeof v === "number" ? Math.round(v * 100000) / 100000 : v,
  );
  if (json.length > MAX_DECODED) throw Error("Scene is too large");
  const bytes = await collect(
    new Blob([json]).stream().pipeThrough(new CompressionStream("gzip")),
    MAX_COMPRESSED,
  );
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return (
    "2." +
    btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
  );
}
export async function decodeScene(encoded) {
  if (
    typeof encoded !== "string" ||
    encoded.length > MAX_COMPRESSED * 1.4 ||
    !/^2\.[A-Za-z0-9_-]+$/.test(encoded)
  )
    throw Error("Invalid scene URL");
  const binary = atob(
    encoded.slice(2).replaceAll("-", "+").replaceAll("_", "/"),
  );
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const json = await collect(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
    MAX_DECODED,
  );
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(json));
}
export function sceneFragment(url = location.href) {
  return new URLSearchParams(new URL(url).hash.slice(1)).get("s");
}
export async function shareURL(scene, href = location.href) {
  const url = new URL(href);
  url.searchParams.delete("pose");
  url.hash = new URLSearchParams({ s: await encodeScene(scene) }).toString();
  return url.href;
}
