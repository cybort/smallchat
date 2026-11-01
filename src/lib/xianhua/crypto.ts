import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { b64url, concat, equalBytes, unb64url, utf8 } from "./bytes";

export type Identity = {
  v: 1;
  name: string;
  edPub: string;
  edPriv: string;
};

export type PublicIdentity = {
  v: 1;
  name: string;
  edPub: string;
};

export type Profile = "talk" | "dense";

export type SessionKeys = {
  sessionId: Uint8Array;
  sendKey: Uint8Array;
  recvKey: Uint8Array;
  confirm: Uint8Array;
  topic: Uint8Array;
  token: Uint8Array;
  peerName: string;
  profile: Profile;
};

export function createIdentity(name: string): Identity {
  const k = ed25519.keygen();
  return { v: 1, name, edPub: b64url(k.publicKey), edPriv: b64url(k.secretKey) };
}

export function publicIdentity(id: Identity): PublicIdentity {
  return { v: 1, name: id.name, edPub: id.edPub };
}

function nonceFor(dir: number, counter: number): Uint8Array {
  const n = new Uint8Array(12);
  const v = new DataView(n.buffer);
  v.setUint32(0, dir);
  v.setUint32(4, Math.floor(counter / 2 ** 32));
  v.setUint32(8, counter >>> 0);
  return n;
}

export function seal(key: Uint8Array, dir: number, counter: number, plain: Uint8Array): Uint8Array {
  return chacha20poly1305(key, nonceFor(dir, counter)).encrypt(plain);
}

export function open(key: Uint8Array, dir: number, counter: number, boxed: Uint8Array): Uint8Array {
  return chacha20poly1305(key, nonceFor(dir, counter)).decrypt(boxed);
}

function mac(key: Uint8Array, msg: Uint8Array): Uint8Array {
  return hmac(sha256, key, msg);
}

const MAGIC = utf8("XH1");

function pack(...parts: Uint8Array[]): Uint8Array {
  return concat(parts);
}

export type HandshakeRole = "client" | "server";

export class Handshake {
  private ephPriv: Uint8Array<ArrayBufferLike> = new Uint8Array(32);
  private ephPub: Uint8Array<ArrayBufferLike> = new Uint8Array(32);
  private transcript: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  private msg1: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

  constructor(
    readonly role: HandshakeRole,
    readonly self: Identity,
    readonly peerEdPub: Uint8Array,
    readonly peerName: string,
    readonly profile: Profile,
    private readonly now: () => number,
    private readonly seen: Set<string>,
  ) {}

  private selfEdPub(): Uint8Array {
    return unb64url(this.self.edPub);
  }

  private selfEdPriv(): Uint8Array {
    return unb64url(this.self.edPriv);
  }

  clientHello(timeSec = Math.floor(this.now() / 1000)): Uint8Array {
    if (this.role !== "client") throw new Error("not client");
    const eph = x25519.keygen();
    this.ephPriv = eph.secretKey;
    this.ephPub = eph.publicKey;
    const nonce = new Uint8Array(16);
    crypto.getRandomValues(nonce);
    const time = new Uint8Array(4);
    new DataView(time.buffer).setUint32(0, timeSec);
    this.msg1 = pack(MAGIC, Uint8Array.of(0x01), this.ephPub, nonce, time);
    this.transcript = this.msg1;
    return this.msg1;
  }

  takeClientHello(msg: Uint8Array, timeSec = Math.floor(this.now() / 1000)): Uint8Array {
    if (this.role !== "server") throw new Error("not server");
    if (msg.length !== 3 + 1 + 32 + 16 + 4) throw new Error("bad hello");
    if (textOf(msg.subarray(0, 3)) !== "XH1" || msg[3] !== 0x01) throw new Error("bad hello magic");
    const nonce = b64url(msg.subarray(4 + 32, 4 + 32 + 16));
    if (this.seen.has(nonce)) throw new Error("replayed hello");
    this.seen.add(nonce);
    const stamp = new DataView(msg.buffer, msg.byteOffset + msg.length - 4, 4).getUint32(0);
    if (Math.abs(stamp - timeSec) > 600) throw new Error("hello time");
    this.msg1 = msg;
    this.transcript = msg;
    const eph = x25519.keygen();
    this.ephPriv = eph.secretKey;
    this.ephPub = eph.publicKey;
    const clientEph = msg.subarray(4, 36);
    const signed = pack(utf8("xianhua-server"), this.transcript, this.ephPub);
    const sig = ed25519.sign(signed, this.selfEdPriv());
    const out = pack(MAGIC, Uint8Array.of(0x02), this.ephPub, sig);
    this.transcript = pack(this.transcript, this.ephPub, sig);
    void clientEph;
    return out;
  }

  takeServerHello(msg: Uint8Array): { keys: SessionKeys; finish: Uint8Array } {
    if (this.role !== "client") throw new Error("not client");
    if (msg.length !== 3 + 1 + 32 + 64) throw new Error("bad reply");
    if (msg[3] !== 0x02) throw new Error("bad reply type");
    const serverEph = msg.subarray(4, 36);
    const sig = msg.subarray(36, 100);
    const signed = pack(utf8("xianhua-server"), this.transcript, serverEph);
    if (!ed25519.verify(sig, signed, this.peerEdPub)) throw new Error("server identity");
    this.transcript = pack(this.transcript, serverEph, sig);
    const dh = x25519.getSharedSecret(this.ephPriv, serverEph);
    const keys = derive(
      dh,
      this.ephPub,
      serverEph,
      this.selfEdPub(),
      this.peerEdPub,
      this.transcript,
      "client",
      this.peerName,
      this.profile,
    );
    const clientSigned = pack(utf8("xianhua-client"), this.transcript, Uint8Array.of(profileByte(this.profile)));
    const clientSig = ed25519.sign(clientSigned, this.selfEdPriv());
    const confirm = mac(keys.confirm, pack(utf8("xianhua-confirm-c"), this.transcript));
    const finish = pack(MAGIC, Uint8Array.of(0x03), clientSig, confirm, Uint8Array.of(profileByte(this.profile)));
    return { keys, finish };
  }

  takeClientFinish(msg: Uint8Array): SessionKeys {
    if (this.role !== "server") throw new Error("not server");
    if (msg.length !== 3 + 1 + 64 + 32 + 1) throw new Error("bad finish");
    if (msg[3] !== 0x03) throw new Error("bad finish type");
    const sig = msg.subarray(4, 68);
    const confirm = msg.subarray(68, 100);
    const got = msg[100] === 1 ? "talk" : msg[100] === 2 ? "dense" : null;
    if (got !== this.profile) throw new Error("profile");
    const signed = pack(utf8("xianhua-client"), this.transcript, Uint8Array.of(msg[100]));
    if (!ed25519.verify(sig, signed, this.peerEdPub)) throw new Error("client identity");
    const clientEph = this.msg1.subarray(4, 36);
    const dh = x25519.getSharedSecret(this.ephPriv, clientEph);
    const keys = derive(
      dh,
      clientEph,
      this.ephPub,
      this.peerEdPub,
      this.selfEdPub(),
      this.transcript,
      "server",
      this.peerName,
      this.profile,
    );
    const expect = mac(keys.confirm, pack(utf8("xianhua-confirm-c"), this.transcript));
    if (!equalBytes(expect, confirm)) throw new Error("confirm");
    return keys;
  }
}

function derive(
  dh: Uint8Array,
  clientEph: Uint8Array,
  serverEph: Uint8Array,
  clientEd: Uint8Array,
  serverEd: Uint8Array,
  transcript: Uint8Array,
  role: HandshakeRole,
  peerName: string,
  profile: Profile,
): SessionKeys {
  const salt = sha256(pack(clientEph, serverEph, clientEd, serverEd, sha256(transcript)));
  const okm = hkdf(sha256, dh, salt, utf8("xianhua-v1"), 128);
  const sessionId = hkdf(sha256, dh, salt, utf8("xianhua-sid"), 16);
  const c2s = okm.subarray(0, 32);
  const s2c = okm.subarray(32, 64);
  const confirm = okm.subarray(64, 96);
  const topic = okm.subarray(96, 128);
  const token = mac(confirm, utf8("xianhua-token")).subarray(0, 4);
  return {
    sessionId,
    sendKey: role === "client" ? c2s : s2c,
    recvKey: role === "client" ? s2c : c2s,
    confirm,
    topic,
    token,
    peerName,
    profile,
  };
}

function profileByte(profile: Profile): number {
  return profile === "talk" ? 1 : 2;
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/** Cover schedule shared by a pair. An on-path observer without the long-term public keys cannot strip it. */
export function pairCover(a: Uint8Array, b: Uint8Array, domain: string): Uint8Array {
  const swap = compareBytes(a, b) > 0;
  return hkdf(sha256, pack(swap ? b : a, swap ? a : b), utf8("xianhua-cover"), utf8(domain), 32);
}

function textOf(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

export function dataPreamble(keys: SessionKeys, profile: "talk" | "dense"): Uint8Array {
  const profileByte = Uint8Array.of(profile === "talk" ? 1 : 2);
  const tag = mac(keys.confirm, pack(utf8("xianhua-data"), profileByte, keys.sessionId));
  const plain = pack(profileByte, keys.sessionId, tag);
  const boxed = seal(keys.sendKey, 0, 1, plain);
  const len = new Uint8Array(2);
  new DataView(len.buffer).setUint16(0, boxed.length);
  return pack(keys.token, len, boxed);
}

export function readPreamble(
  keys: SessionKeys,
  blob: Uint8Array,
): { profile: "talk" | "dense" } {
  if (blob.length < 4 + 2) throw new Error("short preamble");
  if (!equalBytes(blob.subarray(0, 4), keys.token)) throw new Error("token");
  const len = new DataView(blob.buffer, blob.byteOffset + 4, 2).getUint16(0);
  const boxed = blob.subarray(6, 6 + len);
  if (boxed.length !== len) throw new Error("preamble length");
  const plain = open(keys.recvKey, 0, 1, boxed);
  if (plain.length !== 1 + 16 + 32) throw new Error("preamble plain");
  const profileByte = plain[0];
  if (profileByte !== 1 && profileByte !== 2) throw new Error("profile");
  if (!equalBytes(plain.subarray(1, 17), keys.sessionId)) throw new Error("session");
  const tag = plain.subarray(17);
  const expect = mac(
    keys.confirm,
    pack(utf8("xianhua-data"), Uint8Array.of(profileByte), keys.sessionId),
  );
  if (!equalBytes(expect, tag)) throw new Error("preamble mac");
  return { profile: profileByte === 1 ? "talk" : "dense" };
}

export function sessionAck(keys: SessionKeys): Uint8Array {
  return mac(keys.confirm, utf8("xianhua-ack"));
}

export function topicSeed(keys: SessionKeys, dir: "c2s" | "s2c"): Uint8Array {
  return hmac(sha256, keys.topic, utf8(dir));
}
