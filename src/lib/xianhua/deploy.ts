import { createIdentity, publicIdentity, type Identity, type PublicIdentity } from "./crypto";
import type { Profile } from "./wire";

export type DeploySettings = {
  host: string;
  bind: string;
  controlPort: number;
  dataPort: number;
  socksPort: number;
  httpPort: number;
  mapListen: number;
  mapHost: string;
  mapPort: number;
  profile: Profile;
};

export type SideFile = {
  v: 1;
  role: "server" | "client";
  profile: Profile;
  identity: Identity;
  peer: PublicIdentity;
  host: string;
  bind: string;
  controlPort: number;
  dataPort: number;
  socksPort?: number;
  httpPort?: number;
  maps?: { listen: number; host: string; port: number }[];
};

export const DEFAULT_SETTINGS: DeploySettings = {
  host: "127.0.0.1",
  bind: "0.0.0.0",
  controlPort: 4711,
  dataPort: 4712,
  socksPort: 1080,
  httpPort: 8088,
  mapListen: 15432,
  mapHost: "10.0.0.8",
  mapPort: 5432,
  profile: "talk",
};

export function freshIdentity(name: string): Identity {
  const trimmed = name.trim().slice(0, 40) || "甲";
  return createIdentity(trimmed);
}

export function renameIdentity(id: Identity, name: string): Identity {
  return { ...id, name: name.slice(0, 40) };
}

function quote(name: string): string {
  return `'${name.replaceAll("'", "")}'`;
}

export function portOk(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

export function settingsOk(s: DeploySettings): string {
  const ports = [s.controlPort, s.dataPort, s.socksPort, s.httpPort, s.mapListen, s.mapPort];
  if (ports.some((n) => !portOk(n))) return "端口要在 1 到 65535 之间";
  const used = new Set([s.controlPort, s.dataPort, s.socksPort, s.httpPort, s.mapListen]);
  if (used.size !== 5) return "控制口、数据口、代理口、HTTP 口和映射口不能相同";
  if (!s.host.trim() || !s.mapHost.trim() || /\s/.test(s.host) || /\s/.test(s.mapHost)) return "地址不能空，也不能有空格";
  if (s.profile !== "talk" && s.profile !== "dense") return "档位不对";
  return "";
}

export function stayFile(self: Identity, peer: PublicIdentity, s: DeploySettings): SideFile {
  return {
    v: 1,
    role: "server",
    profile: s.profile,
    identity: self,
    peer,
    host: s.host.trim(),
    bind: s.bind.trim() || "0.0.0.0",
    controlPort: s.controlPort,
    dataPort: s.dataPort,
  };
}

export function leaveFile(self: Identity, peer: PublicIdentity, s: DeploySettings): SideFile {
  return {
    v: 1,
    role: "client",
    profile: s.profile,
    identity: self,
    peer,
    host: s.host.trim(),
    bind: "127.0.0.1",
    controlPort: s.controlPort,
    dataPort: s.dataPort,
    socksPort: s.socksPort,
    httpPort: s.httpPort,
    maps: [{ listen: s.mapListen, host: s.mapHost.trim(), port: s.mapPort }],
  };
}

export function publicFile(id: Identity): PublicIdentity {
  return publicIdentity(id);
}

export function serveCommand(s: DeploySettings, secretName: string, peerName: string): string {
  return `node --experimental-transform-types --import ./register.mjs src/bin/xianhua.ts serve --identity ${quote(secretName)} --peer ${quote(peerName)} --bind ${s.bind.trim() || "0.0.0.0"} --control ${s.controlPort} --data ${s.dataPort} --profile ${s.profile}`;
}

export function connectCommand(s: DeploySettings, secretName: string, peerName: string): string {
  return `node --experimental-transform-types --import ./register.mjs src/bin/xianhua.ts connect --identity ${quote(secretName)} --peer ${quote(peerName)} --host ${s.host.trim()} --control ${s.controlPort} --data ${s.dataPort} --socks ${s.socksPort} --http ${s.httpPort} --map ${s.mapListen}=${s.mapHost.trim()}:${s.mapPort} --profile ${s.profile}`;
}
