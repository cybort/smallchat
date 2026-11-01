import { text, unb64url, utf8 } from "./bytes";
import { createIdentity } from "./crypto";
import { measure, type WireStats } from "./stats";
import { memoryPair, startHandshake, Tunnel, type Profile, type WireLine } from "./wire";

export type DemoResult = {
  profile: Profile;
  payload: string;
  recovered: string;
  match: boolean;
  expansion: number;
  control: WireLine[];
  data: WireLine[];
  wire: WireStats;
  cipher: WireStats;
  topics: string[];
  episodeLengths: number[];
  duplicateLines: number;
  samples: { label: string; focus: string; lines: string[] }[];
};

export async function runDemo(profile: Profile, payload: string): Promise<DemoResult> {
  const clientId = createIdentity("甲");
  const serverId = createIdentity("乙");
  const [clientCtrl, serverCtrl] = memoryPair();
  const [clientData, serverData] = memoryPair();
  const control: WireLine[] = [];
  const seen = new Set<string>();
  const serverKeysP = startHandshake({
    socket: serverCtrl,
    role: "server",
    self: serverId,
    peerEdPub: unb64url(clientId.edPub),
    peerName: clientId.name,
    profile,
    seen,
    log: (line, meta) =>
      control.push({
        channel: "control",
        from: "server",
        text: line,
        label: meta.label,
        phase: meta.phase,
        focus: meta.focus,
        hint: meta.hint,
        fact: meta.fact,
      }),
  });
  const clientKeysP = startHandshake({
    socket: clientCtrl,
    role: "client",
    self: clientId,
    peerEdPub: unb64url(serverId.edPub),
    peerName: serverId.name,
    profile,
    log: (line, meta) =>
      control.push({
        channel: "control",
        from: "client",
        text: line,
        label: meta.label,
        phase: meta.phase,
        focus: meta.focus,
        hint: meta.hint,
        fact: meta.fact,
      }),
  });
  const [clientKeys, serverKeys] = await Promise.all([clientKeysP, serverKeysP]);
  const serverTunnelP = Tunnel.accept(serverData, serverKeys);
  serverTunnelP.then((tunnel) => {
    tunnel.onOpen = (_host, _port, stream) => {
      stream.onData((chunk) => stream.write(chunk));
    };
  });
  const clientTunnel = Tunnel.connect(clientData, clientKeys, profile);
  const serverTunnel = await serverTunnelP;
  const raw = utf8(payload);
  const stream = clientTunnel.open("echo.local", 9);
  const got: Uint8Array[] = [];
  stream.onData((chunk) => got.push(chunk));
  await stream.ready;
  stream.write(raw);
  stream.close();
  const recovered = merge(got);
  const data = collect(clientTunnel, "client").concat(collect(serverTunnel, "server"));
  const wireText = control
    .map((l) => l.text)
    .concat(data.map((l) => l.text))
    .join("\n");
  const cipher = merge(clientTunnel.cipherOut.concat(serverTunnel.cipherOut));
  const clientLines = data.filter((l) => l.from === "client");
  return {
    profile,
    payload,
    recovered: text(recovered),
    match: text(recovered) === payload,
    expansion: utf8(wireText).length / Math.max(1, raw.length),
    control,
    data,
    wire: await measure(utf8(wireText), wireText),
    cipher: await measure(cipher, ""),
    topics: episodeTopics(clientLines),
    episodeLengths: episodeLens(clientLines),
    duplicateLines: countDupes(data.map((l) => l.text)),
    samples: pickSamples(clientLines),
  };
}

function collect(tunnel: Tunnel, from: "client" | "server"): WireLine[] {
  return tunnel.outgoing.map((item) => ({
    channel: "data" as const,
    from,
    text: item.text,
    label: item.meta.label,
    phase: item.meta.phase,
    focus: item.meta.focus,
    hint: item.meta.hint,
    fact: item.meta.fact,
  }));
}

function merge(parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function episodeTopics(lines: WireLine[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (out[out.length - 1] !== line.label) out.push(line.label);
  }
  return out;
}

function episodeLens(lines: WireLine[]): number[] {
  const out: number[] = [];
  let n = 0;
  let prev = "";
  for (const line of lines) {
    if (line.label !== prev) {
      if (n) out.push(n);
      prev = line.label;
      n = 1;
    } else n++;
  }
  if (n) out.push(n);
  return out;
}

function countDupes(lines: string[]): number {
  const seen = new Set<string>();
  let n = 0;
  for (const line of lines) {
    if (seen.has(line)) n++;
    seen.add(line);
  }
  return n;
}

function pickSamples(lines: WireLine[]): { label: string; focus: string; lines: string[] }[] {
  const out: { label: string; focus: string; lines: string[] }[] = [];
  let i = 0;
  while (i < lines.length && out.length < 3) {
    const label = lines[i].label;
    const focus = lines[i].focus;
    const group: string[] = [];
    while (i < lines.length && lines[i].label === label && lines[i].focus === focus && group.length < 4) {
      group.push(lines[i].text);
      i++;
    }
    while (i < lines.length && lines[i].label === label) i++;
    if (group.length >= 3) out.push({ label, focus, lines: group });
  }
  return out;
}
