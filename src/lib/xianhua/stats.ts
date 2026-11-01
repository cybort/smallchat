export type WireStats = {
  shannon: number;
  serial: number;
  chiSquare: number;
  gzipRatio: number;
  cjkRatio: number;
  chars: number;
};

export function shannon(d: Uint8Array): number {
  if (d.length === 0) return 0;
  const f = new Array<number>(256).fill(0);
  for (const b of d) f[b]++;
  let h = 0;
  for (const c of f) {
    if (!c) continue;
    const p = c / d.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Adjacent-byte correlation. Ciphertext sits near 0; prose does not. */
export function serialCorrelation(d: Uint8Array): number {
  const n = d.length;
  if (n < 3) return 0;
  let sum = 0;
  for (const x of d) sum += x;
  const mean = sum / n;
  let varSum = 0;
  let prod = 0;
  for (let i = 0; i < n; i++) {
    const x = d[i] - mean;
    const y = d[(i + 1) % n] - mean;
    varSum += x * x;
    prod += x * y;
  }
  if (varSum === 0) return 0;
  return prod / varSum;
}

/** Pearson chi-square against a uniform byte. Larger means less like ciphertext. */
export function chiSquareUniform(d: Uint8Array): number {
  if (d.length === 0) return 0;
  const f = new Array<number>(256).fill(0);
  for (const b of d) f[b]++;
  const expected = d.length / 256;
  let chi = 0;
  for (const c of f) {
    const diff = c - expected;
    chi += (diff * diff) / expected;
  }
  return chi;
}

export function cjkRatio(s: string): number {
  if (!s.length) return 0;
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x4e00 && c <= 0x9fff) n++;
  }
  return n / [...s].length;
}

export async function gzipRatio(d: Uint8Array): Promise<number> {
  if (d.length === 0) return 0;
  const cs = new CompressionStream("gzip");
  const stream = new Blob([Uint8Array.from(d)]).stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return buf.byteLength / d.length;
}

export async function measure(bytes: Uint8Array, asText: string): Promise<WireStats> {
  return {
    shannon: shannon(bytes),
    serial: serialCorrelation(bytes),
    chiSquare: chiSquareUniform(bytes),
    gzipRatio: await gzipRatio(bytes),
    cjkRatio: cjkRatio(asText),
    chars: [...asText].length,
  };
}
