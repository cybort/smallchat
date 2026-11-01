import { utf8 } from "./bytes";
import type { BitLine, LineMeta } from "./codec";
import { PhrasePipe } from "./codec";
import { Rng } from "./prng";
import type { Brief } from "./script";
import { isZh } from "./script";
import { chiSquareUniform, gzipRatio, shannon } from "./stats";

export type Density = "still" | "series" | "loose";
export type PaletteName = "paper" | "dusk" | "tide" | "ink";

export type MediaConfig = {
  id: string;
  label: string;
  note: string;
  density: Density;
  palette: PaletteName;
};

export const MEDIA_CONFIGS: MediaConfig[] = [
  { id: "still-paper", label: "纸本静帧", note: "构图不动，只换短句", density: "still", palette: "paper" },
  { id: "series-dusk", label: "暮色连帧", note: "同一景物，光线略动", density: "series", palette: "dusk" },
  { id: "series-tide", label: "潮色连帧", note: "同一景物，留白略动", density: "series", palette: "tide" },
  { id: "loose-ink", label: "墨稿散帧", note: "景物还在，摆法会换", density: "loose", palette: "ink" },
];

export function mediaConfig(id: string): MediaConfig {
  const found = MEDIA_CONFIGS.find((item) => item.id === id);
  if (!found) throw new Error("没有这组媒体配置");
  return found;
}

type Palette = { bg: string; ink: string; accent: string; wash: [string, string, string, string] };

const PALETTES: Record<PaletteName, Palette> = {
  paper: { bg: "#f3eee4", ink: "#2c2824", accent: "#8c4a32", wash: ["#e7d7c3", "#d9c7b0", "#efe4d4", "#cbbba6"] },
  dusk: { bg: "#241c22", ink: "#f3eadf", accent: "#d08968", wash: ["#3d2e3a", "#4c3846", "#332833", "#5a403f"] },
  tide: { bg: "#e6eef0", ink: "#1b2b31", accent: "#3e6d74", wash: ["#c5d6d8", "#d7e4e6", "#b4c8cb", "#a8c0c3"] },
  ink: { bg: "#f6f3ee", ink: "#1a1a1a", accent: "#9a3b2f", wash: ["#e4dfd6", "#d4cfc4", "#eeeae3", "#c9c2b6"] },
};

const HORIZON = [92, 104, 116, 128];
const MOTIFS = ["window", "rain", "key", "boat"] as const;
type Motif = (typeof MOTIFS)[number];

export type MediaFact = { anchor: string; text: string; motif: Motif };

export type MediaBank = {
  voice: string;
  author: string;
  epoch: number;
  persona: string;
  language: string;
  configId: string;
  captions: string[];
  tails: string[];
  facts: MediaFact[];
};

const EPISODE_WEIGHTS = [1, 4, 8, 11, 10, 8, 6, 4, 3, 2, 2, 1];

function mix(text: string): number {
  let n = 2166136261;
  for (const ch of text) {
    n ^= ch.codePointAt(0) ?? 0;
    n = Math.imul(n, 16777619);
  }
  return n >>> 0;
}

function episodeLength(rng: Rng): number {
  let x = rng.int(60);
  for (let i = 0; i < EPISODE_WEIGHTS.length; i++) {
    if (x < EPISODE_WEIGHTS[i]) return 4 + i;
    x -= EPISODE_WEIGHTS[i];
  }
  return 8;
}

function otherFact(rng: Rng, current: number, previous: number, n: number): number {
  const banned = new Set<number>([current]);
  if (previous >= 0 && previous !== current) banned.add(previous);
  let x = rng.int(n - banned.size);
  for (let i = 0; i < n; i++) {
    if (banned.has(i)) continue;
    if (x === 0) return i;
    x--;
  }
  throw new Error("事实不够换");
}

function piece(n: number, shift: number, width: number): number {
  return Math.floor(n / 2 ** shift) % 2 ** width;
}

function rot(seq: number, salt: number, n: number): number {
  if (n <= 1) return 0;
  return (Math.imul(seq + 1, salt) >>> 0) % n;
}

const AMP = "\u0026amp;";
const LT = "\u0026lt;";
const GT = "\u0026gt;";
const QUOT = "\u0026quot;";

function esc(value: string): string {
  return value.replaceAll("&", AMP).replaceAll("<", LT).replaceAll(">", GT).replaceAll('"', QUOT);
}

function unesc(value: string): string {
  return value.replaceAll(QUOT, '"').replaceAll(GT, ">").replaceAll(LT, "<").replaceAll(AMP, "&");
}

function languageKind(language: string): "zh" | "ja" | "en" | "plain" {
  const name = language.trim().toLowerCase();
  if (isZh(language)) return "zh";
  if (/^(ja|jp|日本語|日语|日語|japanese)$/.test(language.trim()) || name === "japanese") return "ja";
  if (/^(en|english|英文|英语|英語)$/.test(name)) return "en";
  return "plain";
}

function pairList(kind: "zh" | "ja" | "en" | "plain", which: "caption" | "tail"): string[] {
  const zhCap = ["先记", "只留", "写上", "放着", "看见", "停在", "收到", "对着", "留白", "短记", "本张", "此帧", "画面", "边上", "底下", "角上"];
  const zhTail = ["到此", "先放", "不续", "收住", "停下", "看完", "搁下", "记下", "别翻", "够了", "回看", "合上", "留着", "结束", "不再", "正好"];
  const jaCap = ["先に", "あと", "まだ", "ただ", "今は", "ここ", "一度", "静かに", "そのまま", "近く", "端に", "下に", "余白", "本紙", "短く", "最後"];
  const jaTail = ["ここで", "先に置く", "閉じる", "残す", "切る", "見終える", "戻す", "記す", "足すな", "足りる", "見直す", "畳む", "置く", "終える", "やめる", "ちょうど"];
  const enCap = ["note", "keep", "hold", "mark", "see", "leave", "file", "face", "set", "name", "card", "frame", "page", "edge", "foot", "corner"];
  const enTail = ["stop", "rest", "end", "close", "pause", "done", "stay", "log", "halt", "enough", "reread", "fold", "keepit", "finish", "cease", "exact"];
  const heads = kind === "zh" ? (which === "caption" ? zhCap : zhTail) : kind === "ja" ? (which === "caption" ? jaCap : jaTail) : which === "caption" ? enCap : enTail;
  if (kind === "zh") return heads.map((head) => (which === "caption" ? `${head}{here}。` : `${head}这一张。`));
  if (kind === "ja") return heads.map((head) => (which === "caption" ? `${head}{here}。` : `${head}この紙。`));
  return heads.map((head) => (which === "caption" ? `${head} {here}.` : `${head} this card.`));
}

function assertFree(list: string[]): void {
  const sorted = [...list].sort();
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startsWith(sorted[i - 1])) throw new Error("成稿里有彼此遮住的句子");
  }
}

export function forgeMedia(brief: Brief, voice: string, author: string, epoch: number, configId: string): MediaBank {
  const kind = languageKind(brief.language || "中文");
  const captions = pairList(kind, "caption");
  const tails = pairList(kind, "tail");
  assertFree(captions);
  assertFree(tails);
  const facts = brief.facts.map((fact) => {
    const motif = MOTIFS[mix(`${fact.anchor}|${epoch}`) % MOTIFS.length];
    return { anchor: fact.anchor, text: fact.text, motif };
  });
  return { voice, author, epoch, persona: brief.persona, language: brief.language, configId, captions, tails, facts };
}

function fill(pattern: string, here: string): string {
  return pattern.replaceAll("{here}", here);
}

type Look = { wash: number; horizon: number; seal: number; mark: number };

function lockedLook(fact: MediaFact, palette: PaletteName): Look {
  const n = mix(`${fact.anchor}|${fact.motif}|${palette}`);
  return { wash: n % 4, horizon: (n >>> 2) % 4, seal: (n >>> 4) % 4, mark: (n >>> 6) % 4 };
}

function motifSvg(motif: Motif, x: number, accent: string, ink: string): string {
  if (motif === "window") {
    return `<g id="window"><rect x="${x}" y="36" width="64" height="86" fill="none" stroke="${ink}" stroke-width="2"/><path d="M${x} 79 H${x + 64} M${x + 32} 36 V122" fill="none" stroke="${accent}" stroke-width="1.5"/></g>`;
  }
  if (motif === "rain") {
    return `<g id="rain"><ellipse cx="${x + 32}" cy="48" rx="34" ry="16" fill="none" stroke="${ink}" stroke-width="2"/><path d="M${x + 12} 74 l-6 22 M${x + 28} 72 l-6 26 M${x + 46} 74 l-6 20" fill="none" stroke="${accent}" stroke-width="1.5"/></g>`;
  }
  if (motif === "key") {
    return `<g id="key"><circle cx="${x + 18}" cy="58" r="14" fill="none" stroke="${ink}" stroke-width="2"/><path d="M${x + 32} 58 H${x + 78} M${x + 62} 58 v12 M${x + 72} 58 v8" fill="none" stroke="${accent}" stroke-width="2"/></g>`;
  }
  return `<g id="boat"><path d="M${x} 96 H${x + 86} L${x + 74} 112 H${x + 12} Z" fill="none" stroke="${ink}" stroke-width="2"/><path d="M${x + 40} 96 V48 M${x + 40} 52 H${x + 68}" fill="none" stroke="${accent}" stroke-width="1.5"/></g>`;
}

function sealSvg(kind: number, accent: string): string {
  if (kind === 0) return `<circle id="seal" cx="286" cy="40" r="10" fill="none" stroke="${accent}" stroke-width="1.5"/>`;
  if (kind === 1) return `<rect id="seal" x="276" y="30" width="20" height="20" fill="none" stroke="${accent}" stroke-width="1.5"/>`;
  if (kind === 2) return `<path id="seal" d="M286 28 l8 14 h-16 z" fill="none" stroke="${accent}" stroke-width="1.5"/>`;
  return `<path id="seal" d="M276 40 H296 M286 30 V50" fill="none" stroke="${accent}" stroke-width="1.5"/>`;
}

function looseExtra(kind: number, accent: string): string {
  if (kind === 0) return `<circle id="shift" cx="160" cy="78" r="16" fill="none" stroke="${accent}"/>`;
  if (kind === 1) return `<rect id="shift" x="148" y="58" width="36" height="24" fill="none" stroke="${accent}"/>`;
  if (kind === 2) return `<path id="shift" d="M140 100 H196" fill="none" stroke="${accent}"/>`;
  return `<path id="shift" d="M168 46 V108" fill="none" stroke="${accent}"/>`;
}

function markSvg(kind: number, ink: string, looseX: number): string {
  const x = 22 + looseX;
  if (kind === 0) return `<circle id="mark" cx="${x}" cy="28" r="3" fill="${ink}"/>`;
  if (kind === 1) return `<rect id="mark" x="${x - 3}" y="25" width="6" height="6" fill="${ink}"/>`;
  if (kind === 2) return `<path id="mark" d="M${x - 4} 31 l4 -8 l4 8 z" fill="${ink}"/>`;
  return `<path id="mark" d="M${x - 5} 28 H${x + 5} M${x} 23 V33" stroke="${ink}" stroke-width="1.5"/>`;
}

export function renderCard(bank: MediaBank, fact: MediaFact, look: Look, caption: string, tail: string): string {
  const config = mediaConfig(bank.configId);
  const palette = PALETTES[config.palette];
  const wash = palette.wash[look.wash];
  const y = HORIZON[look.horizon];
  const motifX = config.density === "loose" ? [36, 176, 112, 48][look.mark] : 46;
  const cap = esc(caption);
  const end = esc(tail);
  const title = esc(fact.anchor);
  const desc = esc(fact.text);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" role="img">` +
    `<title>${title}</title><desc>${desc}</desc>` +
    `<rect width="320" height="200" fill="${palette.bg}"/>` +
    `<rect id="wash" x="16" y="16" width="288" height="128" fill="${wash}"/>` +
    `<line id="h" x1="16" y1="${y}" x2="304" y2="${y}" stroke="${palette.accent}" stroke-width="1.5"/>` +
    motifSvg(fact.motif, motifX, palette.accent, palette.ink) +
    sealSvg(look.seal, palette.accent) +
    markSvg(look.mark, palette.ink, config.density === "loose" ? look.horizon * 6 : 0) +
    (config.density === "loose" ? looseExtra(look.horizon, palette.accent) : "") +
    `<line x1="16" y1="152" x2="304" y2="152" stroke="${palette.ink}" stroke-width="1"/>` +
    `<text id="c" x="20" y="172" font-size="14" fill="${palette.ink}">${cap}</text>` +
    `<text id="t" x="20" y="190" font-size="12" fill="${palette.accent}">${end}</text>` +
    `</svg>`
  );
}

function attr(svg: string, id: string, name: string): string {
  const tag = new RegExp(`<[^>]*id="${id}"[^>]*>`).exec(svg);
  if (!tag) throw new Error("这张卡片对不上成稿");
  const hit = new RegExp(`${name}="([^"]*)"`).exec(tag[0]);
  if (!hit) throw new Error("这张卡片对不上成稿");
  return hit[1];
}

function textOf(svg: string, id: string): string {
  const hit = new RegExp(`<text id="${id}"[^>]*>([^<]*)</text>`).exec(svg);
  if (!hit) throw new Error("这张卡片对不上成稿");
  return unesc(hit[1]);
}

function indexOfValue<T>(list: readonly T[], value: T): number {
  const found = list.indexOf(value);
  if (found < 0) throw new Error("这张卡片对不上成稿");
  return found;
}

export class MediaCodec implements BitLine {
  readonly bytesPerLine: number = 2;
  last: LineMeta = { topicId: "", label: "", phase: "open", focus: "", hint: "", fact: "" };
  private rng: Rng;
  private seq = 0;
  private factIndex = 0;
  private nextIndex = 1;
  private episodeStart = -1;
  private episodeLen = 0;
  private left = 0;

  constructor(
    private readonly bank: MediaBank,
    seed: Uint8Array,
  ) {
    this.rng = new Rng(seed);
    this.bytesPerLine = mediaConfig(bank.configId).density === "still" ? 1 : 2;
  }

  private roll(): void {
    const n = this.bank.facts.length;
    if (this.episodeStart < 0) {
      this.factIndex = this.rng.int(n);
      this.nextIndex = otherFact(this.rng, this.factIndex, -1, n);
    } else {
      const leaving = this.factIndex;
      this.factIndex = this.nextIndex;
      this.nextIndex = otherFact(this.rng, this.factIndex, leaving, n);
    }
    this.episodeLen = episodeLength(this.rng);
    this.left = this.episodeLen;
    this.episodeStart = this.seq;
  }

  private phase(): LineMeta["phase"] {
    const pos = this.seq - this.episodeStart;
    if (pos <= 0) return "open";
    if (pos >= this.episodeLen - 1) return "bridge";
    if (pos === this.episodeLen - 2) return "today";
    return "memory";
  }

  private place(): { fact: MediaFact; next: MediaFact; captions: string[]; tails: string[] } {
    if (this.left <= 0) this.roll();
    const fact = this.bank.facts[this.factIndex];
    const next = this.bank.facts[this.nextIndex];
    const captions = this.bank.captions.map((item) => fill(item, fact.anchor));
    const tails = this.bank.tails.map((item) => fill(item, fact.anchor));
    assertFree(captions);
    assertFree(tails);
    this.last = {
      topicId: fact.anchor,
      label: fact.anchor,
      phase: this.phase(),
      focus: fact.anchor,
      hint: next.anchor,
      fact: fact.text,
    };
    return { fact, next, captions, tails };
  }

  private finish(): void {
    this.left -= 1;
    this.seq += 1;
  }

  private look(index: number, fact: MediaFact): Look {
    const config = mediaConfig(this.bank.configId);
    const base = lockedLook(fact, config.palette);
    if (config.density === "still") return base;
    return {
      wash: piece(index, 6, 2),
      horizon: piece(index, 4, 2),
      seal: piece(index, 2, 2),
      mark: piece(index, 0, 2),
    };
  }

  emit(index: number): string {
    const { fact, captions, tails } = this.place();
    const capShift = this.bytesPerLine === 1 ? 4 : 12;
    const tailShift = this.bytesPerLine === 1 ? 0 : 8;
    const cap = captions[(piece(index, capShift, 4) + rot(this.seq, 3, captions.length)) % captions.length];
    const tail = tails[(piece(index, tailShift, 4) + rot(this.seq, 5, tails.length)) % tails.length];
    const line = renderCard(this.bank, fact, this.look(index, fact), cap, tail);
    this.finish();
    return line;
  }

  absorb(line: string): number {
    const { fact, captions, tails } = this.place();
    const config = mediaConfig(this.bank.configId);
    const palette = PALETTES[config.palette];
    const cap = textOf(line, "c");
    const tail = textOf(line, "t");
    const capAt = captions.indexOf(cap);
    const tailAt = tails.indexOf(tail);
    if (capAt < 0 || tailAt < 0) throw new Error("这张卡片对不上成稿");
    const capShift = this.bytesPerLine === 1 ? 4 : 12;
    const tailShift = this.bytesPerLine === 1 ? 0 : 8;
    let index = ((capAt - rot(this.seq, 3, captions.length) + captions.length) % captions.length) * 2 ** capShift;
    index += ((tailAt - rot(this.seq, 5, tails.length) + tails.length) % tails.length) * 2 ** tailShift;
    const wash = indexOfValue(palette.wash, attr(line, "wash", "fill"));
    const horizon = indexOfValue(HORIZON, Number(attr(line, "h", "y1")));
    const sealTag = /<(circle|rect|path) id="seal"/.exec(line)?.[1] ?? "";
    const seal = ["circle", "rect", "path", "path"].indexOf(sealTag);
    const markTag = /<(circle|rect|path) id="mark"/.exec(line)?.[1] ?? "";
    let mark = ["circle", "rect", "path"].indexOf(markTag);
    if (mark === 2 && /<path id="mark"[^>]*stroke=/.test(line)) mark = 3;
    if (seal < 0 || mark < 0) throw new Error("这张卡片对不上成稿");
    const got = { wash, horizon, seal: seal === 3 ? 2 : seal, mark };
    if (got.seal === 2 && /id="seal" d="[^"]*H296/.test(line)) got.seal = 3;
    const expect = this.look(config.density === "still" ? 0 : index, fact);
    if (config.density === "still") {
      if (got.wash !== expect.wash || got.horizon !== expect.horizon || got.seal !== expect.seal || got.mark !== expect.mark) {
        throw new Error("这张卡片对不上成稿");
      }
    } else {
      index += got.wash * 2 ** 6 + got.horizon * 2 ** 4 + got.seal * 2 ** 2 + got.mark;
    }
    this.finish();
    return index;
  }
}

export function readableCard(svg: string): string {
  const title = unesc(/<title>([^<]*)<\/title>/.exec(svg)?.[1] ?? "");
  const desc = unesc(/<desc>([^<]*)<\/desc>/.exec(svg)?.[1] ?? "");
  const cap = unesc(/<text id="c"[^>]*>([^<]*)<\/text>/.exec(svg)?.[1] ?? "");
  return `${title}。${desc} ${cap}`;
}

function lum(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function skeleton(svg: string): string {
  return svg
    .replace(/<title>[^<]*<\/title>/g, "<title/>")
    .replace(/<desc>[^<]*<\/desc>/g, "<desc/>")
    .replace(/<text id="c"[^>]*>[^<]*<\/text>/g, "<text id=\"c\"/>")
    .replace(/<text id="t"[^>]*>[^<]*<\/text>/g, "<text id=\"t\"/>")
    .replace(/#[0-9a-fA-F]{6}/g, "#")
    .replace(/\d+(?:\.\d+)?/g, "#");
}

export type MediaRow = {
  id: string;
  label: string;
  note: string;
  frames: number;
  completeness: number;
  cipherDistance: number;
  templateRisk: number;
  frameRepeat: number;
  shannon: number;
  gzipRatio: number;
  match: boolean;
};

function contrastOk(svg: string, palette: Palette): boolean {
  const gap = Math.abs(lum(palette.ink) - lum(palette.bg));
  return gap >= 0.45 && svg.includes(`fill="${palette.ink}"`) && svg.includes(`fill="${palette.bg}"`);
}

export async function assessConfig(brief: Brief, configId: string, epoch: number, payload: string): Promise<MediaRow> {
  const config = mediaConfig(configId);
  const bank = forgeMedia(brief, "甲", "甲", epoch, configId);
  const seed = new Uint8Array(32).fill(9);
  const enc = new MediaCodec(bank, seed);
  const pipe = new PhrasePipe(enc, new MediaCodec(bank, seed));
  const frames = pipe.encode(utf8(payload));
  const back = new PhrasePipe(new MediaCodec(bank, seed), new MediaCodec(bank, seed));
  const parts: Uint8Array[] = [];
  for (const frame of frames) {
    for (const part of back.pushLine(frame.line)) parts.push(part);
  }
  const recovered = new TextDecoder().decode(merge(parts));
  const lines = frames.map((frame) => frame.line);
  let ok = 0;
  let total = 0;
  const tick = (pass: boolean) => {
    total += 1;
    if (pass) ok += 1;
  };
  let prev = "";
  let motif = "";
  for (const line of lines) {
    const fact = bank.facts.find((item) => line.includes(`<title>${esc(item.anchor)}</title>`));
    tick(line.startsWith("<svg xmlns=\"http://www.w3.org/2000/svg\"") && line.endsWith("</svg>") && line.includes('viewBox="0 0 320 200"'));
    tick(!/script|foreignObject|onload/i.test(line));
    tick(Boolean(fact) && line.includes(`<desc>${fact ? esc(fact.text) : ""}</desc>`));
    tick(contrastOk(line, PALETTES[config.palette]));
    tick(/<text id="c" x="20" y="172"/.test(line) && /<text id="t" x="20" y="190"/.test(line));
    const cap = textOf(line, "c");
    tick(cap.includes(fact?.anchor ?? "\u0000") && [...cap].length <= 28 && /[。.]/.test(cap));
    const current = /id="(window|rain|key|boat)"/.exec(line)?.[1] ?? "";
    const title = /<title>([^<]*)<\/title>/.exec(line)?.[1] ?? "";
    if (title !== prev) {
      prev = title;
      motif = current;
      tick(true);
    } else tick(current === motif && current.length > 0);
  }
  const wire = utf8(lines.join("\n"));
  const random = new Uint8Array(wire.length);
  for (let i = 0; i < random.length; i++) random[i] = (i * 47 + 13) % 256;
  const wireShannon = shannon(wire);
  const wireGzip = await gzipRatio(wire);
  const wireChi = chiSquareUniform(wire);
  const randShannon = shannon(random);
  const randGzip = await gzipRatio(random);
  const distance = cipherDistance(wireShannon, wireGzip, wireChi);
  const randDistance = cipherDistance(randShannon, randGzip, chiSquareUniform(random));
  const kinds = new Set(lines.map(skeleton));
  const exact = new Set(lines);
  return {
    id: config.id,
    label: config.label,
    note: config.note,
    frames: lines.length,
    completeness: total ? Math.round((100 * ok) / total) : 0,
    cipherDistance: distance,
    templateRisk: Math.round(100 * (1 - kinds.size / lines.length)),
    frameRepeat: Math.round(100 * (1 - exact.size / lines.length)),
    shannon: Math.round(wireShannon * 100) / 100,
    gzipRatio: Math.round(wireGzip * 100) / 100,
    match: recovered === payload && distance > randDistance,
  };
}

function cipherDistance(entropy: number, gzip: number, chi: number): number {
  const s = Math.max(0, Math.min(1, (7.9 - entropy) / 4));
  const g = Math.max(0, Math.min(1, (1 - gzip) / 0.85));
  const c = Math.max(0, Math.min(1, chi / 20000));
  return Math.round(100 * (0.4 * s + 0.35 * g + 0.25 * c));
}

function merge(parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(n);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export type MediaPick = { id: string; label: string; why: string };

function describe(row: MediaRow, role: string): string {
  return `${role}完整度 ${row.completeness}，统计距离 ${row.cipherDistance}（熵 ${row.shannon}，压缩比 ${row.gzipRatio}），模板痕迹 ${row.templateRisk}，相同帧 ${row.frameRepeat}。${row.note}。`;
}

export function recommendMedia(rows: MediaRow[]): MediaPick[] {
  const ok = rows.filter((row) => row.match);
  const still = ok.find((row) => row.id === "still-paper");
  const loose = ok.find((row) => row.id === "loose-ink");
  const series = ok
    .filter((row) => row.id.startsWith("series-"))
    .sort((a, b) => a.templateRisk - b.templateRisk || a.id.localeCompare(b.id));
  const lead = series[0];
  const alt = series[1];
  const picks: MediaPick[] = [];
  if (lead) {
    picks.push({
      id: lead.id,
      label: lead.label,
      why: `${describe(lead, "要看成一套画，用这组。")}${alt ? `${alt.label}是同一结构，只换配色，完整度 ${alt.completeness}，模板痕迹 ${alt.templateRisk}。` : ""}`,
    });
  }
  if (loose) picks.push({ id: loose.id, label: loose.label, why: describe(loose, "怕人拿骨架做比对，用这组。") });
  if (still) picks.push({ id: still.id, label: still.label, why: describe(still, "只防熵和压缩、要画面钉死，用这组。") });
  return picks;
}
