import { equalBytes, text, unb64url, utf8 } from "./bytes";
import { Codec, PhrasePipe, type LineMeta } from "./codec";
import {
  Handshake,
  dataPreamble,
  open,
  pairCover,
  readPreamble,
  seal,
  sessionAck,
  topicSeed,
  type Identity,
  type Profile,
  type SessionKeys,
} from "./crypto";

import type { Surface } from "./surface";

export type { Profile } from "./crypto";
export { pairCover } from "./crypto";

export type WireLine = {
  channel: "control" | "data";
  from: "client" | "server";
  text: string;
  label: string;
  phase: string;
  focus: string;
  hint: string;
  fact: string;
};

export type LineSocket = {
  send(line: string): void;
  onLine(cb: (line: string) => void): void;
  close(): void;
};

export function memoryPair(): [LineSocket, LineSocket] {
  let leftHandler: ((line: string) => void) | null = null;
  let rightHandler: ((line: string) => void) | null = null;
  const toLeft: string[] = [];
  const toRight: string[] = [];
  let closed = false;
  const left: LineSocket = {
    send(line) {
      if (closed) return;
      if (rightHandler) rightHandler(line);
      else toRight.push(line);
    },
    onLine(cb) {
      leftHandler = cb;
      for (const line of toLeft.splice(0)) cb(line);
    },
    close() {
      closed = true;
    },
  };
  const right: LineSocket = {
    send(line) {
      if (closed) return;
      if (leftHandler) leftHandler(line);
      else toLeft.push(line);
    },
    onLine(cb) {
      rightHandler = cb;
      for (const line of toRight.splice(0)) cb(line);
    },
    close() {
      closed = true;
    },
  };
  return [left, right];
}

class Inbox {
  private queue: Uint8Array[] = [];
  private waiter: ((frame: Uint8Array) => void) | null = null;
  private failed: Error | null = null;

  fail(err: Error): void {
    if (this.failed) return;
    this.failed = err;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(utf8(""));
    }
  }

  push(frame: Uint8Array): void {
    if (this.failed) return;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(frame);
    } else this.queue.push(frame);
  }

  recv(): Promise<Uint8Array> {
    if (this.failed && this.queue.length === 0) return Promise.reject(this.failed);
    const first = this.queue.shift();
    if (first) return Promise.resolve(first);
    if (this.failed) return Promise.reject(this.failed);
    return new Promise((resolve, reject) => {
      this.waiter = (frame) => {
        if (this.failed && frame.length === 0) reject(this.failed);
        else resolve(frame);
      };
    });
  }
}

export async function handshakeOn(
  socket: LineSocket,
  hs: Handshake,
  cover: Uint8Array,
  log?: (line: string, meta: LineMeta) => void,
  onServerReady?: (keys: SessionKeys) => void,
  surface?: Surface,
): Promise<SessionKeys> {
  const opened = surface?.open(hs.role, cover, cover);
  const pipe = opened
    ? new PhrasePipe(opened.enc, opened.dec)
    : new PhrasePipe(new Codec("talk", cover), new Codec("talk", cover));
  const inbox = new Inbox();
  socket.onLine((line) => {
    if (!line) return;
    try {
      for (const frame of pipe.pushLine(line)) inbox.push(frame);
    } catch (err) {
      inbox.fail(err instanceof Error ? err : new Error("decode"));
    }
  });
  const recv = () => inbox.recv();
  const send = (payload: Uint8Array) => {
    for (const item of pipe.encode(payload)) {
      log?.(item.line, item.meta);
      socket.send(item.line);
    }
  };
  if (hs.role === "client") {
    send(hs.clientHello());
    const reply = await recv();
    const done = hs.takeServerHello(reply);
    send(done.finish);
    const ack = await recv();
    if (!equalBytes(ack, sessionAck(done.keys))) throw new Error("ack");
    return done.keys;
  }
  const hello = await recv();
  send(hs.takeClientHello(hello));
  const finish = await recv();
  const keys = hs.takeClientFinish(finish);
  onServerReady?.(keys);
  send(sessionAck(keys));
  return keys;
}

const TYPE_DATA = 1;
const TYPE_OPEN = 2;
const TYPE_OK = 3;
const TYPE_ERR = 4;
const TYPE_CLOSE = 5;

export type OpenedStream = {
  id: number;
  write(data: Uint8Array): void;
  close(): void;
  onData(cb: (data: Uint8Array) => void): void;
  onClose(cb: () => void): void;
  ready: Promise<void>;
};

type StreamSlot = {
  id: number;
  onData: (data: Uint8Array) => void;
  onClose: () => void;
  ready: Promise<void>;
  resolve: () => void;
  reject: (err: Error) => void;
  opened: boolean;
  closed: boolean;
  buffer: Uint8Array[];
};

export function safeHost(host: string): boolean {
  if (host.length < 1 || host.length > 253) return false;
  return /^[A-Za-z0-9._:-]+$/.test(host);
}

export class Tunnel {
  private pipe: PhrasePipe | null = null;
  private socket: LineSocket | null = null;
  private sendCounter = 1;
  private recvCounter = 1;
  private nextId: number;
  private readonly streams = new Map<number, StreamSlot>();
  private failed: Error | null = null;
  onOpen: ((host: string, port: number, stream: OpenedStream) => Promise<void> | void) | null =
    null;
  onLine: ((line: string, meta: LineMeta, dir: "out" | "in") => void) | null = null;
  readonly outgoing: { text: string; meta: LineMeta }[] = [];
  readonly cipherOut: Uint8Array[] = [];

  private constructor(
    readonly keys: SessionKeys,
    readonly profile: Profile,
    readonly role: "client" | "server",
  ) {
    this.nextId = role === "client" ? 1 : 2;
  }

  /** Client: one conversation for the whole data connection, seeded by the session. */
  static connect(socket: LineSocket, keys: SessionKeys, profile: Profile, surface?: Surface): Tunnel {
    const tunnel = new Tunnel(keys, profile, "client");
    const opened = surface?.open("client", topicSeed(keys, "c2s"), topicSeed(keys, "s2c"));
    tunnel.pipe = opened
      ? new PhrasePipe(opened.enc, opened.dec)
      : new PhrasePipe(
          new Codec(profile, topicSeed(keys, "c2s")),
          new Codec(profile, topicSeed(keys, "s2c")),
        );
    tunnel.sendCounter = 2;
    tunnel.recvCounter = 1;
    tunnel.socket = socket;
    tunnel.bind();
    tunnel.writeRaw(dataPreamble(keys, profile));
    return tunnel;
  }

  /** Server: the session is already known, so the first line is already in the session's voice. */
  static accept(socket: LineSocket, keys: SessionKeys, surface?: Surface): Promise<Tunnel> {
    const profile = keys.profile;
    const opened = surface?.open("server", topicSeed(keys, "s2c"), topicSeed(keys, "c2s"));
    const pipe = opened
      ? new PhrasePipe(opened.enc, opened.dec)
      : new PhrasePipe(
          new Codec(profile, topicSeed(keys, "s2c")),
          new Codec(profile, topicSeed(keys, "c2s")),
        );
    return new Promise((resolve, reject) => {
      let tunnel: Tunnel | null = null;
      const fail = (err: Error) => {
        if (!tunnel) reject(err);
        else tunnel.fail(err);
      };
      socket.onLine((line) => {
        if (!line) return;
        let payloads: Uint8Array[];
        try {
          payloads = pipe.pushLine(line);
        } catch (err) {
          fail(err instanceof Error ? err : new Error("decode"));
          return;
        }
        if (!tunnel) {
          if (!payloads.length) return;
          try {
            const raw = payloads[0];
            if (!equalBytes(raw.subarray(0, 4), keys.token)) throw new Error("unknown session");
            const got = readPreamble(keys, raw);
            if (got.profile !== profile) throw new Error("profile");
            tunnel = new Tunnel(keys, profile, "server");
            tunnel.pipe = pipe;
            tunnel.sendCounter = 1;
            tunnel.recvCounter = 2;
            tunnel.socket = socket;
            resolve(tunnel);
            for (const extra of payloads.slice(1)) tunnel.onCipher(extra);
          } catch (err) {
            fail(err instanceof Error ? err : new Error("preamble"));
          }
          return;
        }
        for (const payload of payloads) tunnel.onCipher(payload);
      });
    });
  }

  private bind(): void {
    const socket = this.socket;
    if (!socket) return;
    socket.onLine((line) => {
      if (!line || !this.pipe) return;
      let payloads: Uint8Array[];
      try {
        payloads = this.pipe.pushLine(line);
      } catch (err) {
        this.fail(err instanceof Error ? err : new Error("decode"));
        return;
      }
      for (const payload of payloads) this.onCipher(payload);
    });
  }

  private fail(err: Error): void {
    this.failed = err;
    for (const slot of this.streams.values()) {
      if (!slot.opened) slot.reject(err);
      slot.onClose();
    }
  }

  private writeRaw(payload: Uint8Array): void {
    if (!this.pipe || !this.socket) throw new Error("tunnel closed");
    for (const item of this.pipe.encode(payload)) {
      this.outgoing.push({ text: item.line, meta: item.meta });
      this.onLine?.(item.line, item.meta, "out");
      this.socket.send(item.line);
    }
  }

  private sendPlain(plain: Uint8Array): void {
    if (this.failed) throw this.failed;
    const dir = this.role === "client" ? 0 : 1;
    const boxed = seal(this.keys.sendKey, dir, this.sendCounter++, plain);
    this.cipherOut.push(boxed);
    this.writeRaw(boxed);
  }

  private onCipher(boxed: Uint8Array): void {
    const dir = this.role === "client" ? 1 : 0;
    let plain: Uint8Array;
    try {
      plain = open(this.keys.recvKey, dir, this.recvCounter++, boxed);
    } catch (err) {
      this.fail(err instanceof Error ? err : new Error("open"));
      return;
    }
    if (plain.length < 5) return;
    const type = plain[0];
    const id = new DataView(plain.buffer, plain.byteOffset + 1, 4).getUint32(0);
    const rest = plain.subarray(5);
    if (type === TYPE_DATA) this.onData(id, rest);
    else if (type === TYPE_OPEN) this.onOpenFrame(id, rest);
    else if (type === TYPE_OK) this.onOk(id);
    else if (type === TYPE_ERR) this.onErr(id, text(rest));
    else if (type === TYPE_CLOSE) this.onClose(id);
  }

  private slotFrame(type: number, id: number, rest: Uint8Array = new Uint8Array()): Uint8Array {
    const out = new Uint8Array(5 + rest.length);
    out[0] = type;
    new DataView(out.buffer).setUint32(1, id);
    out.set(rest, 5);
    return out;
  }

  open(host: string, port: number): OpenedStream {
    if (!safeHost(host) || port < 1 || port > 65535) {
      throw new Error("refused address");
    }
    const id = this.nextId;
    this.nextId += 2;
    const slot = this.makeSlot(id, false);
    const hostBytes = utf8(host);
    const rest = new Uint8Array(2 + hostBytes.length);
    new DataView(rest.buffer).setUint16(0, port);
    rest.set(hostBytes, 2);
    this.sendPlain(this.slotFrame(TYPE_OPEN, id, rest));
    return this.view(slot);
  }

  private makeSlot(id: number, opened: boolean): StreamSlot {
    let resolve: () => void = () => {};
    let reject: (err: Error) => void = () => {};
    const ready = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const slot: StreamSlot = {
      id,
      onData: () => {},
      onClose: () => {},
      ready,
      resolve,
      reject,
      opened,
      closed: false,
      buffer: [],
    };
    this.streams.set(id, slot);
    return slot;
  }

  private view(slot: StreamSlot): OpenedStream {
    return {
      id: slot.id,
      write: (data) => this.writeStream(slot, data),
      close: () => this.closeStream(slot),
      onData: (cb) => {
        slot.onData = cb;
      },
      onClose: (cb) => {
        slot.onClose = cb;
      },
      ready: slot.ready,
    };
  }

  private writeStream(slot: StreamSlot, data: Uint8Array): void {
    if (slot.closed) return;
    const size = 200;
    for (let i = 0; i < data.length; i += size) {
      this.sendPlain(this.slotFrame(TYPE_DATA, slot.id, data.subarray(i, i + size)));
    }
  }

  private closeStream(slot: StreamSlot): void {
    if (slot.closed) return;
    slot.closed = true;
    this.streams.delete(slot.id);
    try {
      this.sendPlain(this.slotFrame(TYPE_CLOSE, slot.id));
    } catch {
      /* peer already gone */
    }
  }

  private onData(id: number, data: Uint8Array): void {
    const slot = this.streams.get(id);
    if (!slot || slot.closed) return;
    if (!slot.opened) slot.buffer.push(data);
    else slot.onData(data);
  }

  private onOk(id: number): void {
    const slot = this.streams.get(id);
    if (!slot || slot.opened) return;
    slot.opened = true;
    slot.resolve();
    const buffered = slot.buffer.splice(0);
    for (const chunk of buffered) slot.onData(chunk);
  }

  private onErr(id: number, reason: string): void {
    const slot = this.streams.get(id);
    if (!slot) return;
    slot.closed = true;
    this.streams.delete(id);
    slot.reject(new Error(reason || "open failed"));
    slot.onClose();
  }

  private onClose(id: number): void {
    const slot = this.streams.get(id);
    if (!slot || slot.closed) return;
    slot.closed = true;
    this.streams.delete(id);
    if (!slot.opened) slot.reject(new Error("closed"));
    slot.onClose();
  }

  private onOpenFrame(id: number, rest: Uint8Array): void {
    if (rest.length < 2) return;
    const port = new DataView(rest.buffer, rest.byteOffset, 2).getUint16(0);
    const host = text(rest.subarray(2));
    const slot = this.makeSlot(id, false);
    const view = this.view(slot);
    const accept = this.onOpen;
    if (!accept || !safeHost(host)) {
      this.sendPlain(this.slotFrame(TYPE_ERR, id, utf8("refused")));
      slot.closed = true;
      this.streams.delete(id);
      return;
    }
    Promise.resolve()
      .then(() => accept(host, port, view))
      .then(() => {
        slot.opened = true;
        slot.resolve();
        this.sendPlain(this.slotFrame(TYPE_OK, id));
        const buffered = slot.buffer.splice(0);
        for (const chunk of buffered) slot.onData(chunk);
      })
      .catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : "dial failed";
        slot.closed = true;
        this.streams.delete(id);
        this.sendPlain(this.slotFrame(TYPE_ERR, id, utf8(reason)));
      });
  }
}

export function startHandshake(opts: {
  socket: LineSocket;
  role: "client" | "server";
  self: Identity;
  peerEdPub: Uint8Array;
  peerName: string;
  profile: Profile;
  seen?: Set<string>;
  log?: (line: string, meta: LineMeta) => void;
  onServerReady?: (keys: SessionKeys) => void;
  surface?: Surface;
}): Promise<SessionKeys> {
  const hs = new Handshake(
    opts.role,
    opts.self,
    opts.peerEdPub,
    opts.peerName,
    opts.profile,
    () => Date.now(),
    opts.seen ?? new Set(),
  );
  const cover = pairCover(unb64url(opts.self.edPub), opts.peerEdPub, "control");
  return handshakeOn(opts.socket, hs, cover, opts.log, opts.onServerReady, opts.surface);
}
