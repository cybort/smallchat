import { readFileSync, writeFileSync } from "node:fs";
import { createIdentity, publicIdentity, type Identity, type PublicIdentity } from "../lib/xianhua/crypto";
import { forgeNotes, forgeSpeech } from "../lib/xianhua/foundry";
import { forgeMedia } from "../lib/xianhua/media";
import { forgeReel } from "../lib/xianhua/reel";
import { startHost, type HostConfig } from "../lib/xianhua/node-host.server";
import { DEMO_CARD_INPUT, parseBrief, parseCardText, programCard } from "../lib/xianhua/script";
import { surfaceOf, type FrozenSurface } from "../lib/xianhua/surface";
import type { Dialect, Posture } from "../lib/xianhua/veil";
import type { Profile } from "../lib/xianhua/wire";

const argv = process.argv.slice(2);
const cmd = argv[0];

function flag(name: string, fallback = ""): string {
  const i = argv.indexOf(name);
  if (i < 0) return fallback;
  return argv[i + 1] ?? fallback;
}

function profile(): Profile {
  const value = flag("--profile", "talk");
  if (value !== "talk" && value !== "dense") throw new Error("profile must be talk or dense");
  return value;
}

function posture(): Posture {
  const value = flag("--posture", "both");
  if (value !== "none" && value !== "one" && value !== "both") throw new Error("posture must be none, one, or both");
  return value;
}

function dialect(): Dialect {
  const value = flag("--dialect", "speech");
  if (value !== "speech" && value !== "program" && value !== "media" && value !== "reel") {
    throw new Error("dialect must be speech, program, media, or reel");
  }
  return value;
}

function mint(): FrozenSurface {
  const brief = parseBrief(readFileSync(flag("--brief"), "utf8"));
  const lang = flag("--lang");
  if (lang) brief.language = lang.slice(0, 40);
  const card = flag("--card") ? parseCardText(readFileSync(flag("--card"), "utf8")) : programCard(DEMO_CARD_INPUT);
  const epoch = Math.max(1, Number(flag("--epoch", "1")) || 1);
  const who = posture();
  const kind = dialect();
  if (kind === "speech") {
    const c2s = forgeSpeech(brief, "甲", "甲", epoch);
    const s2c = forgeSpeech(brief, "乙", who === "both" ? "乙" : "甲", epoch);
    return { v: 1, dialect: "speech", epoch, posture: who, language: brief.language, card, speech: { c2s, s2c } };
  }
  if (kind === "media") {
    const configId = flag("--media", "series-dusk");
    const c2s = forgeMedia(brief, "甲", "甲", epoch, configId);
    const s2c = forgeMedia(brief, "乙", who === "both" ? "乙" : "甲", epoch, configId);
    return { v: 1, dialect: "media", epoch, posture: who, language: brief.language, card, media: { configId, c2s, s2c } };
  }
  if (kind === "reel") {
    const c2s = forgeReel(brief, "甲", "甲", epoch);
    const s2c = forgeReel(brief, "乙", who === "both" ? "乙" : "甲", epoch);
    return { v: 1, dialect: "reel", epoch, posture: who, language: brief.language, card, reel: { c2s, s2c } };
  }
  const rich = who !== "none";
  return {
    v: 1,
    dialect: "program",
    epoch,
    posture: who,
    language: brief.language,
    card,
    notes: {
      c2s: forgeNotes(brief, "甲", "甲", epoch, rich),
      s2c: forgeNotes(brief, "乙", who === "both" ? "乙" : "甲", epoch, rich),
    },
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

if (cmd === "keygen") {
  const name = argv[1] || "甲";
  const file = argv[2] || `${name}.json`;
  const id = createIdentity(name);
  writeFileSync(file, JSON.stringify(id, null, 2));
  writeFileSync(`${file}.pub`, JSON.stringify(publicIdentity(id), null, 2));
  process.stdout.write(`${file}\n${file}.pub\n`);
} else if (cmd === "mint") {
  const file = flag("--out", "surface.json");
  writeFileSync(file, JSON.stringify(mint(), null, 2));
  process.stdout.write(`${file}\n`);
} else if (cmd === "serve" || cmd === "connect") {
  const identity = readJson<Identity>(flag("--identity"));
  const peer = readJson<PublicIdentity>(flag("--peer"));
  const maps = argv
    .flatMap((arg, i) => (argv[i - 1] === "--map" ? [arg] : []))
    .map((spec) => {
      const [listen, rest] = spec.split("=");
      const cut = rest.lastIndexOf(":");
      return { listen: Number(listen), host: rest.slice(0, cut), port: Number(rest.slice(cut + 1)) };
    });
  const config: HostConfig = {
    v: 1,
    role: cmd === "serve" ? "server" : "client",
    profile: profile(),
    identity,
    peer,
    host: flag("--host", "127.0.0.1"),
    bind: cmd === "serve" ? flag("--bind", "0.0.0.0") : flag("--bind", "127.0.0.1"),
    controlPort: Number(flag("--control", "4711")),
    dataPort: Number(flag("--data", "4712")),
    socksPort: flag("--socks") ? Number(flag("--socks")) : undefined,
    httpPort: flag("--http") ? Number(flag("--http")) : undefined,
    maps,
    surface: flag("--surface") ? surfaceOf(readJson<FrozenSurface>(flag("--surface"))) : undefined,
  };
  const running = await startHost(config);
  process.stdout.write(
    `${config.role} control=${running.controlPort} data=${running.dataPort} socks=${running.socksPort ?? "-"} http=${running.httpPort ?? "-"} maps=${running.mapPorts.join(",") || "-"}\n`,
  );
  await new Promise(() => {});
} else {
  process.stderr.write(
    "keygen <名字> <文件>\nmint --brief 私稿.txt --lang 中文 --epoch 3 --posture both --dialect media --media series-dusk --out surface.json\nserve --identity 甲.json --peer 乙.json.pub --control 4711 --data 4712 --profile talk --surface surface.json\nconnect --identity 乙.json --peer 甲.json.pub --host <甲的地址> --control 4711 --data 4712 --socks 1080 --http 8088 --map 15432=10.0.0.8:5432 --surface surface.json\n",
  );
  process.exit(cmd ? 1 : 0);
}
