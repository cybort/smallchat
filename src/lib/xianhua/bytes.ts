export function concat(parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function text(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

export function b64url(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function unb64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export function hex(b: Uint8Array): string {
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function readUint(b: Uint8Array): number {
  let n = 0;
  for (const x of b) n = n * 256 + x;
  return n;
}

export function writeUint(n: number, width: number): Uint8Array {
  const out = new Uint8Array(width);
  let x = n;
  for (let i = width - 1; i >= 0; i--) {
    out[i] = x % 256;
    x = Math.floor(x / 256);
  }
  return out;
}
