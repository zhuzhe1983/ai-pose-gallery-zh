// Pure-static URL fragment (#f=...) compression for FitRoom Fitting Room state.
const MAX_COMPRESSED = 60000;
const MAX_DECODED = 240000;

async function collect(stream, limit) {
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw Error('Share payload exceeds URL budget');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export async function encodeFittingState(state) {
  const json = JSON.stringify(state, (_key, v) =>
    typeof v === 'number' ? Math.round(v * 10000) / 10000 : v,
  );
  if (json.length > MAX_DECODED) throw Error('Fitting state too large');
  const bytes = await collect(
    new Blob([json]).stream().pipeThrough(new CompressionStream('gzip')),
    MAX_COMPRESSED,
  );
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return '1.' + btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function decodeFittingState(encoded) {
  if (
    typeof encoded !== 'string' ||
    encoded.length > MAX_COMPRESSED * 1.4 ||
    !/^1\.[A-Za-z0-9_-]+$/.test(encoded)
  ) {
    throw Error('Invalid fitting share link');
  }
  const b64 = encoded.slice(2).replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const json = await collect(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),
    MAX_DECODED,
  );
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json));
}

export function readFittingHash(href = location.href) {
  const hash = new URL(href).hash.slice(1);
  if (!hash) return { f: null, s: null };
  const params = new URLSearchParams(hash);
  return { f: params.get('f'), s: params.get('s') };
}

export async function buildFittingShareURL(state, href = location.href) {
  const url = new URL(href);
  const encoded = await encodeFittingState(state);
  url.hash = new URLSearchParams({ f: encoded }).toString();
  return { url: url.href, bytes: url.href.length };
}
