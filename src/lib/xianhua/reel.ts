import { utf8 } from "./bytes";
import type { BitLine, LineMeta } from "./codec";
import { PhrasePipe } from "./codec";
import { Rng } from "./prng";
import { isZh, type Brief } from "./script";

function languageKind(language: string): "zh" | "ja" | "en" | "plain" {
  const name = language.trim().toLowerCase();
  if (isZh(language)) return "zh";
  if (/^(ja|jp|日本語|日语|日語|japanese)$/.test(language.trim())) return "ja";
  if (/^(en|english|英文|英语|英語)$/.test(name)) return "en";
  return "plain";
}

export type Mode = "major" | "minor";

export type ReelBank = {
  voice: string;
  author: string;
  epoch: number;
  persona: string;
  language: string;
  tonic: number;
  mode: Mode;
  keyName: string;
  progression: number;
  bpm: number;
  facts: { anchor: string; text: string }[];
};

type Palette = { bg: string; ink: string; wash: string; line: string };

const MAJOR_PROG = [
  [0, 5, 3, 4],
  [0, 3, 4, 0],
  [1, 4, 0, 0],
  [0, 4, 5, 3],
];
const MINOR_PROG = [
  [0, 5, 3, 4],
  [0, 3, 4, 0],
  [0, 5, 2, 4],
  [0, 6, 3, 4],
];
const RHYTHMS = [
  [2, 2, 2, 2],
  [4, 2, 2],
  [2, 2, 4],
  [3, 1, 2, 2],
];
const KEYS: { name: string; tonic: number; mode: Mode }[] = [
  { name: "C", tonic: 0, mode: "major" },
  { name: "G", tonic: 7, mode: "major" },
  { name: "F", tonic: 5, mode: "major" },
  { name: "A", tonic: 9, mode: "minor" },
  { name: "D", tonic: 2, mode: "minor" },
  { name: "E", tonic: 4, mode: "minor" },
];

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function mix(text: string): number {
  let n = 2166136261;
  for (const ch of text) {
    n ^= ch.codePointAt(0) ?? 0;
    n = Math.imul(n, 16777619);
  }
  return n >>> 0;
}

function preferFlat(tonic: number, mode: Mode): boolean {
  if (mode === "major") return tonic === 5;
  return tonic === 2;
}

export function spell(pc: number, tonic: number, mode: Mode): string {
  const raised = mode === "minor" && pc === (tonic + 11) % 12;
  const names = !raised && preferFlat(tonic, mode) ? FLAT : SHARP;
  return names[((pc % 12) + 12) % 12];
}

export function noteName(midi: number, tonic: number, mode: Mode): string {
  const oct = Math.floor(midi / 12) - 1;
  return `${spell(midi % 12, tonic, mode)}${oct}`;
}

function scalePcs(tonic: number, mode: Mode): number[] {
  const steps = mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  return steps.map((step) => (tonic + step) % 12);
}

function chordPcs(scale: number[], degree: number, tonic: number, mode: Mode): number[] {
  const root = scale[degree];
  let third = scale[(degree + 2) % 7];
  const fifth = scale[(degree + 4) % 7];
  if (mode === "minor" && degree === 4) third = (tonic + 11) % 12;
  return [root, third, fifth];
}

function ladder(scale: number[]): number[] {
  const out: number[] = [];
  for (let midi = 48; midi <= 96; midi++) if (scale.includes(midi % 12)) out.push(midi);
  return out;
}

function stepTo(midi: number, steps: number, scale: number[]): number {
  const notes = ladder(scale);
  let at = notes.indexOf(midi);
  if (at < 0) {
    at = notes.findIndex((item) => item >= midi);
    if (at < 0) at = notes.length - 1;
  }
  const next = Math.max(0, Math.min(notes.length - 1, at + steps));
  return notes[next];
}

function closest(list: number[], prev: number): number {
  return list.slice().sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev) || a - b)[0];
}

function inVoice(midi: number): boolean {
  return midi >= 60 && midi <= 79;
}

function nearChord(prev: number, pcs: number[]): number {
  const pool = ladder(pcs).filter((item) => inVoice(item));
  const close = pool.filter((item) => Math.abs(item - prev) <= 9);
  return closest(close.length ? close : pool, prev);
}

function passingChoices(prev: number, scale: number[]): number[] {
  const preferred = [prev, stepTo(prev, 1, scale), stepTo(prev, -1, scale), stepTo(prev, -2, scale)];
  const near = ladder(scale).filter((midi) => inVoice(midi) && Math.abs(midi - prev) <= 9);
  const spare = near.length >= 4 ? near : ladder(scale).filter((midi) => inVoice(midi));
  const used = new Set<number>();
  return preferred.map((midi) => {
    if (spare.includes(midi) && !used.has(midi)) {
      used.add(midi);
      return midi;
    }
    const next = closest(
      spare.filter((item) => !used.has(item)),
      prev,
    );
    used.add(next);
    return next;
  });
}

function bassPair(pcs: number[], kind: number): [number, number] {
  const low = (pc: number, around: number) => {
    const found: number[] = [];
    for (let midi = 40; midi <= 64; midi++) if (midi % 12 === pc) found.push(midi);
    return closest(found, around);
  };
  const root = low(pcs[0], 48);
  const third = low(pcs[1], root + 3);
  const fifth = low(pcs[2], root + 7);
  const pairs: [number, number][] = [
    [root, fifth],
    [root, root + 12],
    [fifth, root],
    [root, third],
  ];
  return pairs[kind];
}

export type ScoreNote = { midi: number; eighths: number; bass: boolean };

export type BarScore = {
  index: number;
  chord: string;
  notes: ScoreNote[];
  texture: number;
  desc: string;
  lastMidi: number;
};

function eighthLabel(n: number): string {
  if (n % 2 === 0) return String(n / 2);
  return `${n / 2}`;
}

function symbol(root: number, third: number, fifth: number, tonic: number, mode: Mode): string {
  const name = spell(root, tonic, mode);
  const t = (third - root + 12) % 12;
  const f = (fifth - root + 12) % 12;
  if (t === 3 && f === 6) return `${name}dim`;
  if (t === 3) return `${name}m`;
  return name;
}

export function composeBar(bank: ReelBank, index: number, seq: number, prevMidi: number): BarScore {
  const scale = scalePcs(bank.tonic, bank.mode);
  const degrees = (bank.mode === "major" ? MAJOR_PROG : MINOR_PROG)[bank.progression];
  const degree = degrees[seq % degrees.length];
  const pcs = chordPcs(scale, degree, bank.tonic, bank.mode);
  const rhythm = RHYTHMS[index % 4];
  const pass = (index >> 2) % 4;
  const bassKind = (index >> 4) % 4;
  const texture = (index >> 6) % 4;
  const melody: ScoreNote[] = [];
  let cursor = 0;
  let prev = prevMidi;
  let weakUsed = false;
  for (const eighths of rhythm) {
    const strong = cursor % 4 === 0;
    let midi: number;
    if (strong) midi = nearChord(prev, pcs);
    else if (!weakUsed) {
      midi = passingChoices(prev, scale)[pass];
      weakUsed = true;
    } else midi = passingChoices(prev, scale)[0];
    melody.push({ midi, eighths, bass: false });
    prev = midi;
    cursor += eighths;
  }
  const [lowRoot, lowNext] = bassPair(pcs, bassKind);
  const bass: ScoreNote[] = [
    { midi: lowRoot, eighths: 4, bass: true },
    { midi: lowNext, eighths: 4, bass: true },
  ];
  const chord = symbol(pcs[0], pcs[1], pcs[2], bank.tonic, bank.mode);
  const sung = melody.map((note) => `${eighthLabel(note.eighths)}:${noteName(note.midi, bank.tonic, bank.mode)}`).join(" ");
  const low = bass.map((note) => `${eighthLabel(note.eighths)}:${noteName(note.midi, bank.tonic, bank.mode)}`).join(" ");
  const desc = `${bank.keyName} ${bank.mode} · ${chord} · ${sung} · bass ${low}`;
  return { index, chord, notes: [...melody, ...bass], texture, desc, lastMidi: melody[melody.length - 1]?.midi ?? prevMidi };
}

const PAPER: Palette = { bg: "#f3eee4", ink: "#2c2824", wash: "#e4d3bc", line: "#8c4a32" };
const DUSK: Palette = { bg: "#241c22", ink: "#f3eadf", wash: "#3d2e3a", line: "#d08968" };

function esc(value: string): string {
  return value.replaceAll("&", "\u0026amp;").replaceAll("<", "\u0026lt;").replaceAll(">", "\u0026gt;").replaceAll('"', "\u0026quot;");
}

function unesc(value: string): string {
  return value.replaceAll("\u0026quot;", '"').replaceAll("\u0026gt;", ">").replaceAll("\u0026lt;", "<").replaceAll("\u0026amp;", "&");
}

function punctuate(text: string, kind: "zh" | "ja" | "en" | "plain"): string {
  const trimmed = text.trim();
  if (/[。．.!?！？]$/.test(trimmed)) return trimmed;
  if (kind === "zh" || kind === "ja") return `${trimmed}。`;
  return `${trimmed}.`;
}

function stanzaMark(kind: "zh" | "ja" | "en" | "plain", stanza: number): string {
  const n = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"][stanza % 10] ?? String((stanza % 10) + 1);
  if (kind === "zh") return `其${n}`;
  if (kind === "ja") return `その${n}`;
  if (kind === "en") return `Verse ${(stanza % 10) + 1}`;
  return `${(stanza % 10) + 1}`;
}

export function verseLine(
  kind: "zh" | "ja" | "en" | "plain",
  step: number,
  fact: { anchor: string; text: string },
  next: { anchor: string },
): string {
  const here = fact.anchor;
  const opening = fact.text.includes(here) ? fact.text : kind === "en" || kind === "plain" ? `${here}, ${fact.text}` : `${here}，${fact.text}`;
  const open = punctuate(opening, kind);
  if (kind === "zh") {
    const lines = [open, `${here}先停在这一拍。`, `这一拍过去，${here}仍往前。`, `放下${here}，接上${next.anchor}。`];
    return lines[step % 4];
  }
  if (kind === "ja") {
    const lines = [open, `${here}をこの拍で止める。`, `拍が過ぎて、${here}は先へ進む。`, `${here}を置いて、次は${next.anchor}。`];
    return lines[step % 4];
  }
  if (kind === "en") {
    const the = (word: string) => (/^(?:the|a|an)\s/i.test(word) ? word : `the ${word}`);
    const lines = [open, `This bar holds ${the(here)}.`, `Then ${the(here)} moves forward.`, `Leave ${the(here)} for ${the(next.anchor)}.`];
    return lines[step % 4];
  }
  const lines = [open, `${here} rests on this bar.`, `${here} moves on.`, `${here} gives way to ${next.anchor}.`];
  return lines[step % 4];
}

export function castAt(bank: ReelBank, seq: number): {
  fact: { anchor: string; text: string };
  next: { anchor: string; text: string };
  step: number;
  stanza: number;
} {
  const n = bank.facts.length;
  const stanza = Math.floor(seq / 4);
  const fact = bank.facts[stanza % n];
  const next = bank.facts[(stanza + 1) % n];
  return { fact, next, step: seq % 4, stanza };
}

export const VERSE_SAMPLES: { id: string; label: string; language: string; preview: string; brief: string }[] = [
  {
    id: "zh",
    label: "中文",
    language: "中文",
    preview: "放下钥匙，接上轮渡。",
    brief: `人设：四行一节，节节往前。
语言：中文
钥匙｜抽屉里的旧钥匙还在
轮渡｜过江会站在下风的一侧`,
  },
  {
    id: "ja",
    label: "日本語",
    language: "日本語",
    preview: "鍵を置いて、次は船。",
    brief: `人设：四行で一節、次へ進む。
语言：日本語
鍵｜引き出しの古い鍵がまだある
船｜川を渡るときは風下に立つ`,
  },
  {
    id: "en",
    label: "English",
    language: "English",
    preview: "Leave the key for the ferry.",
    brief: `人设：A verse of four lines, then move on.
语言：English
key｜The old key is still in the drawer
ferry｜On the crossing, stand out of the wind`,
  },
];

function grain(kind: number, shift: number, ink: string): string {
  const slide = (shift % 4) * 6;
  if (kind === 0) return `<path id="h" d="M20 ${12 + (slide % 3)} H300 M20 24 H300" fill="none" stroke="${ink}" stroke-width="0.6" opacity="0.35"/>`;
  if (kind === 1) return `<path id="d" d="M${20 + slide} 22 l22 -8 M${70 + slide} 22 l22 -8 M${130 + slide} 22 l22 -8 M${190 + slide} 22 l22 -8" fill="none" stroke="${ink}" stroke-width="0.7" opacity="0.4"/>`;
  if (kind === 2) return `<path id="x" d="M20 10 H300 M20 26 H300 M${40 + slide} 6 V30 M${120 + slide} 6 V30 M${200 + slide} 6 V30" fill="none" stroke="${ink}" stroke-width="0.5" opacity="0.3"/>`;
  return `<g id="dots"><circle cx="${36 + slide}" cy="16" r="1.3" fill="${ink}"/><circle cx="96" cy="16" r="1.3" fill="${ink}"/><circle cx="160" cy="16" r="1.3" fill="${ink}"/><circle cx="224" cy="16" r="1.3" fill="${ink}"/><circle cx="284" cy="16" r="1.3" fill="${ink}"/></g>`;
}

function wrapVerse(line: string, width: number, spaced: boolean): [string, string] {
  const chars = [...line];
  if (chars.length <= width) return [line, ""];
  if (!spaced) return [chars.slice(0, width).join(""), chars.slice(width, width * 2).join("")];
  const words = line.split(" ");
  let first = "";
  let at = 0;
  for (; at < words.length; at++) {
    const next = first ? `${first} ${words[at]}` : words[at];
    if ([...next].length > width && first) break;
    first = next;
  }
  return [first, words.slice(at).join(" ")];
}

export function renderFrame(bank: ReelBank, fact: { anchor: string; text: string }, score: BarScore, seq: number): string {
  const palette = bank.mode === "major" ? PAPER : DUSK;
  const cast = castAt(bank, seq);
  const kind = languageKind(bank.language || "中文");
  const verse = verseLine(kind, cast.step, cast.fact, cast.next);
  const width = kind === "en" || kind === "plain" ? 26 : 16;
  const [first, second] = wrapVerse(verse, width, kind === "en" || kind === "plain");
  const mark = stanzaMark(kind, cast.stanza);
  const body = second
    ? `<text id="verse" x="24" y="102" font-size="18" fill="${palette.ink}">${esc(first)}</text><text id="verse2" x="24" y="130" font-size="18" fill="${palette.ink}">${esc(second)}</text>`
    : `<text id="verse" x="24" y="116" font-size="18" fill="${palette.ink}">${esc(first)}</text>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" role="img">` +
    `<title>${esc(fact.anchor)}</title>` +
    `<desc id="bar">${esc(score.desc)}</desc>` +
    `<rect width="320" height="200" fill="${palette.bg}"/>` +
    grain(score.texture, seq, palette.line) +
    `<line x1="20" y1="36" x2="300" y2="36" stroke="${palette.line}" stroke-width="0.6" opacity="0.7"/>` +
    `<text x="24" y="58" font-size="12" fill="${palette.line}">${esc(mark)}</text>` +
    body +
    `</svg>`
  );
}

export function barDesc(svg: string): string {
  const hit = /<desc id="bar">([^<]*)<\/desc>/.exec(svg);
  if (!hit) throw new Error("这一格没有乐谱");
  return unesc(hit[1]);
}

export function textureOf(svg: string): number {
  if (svg.includes('id="dots"')) return 3;
  if (svg.includes('id="x"')) return 2;
  if (svg.includes('id="d"')) return 1;
  if (svg.includes('id="h"')) return 0;
  throw new Error("这一格没有纹理");
}

const NOTE_RE = /(\d+(?:\.\d+)?):([A-G](?:#|b)?)(-?\d)/g;

export function parseNotes(spec: string, tonic: number, mode: Mode): ScoreNote[] {
  const out: ScoreNote[] = [];
  for (const hit of spec.matchAll(NOTE_RE)) {
    const eighths = Math.round(Number(hit[1]) * 2);
    const pc = [...SHARP, ...FLAT].includes(hit[2]) ? [...SHARP, ...FLAT].indexOf(hit[2]) % 12 : spellBack(hit[2]);
    const oct = Number(hit[3]);
    out.push({ midi: (oct + 1) * 12 + pc, eighths, bass: false });
  }
  return out;
  function spellBack(name: string): number {
    const sharpAt = SHARP.indexOf(name);
    if (sharpAt >= 0) return sharpAt;
    const flatAt = FLAT.indexOf(name);
    if (flatAt >= 0) return flatAt;
    throw new Error("音名对不上");
  }
}

function splitDesc(desc: string): { melody: string; bass: string } {
  const parts = desc.split(" · ");
  return { melody: parts[2] ?? "", bass: (parts[3] ?? "").replace(/^bass /, "") };
}

function readIndex(bank: ReelBank, seq: number, prev: number, desc: string, texture: number): number {
  const { melody } = splitDesc(desc);
  const notes = parseNotes(melody, bank.tonic, bank.mode);
  if (!notes.length) throw new Error("这一格没有旋律");
  const bass = parseNotes(splitDesc(desc).bass, bank.tonic, bank.mode);
  const rhythm = RHYTHMS.findIndex((item) => item.length === notes.length && item.every((eighths, i) => eighths === notes[i].eighths));
  if (rhythm < 0) throw new Error("节奏不在格里");
  const scale = scalePcs(bank.tonic, bank.mode);
  const degrees = (bank.mode === "major" ? MAJOR_PROG : MINOR_PROG)[bank.progression];
  const pcs = chordPcs(scale, degrees[seq % degrees.length], bank.tonic, bank.mode);
  let cursor = 0;
  let before = prev;
  let weak = notes[0].midi;
  for (let i = 0; i < notes.length; i++) {
    if (cursor % 4 !== 0) {
      weak = notes[i].midi;
      break;
    }
    before = notes[i].midi;
    cursor += notes[i].eighths;
  }
  const pass = passingChoices(before, scale).indexOf(weak);
  if (pass < 0) throw new Error("经过音不在音阶上");
  const bassKind = [0, 1, 2, 3].find((kind) => {
    const pair = bassPair(pcs, kind);
    return bass[0]?.midi === pair[0] && bass[1]?.midi === pair[1];
  });
  if (bassKind === undefined) throw new Error("低音不在和弦上");
  return rhythm + pass * 4 + bassKind * 16 + texture * 64;
}

export function forgeReel(brief: Brief, voice: string, author: string, epoch: number): ReelBank {
  const key = KEYS[mix(`${voice}|${epoch}|${brief.persona}`) % KEYS.length];
  const progression = mix(`${author}|${key.name}|${epoch}`) % 4;
  return {
    voice,
    author,
    epoch,
    persona: brief.persona,
    language: brief.language,
    tonic: key.tonic,
    mode: key.mode,
    keyName: key.name,
    progression,
    bpm: 72,
    facts: brief.facts.map((fact) => ({ anchor: fact.anchor, text: fact.text })),
  };
}

const EPISODE_WEIGHTS = [1, 4, 8, 11, 10, 8, 6, 4, 3, 2, 2, 1];

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

export class ReelCodec implements BitLine {
  readonly bytesPerLine = 1;
  last: LineMeta = { topicId: "", label: "", phase: "open", focus: "", hint: "", fact: "" };
  private rng: Rng;
  private seq = 0;
  private factIndex = 0;
  private nextIndex = 1;
  private episodeStart = -1;
  private episodeLen = 0;
  private left = 0;
  private prevMidi: number;

  constructor(
    private readonly bank: ReelBank,
    seed: Uint8Array,
  ) {
    this.rng = new Rng(seed);
    this.prevMidi = 60 + bank.tonic;
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

  private place(): { anchor: string; text: string } {
    const cast = castAt(this.bank, this.seq);
    const phase = cast.step === 0 ? "open" : cast.step === 3 ? "bridge" : "memory";
    this.last = {
      topicId: cast.fact.anchor,
      label: cast.fact.anchor,
      phase,
      focus: cast.fact.anchor,
      hint: cast.next.anchor,
      fact: cast.fact.text,
    };
    return cast.fact;
  }

  private finish(): void {
    this.left -= 1;
    this.seq += 1;
  }

  emit(index: number): string {
    const fact = this.place();
    const score = composeBar(this.bank, index, this.seq, this.prevMidi);
    this.prevMidi = score.lastMidi;
    const line = renderFrame(this.bank, fact, score, this.seq);
    this.finish();
    return line;
  }

  absorb(line: string): number {
    const fact = this.place();
    const desc = barDesc(line);
    const texture = textureOf(line);
    const index = readIndex(this.bank, this.seq, this.prevMidi, desc, texture);
    const score = composeBar(this.bank, index, this.seq, this.prevMidi);
    if (score.desc !== desc || !line.includes(`<title>${esc(fact.anchor)}</title>`)) throw new Error("这一格对不上乐谱");
    this.prevMidi = score.lastMidi;
    this.finish();
    return index;
  }
}

export function lyricText(svg: string): string {
  const first = /<text id="verse"[^>]*>([^<]*)<\/text>/.exec(svg)?.[1] ?? "";
  const second = /<text id="verse2"[^>]*>([^<]*)<\/text>/.exec(svg)?.[1] ?? "";
  return unesc(`${first}${second}`);
}

export function readableBar(svg: string): string {
  return lyricText(svg);
}

export type TheoryReport = { ok: boolean; bars: number; leaps: number; problems: string[] };

export function auditScore(bank: ReelBank, frames: string[]): TheoryReport {
  const problems: string[] = [];
  let prev = 60 + bank.tonic;
  let leaps = 0;
  frames.forEach((frame, seq) => {
    let desc = "";
    try {
      desc = barDesc(frame);
    } catch {
      problems.push("缺乐谱");
      return;
    }
    const { melody } = splitDesc(desc);
    const notes = parseNotes(melody, bank.tonic, bank.mode);
    const sum = notes.reduce((total, note) => total + note.eighths, 0);
    if (sum !== 8) problems.push(`第 ${seq + 1} 小节不是四拍`);
    const scale = scalePcs(bank.tonic, bank.mode);
    const degrees = (bank.mode === "major" ? MAJOR_PROG : MINOR_PROG)[bank.progression];
    const pcs = chordPcs(scale, degrees[seq % degrees.length], bank.tonic, bank.mode);
    const allowed = new Set([...scale, (bank.tonic + 11) % 12]);
    let cursor = 0;
    for (const note of notes) {
      if (!allowed.has(note.midi % 12)) problems.push(`第 ${seq + 1} 小节有音阶外的音`);
      if (cursor % 4 === 0 && !pcs.includes(note.midi % 12)) problems.push(`第 ${seq + 1} 小节强拍不是和弦音`);
      const leap = Math.abs(note.midi - prev);
      if (leap > 9) problems.push(`第 ${seq + 1} 小节跳进过大`);
      if (leap > 7) leaps += 1;
      prev = note.midi;
      cursor += note.eighths;
    }
  });
  return { ok: problems.length === 0, bars: frames.length, leaps, problems: problems.slice(0, 6) };
}

const RATE = 22050;

function freq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function synthBars(descs: string[], bpm: number, rate = RATE): { pcm: Float32Array; rate: number; barSamples: number } {
  const barSamples = Math.round((4 * 60 * rate) / bpm);
  const pcm = new Float32Array(barSamples * descs.length);
  descs.forEach((desc, bar) => {
    const body = splitDesc(desc);
    const melody = parseNotes(body.melody, 0, "major");
    const bass = parseNotes(body.bass, 0, "major");
    write(melody, 0.22, bar);
    write(bass, 0.12, bar);
  });
  let peak = 0;
  for (const sample of pcm) peak = Math.max(peak, Math.abs(sample));
  if (peak > 0.98) {
    const gain = 0.98 / peak;
    for (let i = 0; i < pcm.length; i++) pcm[i] *= gain;
  }
  return { pcm, rate, barSamples };

  function write(notes: ScoreNote[], gain: number, bar: number) {
    let at = bar * barSamples;
    const beat = (60 / bpm) * rate;
    for (const note of notes) {
      const len = Math.round((note.eighths / 2) * beat);
      const f = freq(note.midi);
      for (let i = 0; i < len && at + i < pcm.length; i++) {
        const t = i / rate;
        const dur = len / rate;
        const attack = Math.min(1, t / 0.02);
        const release = Math.min(1, (dur - t) / 0.06);
        const env = Math.max(0, Math.min(attack, release));
        const phase = (f * t) % 1;
        const tri = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
        pcm[at + i] += tri * env * gain;
      }
      at += len;
    }
  }
}

export function wavBytes(pcm: Float32Array, rate: number): Uint8Array {
  const header = 44;
  const out = new Uint8Array(header + pcm.length * 2);
  const view = new DataView(out.buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) out[offset + i] = text.charCodeAt(i);
  };
  write(0, "RIFF");
  view.setUint32(4, out.length - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const x = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(header + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return out;
}

export async function proveReel(brief: Brief, epoch: number, payload: string): Promise<{ match: boolean; theory: TheoryReport }> {
  const bank = forgeReel(brief, "甲", "甲", epoch);
  const seed = new Uint8Array(32).fill(6);
  const send = new PhrasePipe(new ReelCodec(bank, seed), new ReelCodec(bank, seed));
  const recv = new PhrasePipe(new ReelCodec(bank, seed), new ReelCodec(bank, seed));
  const frames = send.encode(utf8(payload));
  const parts: Uint8Array[] = [];
  for (const frame of frames) for (const part of recv.pushLine(frame.line)) parts.push(part);
  const recovered = new TextDecoder().decode(merge(parts));
  return { match: recovered === payload, theory: auditScore(bank, frames.map((frame) => frame.line)) };
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
