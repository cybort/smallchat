import net from "node:net";
import { unb64url, utf8 } from "./bytes";
import {
  Handshake,
  createIdentity,
  pairCover,
  publicIdentity,
  seal,
  type Identity,
  type PublicIdentity,
} from "./crypto";
import { measure } from "./stats";
import type { TcpProof } from "./tcp-proof";
import type { Surface } from "./surface";
import { Tunnel, handshakeOn, safeHost, type LineSocket, type Profile } from "./wire";

export type HostConfig = {
  v: 1;
  role: "client" | "server";
  profile: Profile;
  identity: Identity;
  peer: PublicIdentity;
  host: string;
  controlPort: number;
  dataPort: number;
  socksPort?: number;
  httpPort?: number;
  maps?: { listen: number; host: string; port: number }[];
  /** Where the server side listens. Client dials `host`. */
  bind?: string;
  onLine?: (line: string) => void;
  /** Frozen cover shared out of band. Omit to keep the shipped topic list. */
  surface?: Surface;
};

export type RunningHost = {
  controlPort: number;
  dataPort: number;
  socksPort?: number;
  httpPort?: number;
  mapPorts: number[];
  close: () => Promise<void>;
};

export function socketToLines(socket: net.Socket): LineSocket {
  let handler: ((line: string) => void) | null = null;
  const pending: string[] = [];
  let buf = Buffer.alloc(0);
  socket.on("data", (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    let idx = buf.indexOf(0x0a);
    while (idx >= 0) {
      const line = buf.subarray(0, idx).toString("utf8").replace(/\r$/, "");
      buf = buf.subarray(idx + 1);
      if (handler) handler(line);
      else pending.push(line);
      idx = buf.indexOf(0x0a);
    }
  });
  return {
    send(line) {
      socket.write(`${line}\n`);
    },
    onLine(cb) {
      handler = cb;
      for (const line of pending.splice(0)) cb(line);
    },
    close() {
      socket.end();
    },
  };
}

function connectTo(host: string, port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = net.connect({ host, port }, () => {
      settled = true;
      resolve(socket);
    });
    socket.on("error", (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}

function listen(port: number, host: string, on: (socket: net.Socket) => void): Promise<net.Server> {
  const server = net.createServer(on);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}

function portOf(server: net.Server): number {
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  return addr.port;
}

function closeOf(server: net.Server): () => Promise<void> {
  return () => new Promise((resolve) => server.close(() => resolve()));
}

function dialOut(tunnel: Tunnel): void {
  tunnel.onOpen = async (host, port, stream) => {
    if (!safeHost(host)) throw new Error("refused");
    const remote = await connectTo(host, port);
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      remote.end();
      stream.close();
    };
    remote.on("data", (chunk: Buffer) => {
      try {
        stream.write(chunk);
      } catch {
        finish();
      }
    });
    stream.onData((chunk) => {
      try {
        remote.write(chunk);
      } catch {
        finish();
      }
    });
    stream.onClose(() => {
      if (!ended) {
        ended = true;
        remote.end();
      }
    });
    remote.on("close", () => {
      if (!ended) {
        ended = true;
        stream.close();
      }
    });
    remote.on("error", () => {
      try {
        finish();
      } catch {
        /* peer already gone */
      }
    });
  };
}

export async function startHost(config: HostConfig): Promise<RunningHost> {
  const closers: Array<() => Promise<void>> = [];
  const sockets: net.Socket[] = [];
  const track = (socket: net.Socket) => {
    sockets.push(socket);
    socket.on("error", () => socket.destroy());
  };
  let controlPort = config.controlPort;
  let dataPort = config.dataPort;
  const bind = config.bind ?? "127.0.0.1";
  const selfEd = unb64url(config.identity.edPub);
  const peerEd = unb64url(config.peer.edPub);
  const controlCover = pairCover(selfEd, peerEd, "control");

  if (config.role === "server") {
    let pending: Awaited<ReturnType<typeof handshakeOn>> | null = null;
    const seen = new Set<string>();
    const control = await listen(config.controlPort, bind, (socket) => {
      track(socket);
      socket.setNoDelay(true);
      const hs = new Handshake(
        "server",
        config.identity,
        peerEd,
        config.peer.name,
        config.profile,
        () => Date.now(),
        seen,
      );
      handshakeOn(
        socketToLines(socket),
        hs,
        controlCover,
        (line) => config.onLine?.(line),
        (keys) => {
          if (seen.size > 4000) seen.clear();
          pending = keys;
        },
        config.surface,
      ).catch(() => socket.destroy());
    });
    const data = await listen(config.dataPort, bind, (socket) => {
      track(socket);
      socket.setNoDelay(true);
      const keys = pending;
      if (!keys) {
        socket.destroy();
        return;
      }
      pending = null;
      Tunnel.accept(socketToLines(socket), keys, config.surface)
        .then((next) => {
          next.onLine = (line) => config.onLine?.(line);
          dialOut(next);
        })
        .catch(() => socket.destroy());
    });
    controlPort = portOf(control);
    dataPort = portOf(data);
    closers.push(closeOf(control), closeOf(data));
    return {
      controlPort,
      dataPort,
      mapPorts: [],
      close: async () => {
        for (const socket of sockets) socket.destroy();
        for (const close of closers) await close();
      },
    };
  }

  const controlSock = await connectTo(config.host, config.controlPort);
  track(controlSock);
  controlSock.setNoDelay(true);
  const keys = await handshakeOn(
    socketToLines(controlSock),
    new Handshake(
      "client",
      config.identity,
      peerEd,
      config.peer.name,
      config.profile,
      () => Date.now(),
      new Set(),
    ),
    controlCover,
    (line) => config.onLine?.(line),
    undefined,
    config.surface,
  );
  const dataSock = await connectTo(config.host, config.dataPort);
  track(dataSock);
  dataSock.setNoDelay(true);
  const tunnel = Tunnel.connect(socketToLines(dataSock), keys, config.profile, config.surface);
  tunnel.onLine = (line) => config.onLine?.(line);
  dialOut(tunnel);

  let socksPort: number | undefined;
  let httpPort: number | undefined;
  const mapPorts: number[] = [];
  if (config.socksPort !== undefined) {
    const server = await listen(config.socksPort, bind, (socket) => acceptSocks(socket, tunnel));
    socksPort = portOf(server);
    closers.push(closeOf(server));
  }
  if (config.httpPort !== undefined) {
    const server = await listen(config.httpPort, bind, (socket) => acceptHttp(socket, tunnel));
    httpPort = portOf(server);
    closers.push(closeOf(server));
  }
  for (const map of config.maps ?? []) {
    const server = await listen(map.listen, bind, (socket) => acceptMap(socket, tunnel, map.host, map.port));
    mapPorts.push(portOf(server));
    closers.push(closeOf(server));
  }
  return {
    controlPort,
    dataPort,
    socksPort,
    httpPort,
    mapPorts,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      for (const close of closers) await close();
    },
  };
}

function acceptSocks(socket: net.Socket, tunnel: Tunnel): void {
  let stage: 0 | 1 | 2 = 0;
  let buf = Buffer.alloc(0);
  const onData = (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    if (stage === 0) {
      if (buf.length < 2 || buf.length < 2 + buf[1]) return;
      buf = buf.subarray(2 + buf[1]);
      socket.write(Buffer.from([0x05, 0x00]));
      stage = 1;
    }
    if (stage !== 1 || buf.length < 4 || buf[0] !== 0x05 || buf[1] !== 0x01) return;
    const atyp = buf[3];
    let host = "";
    let off = 4;
    if (atyp === 1 && buf.length >= 10) {
      host = `${buf[4]}.${buf[5]}.${buf[6]}.${buf[7]}`;
      off = 8;
    } else if (atyp === 3 && buf.length >= 5 + buf[4] + 2) {
      const len = buf[4];
      host = buf.subarray(5, 5 + len).toString("utf8");
      off = 5 + len;
    } else if (atyp === 4 && buf.length >= 22) {
      const parts: string[] = [];
      for (let i = 0; i < 16; i += 2) parts.push(buf.readUInt16BE(4 + i).toString(16));
      host = parts.join(":");
      off = 20;
    } else return;
    const destPort = buf.readUInt16BE(off);
    const rest = buf.subarray(off + 2);
    stage = 2;
    socket.off("data", onData);
    let opened: ReturnType<Tunnel["open"]>;
    try {
      opened = tunnel.open(host, destPort);
    } catch {
      socket.write(Buffer.from([5, 5, 0, 1, 0, 0, 0, 0, 0, 0]));
      socket.destroy();
      return;
    }
    opened.ready
      .then(() => {
        socket.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
        if (rest.length) opened.write(rest);
        socket.on("data", (next) => opened.write(next));
        opened.onData((next) => socket.write(next));
        socket.on("close", () => opened.close());
        opened.onClose(() => socket.end());
      })
      .catch(() => {
        socket.write(Buffer.from([5, 5, 0, 1, 0, 0, 0, 0, 0, 0]));
        socket.destroy();
      });
  };
  socket.on("data", onData);
}

function acceptHttp(socket: net.Socket, tunnel: Tunnel): void {
  let buf = Buffer.alloc(0);
  const onData = (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    const split = buf.indexOf("\r\n\r\n");
    if (split < 0) return;
    const head = buf.subarray(0, split).toString("utf8");
    const rest = buf.subarray(split + 4);
    socket.off("data", onData);
    const match = /^CONNECT\s+([^:\s]+):(\d+)/.exec(head);
    if (!match) {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }
    let opened: ReturnType<Tunnel["open"]>;
    try {
      opened = tunnel.open(match[1], Number(match[2]));
    } catch {
      socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      return;
    }
    opened.ready
      .then(() => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (rest.length) opened.write(rest);
        socket.on("data", (next) => opened.write(next));
        opened.onData((next) => socket.write(next));
        socket.on("close", () => opened.close());
        opened.onClose(() => socket.end());
      })
      .catch(() => socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n"));
  };
  socket.on("data", onData);
}

function acceptMap(socket: net.Socket, tunnel: Tunnel, host: string, port: number): void {
  let opened: ReturnType<Tunnel["open"]>;
  try {
    opened = tunnel.open(host, port);
  } catch {
    socket.destroy();
    return;
  }
  opened.ready
    .then(() => {
      socket.on("data", (chunk) => opened.write(chunk));
      opened.onData((chunk) => socket.write(chunk));
      socket.on("close", () => opened.close());
      opened.onClose(() => socket.end());
    })
    .catch(() => socket.destroy());
}

export async function proveTcp(profile: Profile, payload: string): Promise<TcpProof> {
  const lines: string[] = [];
  const echo = await listen(0, "127.0.0.1", (socket) => {
    socket.on("error", () => socket.destroy());
    socket.on("data", (chunk) => socket.write(chunk));
  });
  const echoPort = portOf(echo);
  const serverId = createIdentity("乙");
  const clientId = createIdentity("甲");
  const onLine = (line: string) => lines.push(line);
  const server = await startHost({
    v: 1,
    role: "server",
    profile,
    identity: serverId,
    peer: publicIdentity(clientId),
    host: "127.0.0.1",
    bind: "127.0.0.1",
    controlPort: 0,
    dataPort: 0,
    onLine,
  });
  const client = await startHost({
    v: 1,
    role: "client",
    profile,
    identity: clientId,
    peer: publicIdentity(serverId),
    host: "127.0.0.1",
    bind: "127.0.0.1",
    controlPort: server.controlPort,
    dataPort: server.dataPort,
    socksPort: 0,
    httpPort: 0,
    maps: [{ listen: 0, host: "127.0.0.1", port: echoPort }],
    onLine,
  });
  try {
    const viaSocks = await withTimeout(socksRoundtrip(client.socksPort ?? 0, echoPort, payload), 8000);
    const viaHttp = await withTimeout(httpRoundtrip(client.httpPort ?? 0, echoPort, payload), 8000);
    const viaMap = await withTimeout(tcpRoundtrip(client.mapPorts[0] ?? 0, payload), 8000);
    const wireText = lines.join("\n");
    const key = new Uint8Array(32);
    crypto.getRandomValues(key);
    const boxed = seal(key, 0, 1, utf8(wireText.slice(0, 4096).padEnd(1024, "x")));
    return {
      match: viaSocks === payload && viaHttp === payload && viaMap === payload,
      differentPorts: server.controlPort !== server.dataPort && server.controlPort !== 0,
      controlPort: server.controlPort,
      dataPort: server.dataPort,
      wire: await measure(utf8(wireText), wireText),
      cipher: await measure(boxed, ""),
      sample: lines.slice(0, 8),
    };
  } finally {
    await client.close();
    await server.close();
    await closeOf(echo)();
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timed out")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (err) => {
        clearTimeout(t);
        reject(err instanceof Error ? err : new Error("roundtrip"));
      },
    );
  });
}

function socksRoundtrip(proxyPort: number, destPort: number, payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port: proxyPort }, () => {
      socket.write(Buffer.from([5, 1, 0]));
    });
    let stage = 0;
    let buf = Buffer.alloc(0);
    const chunks: Buffer[] = [];
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };
    const ok = (value: string) => {
      if (settled) return;
      settled = true;
      socket.end();
      resolve(value);
    };
    socket.on("error", (err) => fail(err));
    socket.on("data", (chunk) => {
      if (stage < 2) {
        buf = Buffer.concat([buf, chunk]);
        if (stage === 0 && buf.length >= 2) {
          buf = buf.subarray(2);
          const req = Buffer.alloc(10);
          req[0] = 5;
          req[1] = 1;
          req[3] = 1;
          req[4] = 127;
          req[5] = 0;
          req[6] = 0;
          req[7] = 1;
          req.writeUInt16BE(destPort, 8);
          socket.write(req);
          stage = 1;
        }
        if (stage === 1 && buf.length >= 10) {
          if (buf[1] !== 0) {
            fail(new Error("socks refused"));
            return;
          }
          stage = 2;
          const rest = buf.subarray(10);
          if (rest.length) chunks.push(rest);
          socket.write(Buffer.from(payload));
        }
        return;
      }
      chunks.push(chunk);
      const got = Buffer.concat(chunks).toString("utf8");
      if (got.length >= payload.length) ok(got.slice(0, payload.length));
    });
  });
}

function httpRoundtrip(proxyPort: number, destPort: number, payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port: proxyPort }, () => {
      socket.write(`CONNECT 127.0.0.1:${destPort} HTTP/1.1\r\nHost: 127.0.0.1:${destPort}\r\n\r\n`);
    });
    let buf = Buffer.alloc(0);
    let header = true;
    const chunks: Buffer[] = [];
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };
    const ok = (value: string) => {
      if (settled) return;
      settled = true;
      socket.end();
      resolve(value);
    };
    socket.on("error", (err) => fail(err));
    socket.on("data", (chunk) => {
      if (header) {
        buf = Buffer.concat([buf, chunk]);
        const split = buf.indexOf("\r\n\r\n");
        if (split < 0) return;
        const head = buf.subarray(0, split).toString("utf8");
        if (!head.startsWith("HTTP/1.1 200")) {
          fail(new Error(head.split("\r\n")[0] || "http"));
          return;
        }
        header = false;
        const rest = buf.subarray(split + 4);
        if (rest.length) chunks.push(rest);
        socket.write(Buffer.from(payload));
        return;
      }
      chunks.push(chunk);
      const got = Buffer.concat(chunks).toString("utf8");
      if (got.length >= payload.length) ok(got.slice(0, payload.length));
    });
  });
}

function tcpRoundtrip(port: number, payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.write(Buffer.from(payload));
    });
    const chunks: Buffer[] = [];
    let settled = false;
    socket.on("error", (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    });
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      const got = Buffer.concat(chunks).toString("utf8");
      if (got.length >= payload.length && !settled) {
        settled = true;
        socket.end();
        resolve(got.slice(0, payload.length));
      }
    });
  });
}
