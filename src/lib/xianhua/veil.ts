import { text, utf8 } from "./bytes";
import { Codec, PhrasePipe, type BitLine, type LineMeta } from "./codec";
import { forgeNotes, forgeNotesRemote, forgeSpeech, forgeSpeechRemote, reviewCoherence, type Coherence } from "./foundry";
import { MEDIA_CONFIGS, MediaCodec, assessConfig, forgeMedia, readableCard, recommendMedia, type MediaPick, type MediaRow } from "./media";
import { ReelCodec, auditScore, forgeReel, readableBar } from "./reel";
import { Rng } from "./prng";
import {
  fingerprint,
  hitsPublicScript,
  languageOf,
  parseBrief,
  type Brief,
  type ProgramCard,
  type Quad,
  type SpeechBank,
} from "./script";
import type { FrozenSurface } from "./surface";

export type Posture = "none" | "one" | "both";
export type Dialect = "speech" | "program" | "media" | "reel";

const EPISODE_WEIGHTS = [1, 4, 8, 11, 10, 8, 6, 4, 3, 2, 2, 1];
const ORDERS = [
  ["opener", "mood", "a", "b", "tail"],
  ["opener", "a", "mood", "b", "tail"],
  ["opener", "mood", "b", "a", "tail"],
  ["opener", "a", "b", "mood", "tail"],
] as const;

type SlotName = (typeof ORDERS)[number][number];

const SHIFT: Record<SlotName, number> = { opener: 12, mood: 8, a: 6, b: 4, tail: 0 };
const BITS: Record<SlotName, number> = { opener: 4, mood: 4, a: 2, b: 2, tail: 4 };
const SALT: Record<SlotName, number> = { opener: 3, mood: 5, a: 7, b: 11, tail: 13 };

type Phase = "open" | "memory" | "today" | "bridge";

function piece(n: number, shift: number, width: number): number {
  return Math.floor(n / 2 ** shift) % 2 ** width;
}

function rot(seq: number, salt: number, n: number): number {
  if (n <= 1) return 0;
  return (Math.imul(seq + 1, salt) >>> 0) % n;
}

function take(line: string, options: string[]): { index: number; rest: string } {
  let best = -1;
  let bestLen = -1;
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    if (line.startsWith(opt) && opt.length > bestLen) {
      best = i;
      bestLen = opt.length;
    }
  }
  if (best < 0) throw new Error("这句对不上成稿");
  return { index: best, rest: line.slice(options[best].length) };
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

function assertFree(list: string[]): void {
  const sorted = [...list].sort();
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startsWith(sorted[i - 1])) throw new Error("成稿里有彼此遮住的句子");
  }
}

function fill(pattern: string, here: string, next: string): string {
  return pattern.replaceAll("{here}", here).replaceAll("{next}", next);
}

export class PrivateCodec implements BitLine {
  readonly bytesPerLine = 2;
  last: LineMeta = { topicId: "", label: "", phase: "open", focus: "", hint: "", fact: "" };
  private rng: Rng;
  private seq = 0;
  private factIndex = 0;
  private nextIndex = 1;
  private episodeStart = -1;
  private episodeLen = 0;
  private left = 0;

  constructor(
    private readonly bank: SpeechBank,
    seed: Uint8Array,
  ) {
    this.rng = new Rng(seed);
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

  private phase(): Phase {
    const pos = this.seq - this.episodeStart;
    if (pos <= 0) return "open";
    if (pos >= this.episodeLen - 1) return "bridge";
    if (pos === this.episodeLen - 2) return "today";
    return "memory";
  }

  private lists(): Record<SlotName, string[]> {
    if (this.left <= 0) this.roll();
    const fact = this.bank.facts[this.factIndex];
    const next = this.bank.facts[this.nextIndex];
    const phase = this.phase();
    const skin = fact[phase];
    this.last = {
      topicId: fact.anchor,
      label: fact.anchor,
      phase,
      focus: fact.anchor,
      hint: next.anchor,
      fact: fact.text,
    };
    const here = fact.anchor;
    const hint = next.anchor;
    const slots = {
      opener: this.bank.openers,
      mood: this.bank.moods,
      a: skin.a.map((item) => fill(item, here, hint)),
      b: skin.b.map((item) => fill(item, here, hint)),
      tail: this.bank.tails,
    };
    assertFree(slots.a);
    assertFree(slots.b);
    return slots;
  }

  private finish(): void {
    this.left -= 1;
    this.seq += 1;
  }

  emit(index: number): string {
    const slots = this.lists();
    const order = ORDERS[this.seq % ORDERS.length];
    let line = "";
    for (const name of order) {
      const list = slots[name];
      const logical = piece(index, SHIFT[name], BITS[name]);
      const opt = (logical + rot(this.seq, SALT[name], list.length)) % list.length;
      line += list[opt];
    }
    this.finish();
    return line;
  }

  absorb(line: string): number {
    const slots = this.lists();
    const order = ORDERS[this.seq % ORDERS.length];
    let rest = line;
    let index = 0;
    for (const name of order) {
      const list = slots[name];
      const got = take(rest, list);
      rest = got.rest;
      const logical = (got.index - rot(this.seq, SALT[name], list.length) + list.length) % list.length;
      index += logical * 2 ** SHIFT[name];
    }
    if (rest.length !== 0) throw new Error("这句对不上成稿");
    this.finish();
    return index;
  }
}

type ProgramState = { seq: number; req: number; at: number };

function cursorAt(seed: Uint8Array, dir: string, seq: number): string {
  const alphabet = "0123456789abcdefghij";
  let n = 2166136261 ^ dir.charCodeAt(0);
  for (let i = 0; i < seed.length; i++) {
    n ^= seed[i];
    n = Math.imul(n, 16777619);
  }
  n ^= seq + 1;
  let out = "c.";
  for (let i = 0; i < 10; i++) {
    n = Math.imul(n ^ (i + 9), 16777619);
    out += alphabet[(n >>> 0) % alphabet.length];
  }
  return out;
}

export class ProgramCodec implements BitLine {
  readonly bytesPerLine = 1;
  last: LineMeta = { topicId: "", label: "", phase: "open", focus: "", hint: "", fact: "" };
  private state: ProgramState;

  constructor(
    private readonly card: ProgramCard,
    private readonly notes: string[],
    private readonly dir: "c2s" | "s2c",
    private readonly seed: Uint8Array,
    private readonly respond: boolean,
  ) {
    if (notes.length !== 16) throw new Error("附言要十六条");
    const origin = 2400 + (((seed[0] << 8) | seed[1]) % 7000);
    this.state = { seq: 0, req: origin, at: 1_730_000_000 + seed[3] * 3600 + (dir === "s2c" ? 40 : 0) };
  }

  private material(): Record<string, string | number | boolean> {
    const keys = this.card.keys;
    const seq = this.state.seq;
    const body: Record<string, string | number | boolean> = {};
    body[keys.op] = "";
    body[keys.shelf] = "";
    body[keys.req] = this.state.req;
    body[keys.cursor] = cursorAt(this.seed, this.dir, seq);
    body[keys.at] = this.state.at;
    body[keys.note] = "";
    if (this.respond) body[keys.ok] = true;
    return body;
  }

  private advance(): void {
    const step = 2 + (this.seed[(this.state.seq + this.dir.length) % this.seed.length] % 5);
    this.state.seq += 1;
    this.state.req += 1;
    this.state.at += step;
  }

  private paint(index: number, into: Record<string, string | number | boolean>): void {
    const n = index & 255;
    const op = piece(n, 6, 2);
    const shelf = piece(n, 4, 2);
    const note = piece(n, 0, 4);
    const seq = this.state.seq;
    const keys = this.card.keys;
    into[keys.op] = this.card.ops[(op + rot(seq, 3, 4)) % 4];
    into[keys.shelf] = this.card.shelves[(shelf + rot(seq, 5, 4)) % 4];
    into[keys.note] = this.notes[(note + rot(seq, 7, 16)) % 16];
    this.last = {
      topicId: this.card.keys.op,
      label: this.respond ? "响应" : "请求",
      phase: "today",
      focus: String(into[keys.op]),
      hint: String(into[keys.req]),
      fact: String(into[keys.note]),
    };
  }

  emit(index: number): string {
    const body = this.material();
    this.paint(index, body);
    const line = JSON.stringify(body);
    this.advance();
    return line;
  }

  absorb(line: string): number {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error("这行不是程序的说法");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("这行不是程序的说法");
    const got = parsed as Record<string, unknown>;
    const expect = this.material();
    const gotKeys = Object.keys(got);
    const expectKeys = Object.keys(expect);
    if (gotKeys.length !== expectKeys.length || gotKeys.some((key, i) => key !== expectKeys[i])) {
      throw new Error("字段或顺序变了");
    }
    const keys = this.card.keys;
    if (got[keys.req] !== expect[keys.req]) throw new Error("计数没有接上");
    if (got[keys.cursor] !== expect[keys.cursor]) throw new Error("游标换了写法");
    if (got[keys.at] !== expect[keys.at]) throw new Error("时钟断了");
    if (this.respond && got[keys.ok] !== true) throw new Error("结果字段变了");
    const seq = this.state.seq;
    const op = logicalOf(got[keys.op], this.card.ops, rot(seq, 3, 4));
    const shelf = logicalOf(got[keys.shelf], this.card.shelves, rot(seq, 5, 4));
    const note = logicalOf(String(got[keys.note] ?? ""), this.notes, rot(seq, 7, 16));
    this.paint((op << 6) | (shelf << 4) | note, expect);
    this.advance();
    return (op << 6) | (shelf << 4) | note;
  }
}

function logicalOf(value: unknown, list: readonly string[], turn: number): number {
  const found = list.indexOf(String(value));
  if (found < 0) throw new Error("取值跑出了这版合同");
  return (found - turn + list.length) % list.length;
}

export type Continuity = { ok: boolean; notes: string[] };

export function inspectProgram(lines: { dir: string; text: string }[], card: ProgramCard): Continuity {
  const notes: string[] = [];
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line.text);
    } catch {
      return { ok: false, notes: ["有一行不是程序的说法"] };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, notes: ["有一行不是对象"] };
    const list = groups.get(line.dir) ?? [];
    list.push(parsed as Record<string, unknown>);
    groups.set(line.dir, list);
  }
  const requestKeys = [card.keys.op, card.keys.shelf, card.keys.req, card.keys.cursor, card.keys.at, card.keys.note];
  const responseKeys = [...requestKeys, card.keys.ok];
  let echoed = true;
  const reqs = new Map<string, number[]>();
  for (const [dir, list] of groups) {
    const expectKeys = dir === "乙" ? responseKeys : requestKeys;
    const keyText = expectKeys.join(" ");
    if (list.some((row) => Object.keys(row).join(" ") !== keyText)) {
      notes.push(`${dir}的字段或顺序中途变了`);
    } else {
      notes.push(`${dir}每一句的字段都是 ${keyText}`);
    }
    const cursors = list.map((row) => String(row[card.keys.cursor]));
    const clocks = list.map((row) => row[card.keys.at]);
    const req = list.map((row) => row[card.keys.req]);
    reqs.set(dir, req.filter((item): item is number => typeof item === "number"));
    if (cursors.some((cursor) => !/^c\.[0-9a-j]{10}$/.test(cursor))) notes.push(`${dir}的游标换了字母表或长度`);
    else notes.push(`${dir}的游标始终是 c. 加十位，只换字符`);
    if (clocks.some((item) => typeof item !== "number")) notes.push(`${dir}的时钟改了类型`);
    else if (clocks.some((item, i) => i > 0 && (item as number) <= (clocks[i - 1] as number))) notes.push(`${dir}的时钟没有只增`);
    else notes.push(`${dir}的时钟只增不减`);
    if (req.some((item, i) => typeof item !== "number" || (i > 0 && item !== (req[i - 1] as number) + 1))) {
      notes.push(`${dir}的计数没有逐句加一`);
    } else notes.push(`${dir}的计数逐句加一`);
    if (list.some((row) => !card.ops.includes(String(row[card.keys.op]) as Quad[number]))) notes.push(`${dir}的操作跑出了取值表`);
    if (list.some((row) => !card.shelves.includes(String(row[card.keys.shelf]) as Quad[number]))) {
      notes.push(`${dir}的分类跑出了取值表`);
    }
    const noteLens = list.map((row) => String(row[card.keys.note] ?? "").length);
    notes.push(`${dir}的附言长度在 ${Math.min(...noteLens)} 到 ${Math.max(...noteLens)} 之间`);
    if (dir === "乙" && list.some((row) => row[card.keys.ok] !== true)) notes.push("结果字段没有守住");
    if (dir === "乙") notes.push(`结果字段 ${card.keys.ok} 恒为真`);
  }
  const left = reqs.get("甲") ?? [];
  const right = reqs.get("乙") ?? [];
  const n = Math.min(left.length, right.length);
  for (let i = 0; i < n; i++) if (left[i] !== right[i]) echoed = false;
  if (n > 0) notes.push(echoed ? "同一序号上，响应的计数就是请求的计数" : "响应没有把请求的计数带回");
  const leftCursor = groups.get("甲")?.[0]?.[card.keys.cursor];
  const rightCursor = groups.get("乙")?.[0]?.[card.keys.cursor];
  if (typeof leftCursor === "string" && leftCursor === rightCursor) notes.push("两个方向的游标不该相同");
  else if (typeof leftCursor === "string") notes.push("两个方向的游标彼此不同");
  const bad = notes.some((note) => /变了|跑出|没有|断了|改了|不是|换了|不该/.test(note));
  return { ok: !bad && echoed, notes };
}

export type AuditSample = { dir: string; text: string; anchor: string; token: string; phase: string; fact: string };

export type AuditReport = {
  posture: Posture;
  dialect: Dialect;
  pen: string;
  warning: string;
  match: boolean;
  recovered: string;
  epoch: number;
  fingerprints: { voice: string; author: string; hex: string }[];
  publicHits: number;
  lineCount: number;
  continuity: Continuity;
  samples: AuditSample[];
  verdict: string;
  frozen: FrozenSurface | null;
  language: string;
  coherence: Coherence;
  mediaBoard: MediaRow[] | null;
  mediaPicks: MediaPick[] | null;
};

type Round = { lines: AuditSample[]; recovered: string; match: boolean };

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

function dirSeed(seed: Uint8Array, dir: string): Uint8Array {
  const out = new Uint8Array(seed);
  out[31] ^= dir.charCodeAt(0);
  return out;
}

function roundtrip(dir: string, make: () => BitLine, payload: string): Round {
  const sender = new PhrasePipe(make(), make());
  const frames = sender.encode(utf8(payload));
  const receiver = new PhrasePipe(make(), make());
  const parts: Uint8Array[] = [];
  for (const frame of frames) {
    for (const part of receiver.pushLine(frame.line)) parts.push(part);
  }
  const recovered = text(merge(parts));
  return {
    lines: frames.map((frame) => ({
      dir,
      text: frame.line,
      anchor: frame.meta.label,
      token: frame.meta.focus,
      phase: frame.meta.phase,
      fact: frame.meta.fact,
    })),
    recovered,
    match: recovered === payload,
  };
}

function speechContinuity(lines: AuditSample[]): Continuity {
  const notes: string[] = [];
  const client = lines.filter((line) => line.dir === "甲");
  const finished: number[] = [];
  let count = 0;
  let prev = "";
  let drifted = false;
  for (const line of client) {
    if (!line.text.includes(line.token)) drifted = true;
    if (line.anchor !== prev) {
      if (count) finished.push(count);
      prev = line.anchor;
      count = 1;
    } else count++;
  }
  if (finished.some((len) => len < 4)) drifted = true;
  notes.push(finished.length ? `甲在一件事上连续说 ${finished.join("、")} 句，再换下一件` : "这段还没说完一件事");
  notes.push(drifted ? "有的句子没有咬住这一段点名的事物" : "每一句都咬住这一段点名的事物");
  const bridges = client.filter((line) => line.phase === "bridge").length;
  notes.push(bridges ? `其中 ${bridges} 句在把话头交给下一件` : "样本里还没有走到换题");
  return { ok: !drifted && finished.every((len) => len >= 4), notes };
}

export async function walkAudit(opts: {
  posture: Posture;
  dialect: Dialect;
  briefText: string;
  card: ProgramCard;
  epoch: number;
  payload: string;
  language?: string;
  mediaId?: string;
  remote?: { url: string; model: string } | null;
}): Promise<AuditReport> {
  const epoch = Math.max(1, Math.floor(opts.epoch) || 1);
  const payload = opts.payload;
  if (!payload.trim()) throw new Error("原文是空的");
  const language = (opts.language?.trim() || languageOf(opts.briefText) || "中文").slice(0, 40);
  const remote = opts.remote?.url.trim() ? opts.remote : null;
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  let warning = "";
  let pen = "公开剧本";

  const finish = async (report: Omit<AuditReport, "language" | "coherence">): Promise<AuditReport> => {
    let coherence: Coherence = { asked: false, ok: null, notes: [] };
    if (remote) {
      try {
        coherence = await reviewCoherence(
          remote.url.trim(),
          remote.model.trim() || "local",
          language,
          report.samples.map((sample) =>
            report.dialect === "media" ? readableCard(sample.text) : report.dialect === "reel" ? readableBar(sample.text) : sample.text,
          ),
        );
      } catch (err) {
        coherence = { asked: true, ok: null, notes: [err instanceof Error ? err.message : "模型没有审完"] };
      }
    }
    return { ...report, language, coherence };
  };

  if (opts.dialect === "speech" && opts.posture === "none") {
    const gone = roundtrip("甲", () => new Codec("talk", dirSeed(seed, "甲")), payload);
    const back = roundtrip("乙", () => new Codec("talk", dirSeed(seed, "乙")), payload);
    const lines = [...gone.lines, ...back.lines];
    const publicHits = lines.filter((line) => hitsPublicScript(line.text)).length;
    return finish({
      posture: opts.posture,
      dialect: opts.dialect,
      pen,
      warning,
      match: gone.match && back.match,
      recovered: gone.recovered,
      epoch,
      fingerprints: [],
      publicHits,
      lineCount: lines.length,
      continuity: speechContinuity(lines),
      samples: lines.slice(0, 8),
      verdict: `公开话题表对上了 ${publicHits} 句。程序在观察者手里时，这些句子可以被指认，长期读也会看见同一套饭桌和通勤。`,
      frozen: null,
      mediaBoard: null,
      mediaPicks: null,
    });
  }

  const brief = parseBrief(opts.briefText);
  brief.language = language;
  const voices: { voice: string; author: string }[] =
    opts.posture === "one"
      ? [
          { voice: "甲", author: "甲" },
          { voice: "乙", author: "甲" },
        ]
      : opts.posture === "both"
        ? [
            { voice: "甲", author: "甲" },
            { voice: "乙", author: "乙" },
          ]
        : [{ voice: "合", author: "私稿" }];

  if (opts.dialect === "reel") {
    const banks = voices.map((voice) => forgeReel(brief, voice.voice, voice.author, epoch));
    const bankFor = (dir: "甲" | "乙") => (opts.posture === "none" ? banks[0] : dir === "甲" ? banks[0] : banks[1]);
    const gone = roundtrip("甲", () => new ReelCodec(bankFor("甲"), dirSeed(seed, "甲")), payload);
    const back = roundtrip("乙", () => new ReelCodec(bankFor("乙"), dirSeed(seed, "乙")), payload);
    const lines = [...gone.lines, ...back.lines];
    const theory = auditScore(bankFor("甲"), gone.lines.map((line) => line.text));
    pen = "影像成稿";
    return finish({
      posture: opts.posture,
      dialect: opts.dialect,
      pen,
      warning: theory.ok ? warning : theory.problems.join(" "),
      match: gone.match && back.match,
      recovered: gone.recovered,
      epoch,
      fingerprints: banks.map((bank) => ({ voice: bank.voice, author: bank.author, hex: fingerprint(bank) })),
      publicHits: lines.filter((line) => hitsPublicScript(line.text)).length,
      lineCount: lines.length,
      continuity: speechContinuity(lines),
      samples: gone.lines.slice(0, 8),
      verdict: theory.ok
        ? `${bankFor("甲").keyName} ${bankFor("甲").mode === "major" ? "大调" : "小调"}。表面上是歌词，四行一节，第四节把话交给下一件。乐谱只在底下垫着，不写在画面上。`
        : "这版乐谱有格子站不稳。",
      frozen: {
        v: 1,
        dialect: "reel",
        epoch,
        posture: opts.posture,
        language,
        card: opts.card,
        reel: { c2s: bankFor("甲"), s2c: bankFor("乙") },
      },
      mediaBoard: null,
      mediaPicks: null,
    });
  }

  if (opts.dialect === "media") {
    const configId = MEDIA_CONFIGS.some((item) => item.id === opts.mediaId) ? (opts.mediaId as string) : "series-dusk";
    const banks = voices.map((voice) => forgeMedia(brief, voice.voice, voice.author, epoch, configId));
    const bankFor = (dir: "甲" | "乙") => (opts.posture === "none" ? banks[0] : dir === "甲" ? banks[0] : banks[1]);
    const gone = roundtrip("甲", () => new MediaCodec(bankFor("甲"), dirSeed(seed, "甲")), payload);
    const back = roundtrip("乙", () => new MediaCodec(bankFor("乙"), dirSeed(seed, "乙")), payload);
    const lines = [...gone.lines, ...back.lines];
    const mediaBoard = [];
    for (const item of MEDIA_CONFIGS) mediaBoard.push(await assessConfig(brief, item.id, epoch, payload));
    const mediaPicks = recommendMedia(mediaBoard);
    pen = "媒体成稿";
    return finish({
      posture: opts.posture,
      dialect: opts.dialect,
      pen,
      warning,
      match: gone.match && back.match,
      recovered: gone.recovered,
      epoch,
      fingerprints: banks.map((bank) => ({ voice: bank.voice, author: bank.author, hex: fingerprint(bank) })),
      publicHits: lines.filter((line) => hitsPublicScript(line.text)).length,
      lineCount: lines.length,
      continuity: speechContinuity(lines),
      samples: [...gone.lines.slice(0, 4), ...back.lines.slice(0, 2)],
      verdict: "四组卡片都能读完，统计上都离密文很远。差别在模板痕迹，不在像不像噪声。",
      frozen: {
        v: 1,
        dialect: "media",
        epoch,
        posture: opts.posture,
        language,
        card: opts.card,
        media: { configId, c2s: bankFor("甲"), s2c: bankFor("乙") },
      },
      mediaBoard,
      mediaPicks,
    });
  }

  if (opts.dialect === "speech") {
    const banks: SpeechBank[] = [];
    for (const voice of voices) {
      if (remote && opts.posture !== "none") {
        try {
          banks.push(await forgeSpeechRemote(remote.url.trim(), remote.model.trim() || "local", brief, voice.voice, voice.author, epoch));
          pen = "本地模型";
          continue;
        } catch (err) {
          warning = err instanceof Error ? err.message : "本地模型没有写成";
        }
      }
      banks.push(forgeSpeech(brief, voice.voice, voice.author, epoch));
      if (pen !== "本地模型") pen = "私稿拼接";
    }
    const bankFor = (dir: "甲" | "乙") => (opts.posture === "none" ? banks[0] : dir === "甲" ? banks[0] : banks[1]);
    const gone = roundtrip("甲", () => new PrivateCodec(bankFor("甲"), dirSeed(seed, "甲")), payload);
    const back = roundtrip("乙", () => new PrivateCodec(bankFor("乙"), dirSeed(seed, "乙")), payload);
    const lines = [...gone.lines, ...back.lines];
    const publicHits = lines.filter((line) => hitsPublicScript(line.text)).length;
    const used = opts.posture === "none" ? [banks[0]] : banks;
    return finish({
      posture: opts.posture,
      dialect: opts.dialect,
      pen,
      warning,
      match: gone.match && back.match,
      recovered: gone.recovered,
      epoch,
      fingerprints: used.map((bank) => ({
        voice: bank.voice,
        author: bank.author,
        hex: fingerprint(bank),
      })),
      publicHits,
      lineCount: lines.length,
      continuity: speechContinuity(lines),
      samples: [...gone.lines.slice(0, 6), ...back.lines.slice(0, 4)],
      verdict: speechVerdict(opts.posture, publicHits, pen, warning),
      frozen: {
        v: 1,
        dialect: "speech",
        epoch,
        posture: opts.posture,
        language,
        card: opts.card,
        speech: { c2s: bankFor("甲"), s2c: bankFor("乙") },
      },
      mediaBoard: null,
      mediaPicks: null,
    });
  }

  const noteSets: { voice: string; author: string; notes: string[] }[] = [];
  for (const voice of voices) {
    if (remote && opts.posture !== "none") {
      try {
        const notes = await forgeNotesRemote(remote.url.trim(), remote.model.trim() || "local", brief, voice.voice, voice.author, epoch);
        noteSets.push({ ...voice, notes });
        pen = "本地模型";
        continue;
      } catch (err) {
        warning = err instanceof Error ? err.message : "本地模型没有写成";
      }
    }
    noteSets.push({
      ...voice,
      notes: forgeNotes(brief, voice.voice, voice.author, epoch, opts.posture !== "none"),
    });
    if (pen !== "本地模型") pen = opts.posture === "none" ? "私稿原文" : "私稿拼接";
  }
  const notesFor = (dir: "甲" | "乙") => (opts.posture === "none" ? noteSets[0].notes : dir === "甲" ? noteSets[0].notes : noteSets[1].notes);
  const respond = { 甲: false, 乙: true } as const;
  const gone = roundtrip("甲", () => new ProgramCodec(opts.card, notesFor("甲"), "c2s", seed, respond["甲"]), payload);
  const back = roundtrip("乙", () => new ProgramCodec(opts.card, notesFor("乙"), "s2c", seed, respond["乙"]), payload);
  const lines = [...gone.lines, ...back.lines];
  const continuity = inspectProgram(lines, opts.card);
  const publicHits = lines.filter((line) => hitsPublicScript(line.text)).length;
  const shown = interleave(gone.lines, back.lines, 4);
  return finish({
    posture: opts.posture,
    dialect: opts.dialect,
    pen,
    warning,
    match: gone.match && back.match,
    recovered: gone.recovered,
    epoch,
    fingerprints: noteSets.map((set) => ({
      voice: set.voice,
      author: set.author,
      hex: fingerprint({ card: opts.card.keys, notes: set.notes, epoch, voice: set.voice, author: set.author }),
    })),
    publicHits,
    lineCount: lines.length,
    continuity,
    samples: shown,
    verdict: programVerdict(opts.posture, continuity.ok, publicHits, pen),
    frozen: {
      v: 1,
      dialect: "program",
      epoch,
      posture: opts.posture,
      language,
      card: opts.card,
      notes: { c2s: notesFor("甲"), s2c: notesFor("乙") },
    },
    mediaBoard: null,
    mediaPicks: null,
  });
}

function interleave(left: AuditSample[], right: AuditSample[], pairs: number): AuditSample[] {
  const out: AuditSample[] = [];
  for (let i = 0; i < pairs && (i < left.length || i < right.length); i++) {
    if (left[i]) out.push(left[i]);
    if (right[i]) out.push(right[i]);
  }
  return out;
}

function speechVerdict(posture: Posture, publicHits: number, pen: string, warning: string): string {
  const who =
    posture === "one"
      ? "只有一端有模型：这一端把甲、乙两套口气都写好，对端只保存成稿。"
      : posture === "both"
        ? "两端都有模型：各写自己的出站口气，再把成稿交给对方。解码用的是对方冻住的那一版。"
        : "没有模型：两套口气都由私稿拼接，仍然不读取程序里的话题表。";
  const model = warning ? `本地模型这次没接上（${warning}），已改用私稿拼接。` : `这一版由${pen}写成，写完即冻住，线上不再问模型。`;
  return `${who}${model}公开话题表对上 ${publicHits} 句。观察者拿着程序，也看不到这些句子从哪张表里来。同一纪元用久了仍会循环，换纪元就换表面，协议不动。`;
}

function programVerdict(posture: Posture, ok: boolean, publicHits: number, pen: string): string {
  const shape = ok ? "字段、类型、计数、游标和时钟都守住了。" : "格式连续性有一处没守住。";
  const who =
    posture === "none"
      ? "没有模型时，一个方向只用一个程序名，附言是它的子命令，偶尔夹一条 tail 或 ls。"
      : posture === "one"
        ? "一端把两套命令写好交给对端。每套守住自己的程序名，模型不许改字段，也不许写成句子。"
        : "两端各写自己方向的命令，各用各的程序名，字段仍是同一套。";
  return `${shape}${who}这一版由${pen}填附言。公开话题表对上 ${publicHits} 句。`;
}
