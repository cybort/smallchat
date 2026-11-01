import { Rng } from "./prng";
import { TOPICS, slotLists, type Phase, type SlotLists, type Topic } from "./topics";

export type CodecMode = "talk" | "dense";

export type LineMeta = {
  topicId: string;
  label: string;
  phase: Phase;
  focus: string;
  hint: string;
  fact: string;
};

type State = {
  mode: CodecMode;
  rng: Rng;
  seq: number;
  topicIndex: number;
  nextTopicIndex: number;
  focusIndex: number;
  episodeStart: number;
  episodeLen: number;
  left: number;
};

/** Uneven so a histogram of topic runs is not a flat 6–12. Sum is 60. */
const EPISODE_WEIGHTS = [1, 4, 8, 11, 10, 8, 6, 4, 3, 2, 2, 1];

type SlotName = keyof SlotLists;

const TALK_ORDER: SlotName[][] = [
  ["opener", "mood", "a", "b", "tail"],
  ["opener", "a", "mood", "b", "tail"],
  ["opener", "mood", "b", "a", "tail"],
  ["opener", "a", "b", "mood", "tail"],
];

const SHIFT: Record<SlotName, number> = {
  opener: 12,
  mood: 8,
  a: 6,
  b: 4,
  tail: 0,
  conn: 28,
  ea: 24,
  eb: 20,
  ec: 16,
};

const BITS: Record<SlotName, number> = {
  opener: 4,
  mood: 4,
  a: 2,
  b: 2,
  tail: 4,
  conn: 4,
  ea: 4,
  eb: 4,
  ec: 4,
};

const SALT: Record<SlotName, number> = {
  opener: 3,
  mood: 5,
  a: 7,
  b: 11,
  tail: 13,
  conn: 17,
  ea: 19,
  eb: 23,
  ec: 29,
};

function episodeLength(rng: Rng): number {
  let x = rng.int(60);
  for (let i = 0; i < EPISODE_WEIGHTS.length; i++) {
    if (x < EPISODE_WEIGHTS[i]) return 4 + i;
    x -= EPISODE_WEIGHTS[i];
  }
  return 8;
}

/** Uniform over topics that are neither the current one nor the one just left. */
function otherTopic(rng: Rng, current: number, previous: number, n: number): number {
  const banned = new Set<number>([current]);
  if (previous >= 0 && previous !== current) banned.add(previous);
  let x = rng.int(n - banned.size);
  for (let i = 0; i < n; i++) {
    if (banned.has(i)) continue;
    if (x === 0) return i;
    x--;
  }
  throw new Error("topic choice");
}

function orderFor(seq: number, dense: boolean): SlotName[] {
  const base = TALK_ORDER[seq % TALK_ORDER.length];
  return dense ? [...base, "conn", "ea", "eb", "ec"] : [...base];
}

function rot(seq: number, salt: number, n: number): number {
  if (n <= 1) return 0;
  return (Math.imul(seq + 1, salt) >>> 0) % n;
}

export class Codec {
  private state: State;
  last: LineMeta = { topicId: "", label: "", phase: "open", focus: "", hint: "", fact: "" };

  constructor(mode: CodecMode, seed: Uint8Array) {
    this.state = {
      mode,
      rng: new Rng(seed),
      seq: 0,
      topicIndex: 0,
      nextTopicIndex: 1,
      focusIndex: 0,
      episodeStart: -1,
      episodeLen: 0,
      left: 0,
    };
  }

  get bytesPerLine(): number {
    return this.state.mode === "talk" ? 2 : 4;
  }

  private roll(): void {
    const rng = this.state.rng;
    const n = TOPICS.length;
    if (this.state.episodeStart < 0) {
      this.state.topicIndex = rng.int(n);
      this.state.nextTopicIndex = otherTopic(rng, this.state.topicIndex, -1, n);
    } else {
      const leaving = this.state.topicIndex;
      this.state.topicIndex = this.state.nextTopicIndex;
      this.state.nextTopicIndex = otherTopic(rng, this.state.topicIndex, leaving, n);
    }
    const topic = TOPICS[this.state.topicIndex];
    this.state.focusIndex = rng.int(topic.focuses.length);
    this.state.episodeLen = episodeLength(rng);
    this.state.left = this.state.episodeLen;
    this.state.episodeStart = this.state.seq;
  }

  private prepare(): void {
    if (this.state.left <= 0) this.roll();
  }

  private locate(): { topic: Topic; phase: Phase; focusIndex: number; hint: string } {
    const topic = TOPICS[this.state.topicIndex];
    const pos = this.state.seq - this.state.episodeStart;
    let phase: Phase = "memory";
    if (pos <= 0) phase = "open";
    else if (pos >= this.state.episodeLen - 1) phase = "bridge";
    else if (pos === this.state.episodeLen - 2) phase = "today";
    return { topic, phase, focusIndex: this.state.focusIndex, hint: TOPICS[this.state.nextTopicIndex].hint };
  }

  private lists(): SlotLists {
    const here = this.locate();
    const focus = here.topic.focuses[here.focusIndex];
    this.last = {
      topicId: here.topic.id,
      label: here.topic.label,
      phase: here.phase,
      focus: focus.name,
      hint: here.hint,
      fact: `${focus.a}，${focus.c}，${focus.f}`,
    };
    return slotLists(here.topic, focus, here.phase, here.hint);
  }

  private finish(): void {
    this.state.left -= 1;
    this.state.seq += 1;
  }

  emit(index: number): string {
    this.prepare();
    const slots = this.lists();
    const line = render(slots, index, this.state.seq, this.state.mode === "dense");
    this.finish();
    return line;
  }

  absorb(line: string): number {
    this.prepare();
    const slots = this.lists();
    const index = parse(slots, line, this.state.seq, this.state.mode === "dense");
    this.finish();
    return index;
  }
}

function piece(n: number, shift: number, width: number): number {
  return Math.floor(n / 2 ** shift) % 2 ** width;
}

function take(text: string, options: string[]): { index: number; rest: string } {
  let best = -1;
  let bestLen = -1;
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    if (text.startsWith(opt) && opt.length > bestLen) {
      best = i;
      bestLen = opt.length;
    }
  }
  if (best < 0) throw new Error(`codec rejected a line: ${text.slice(0, 24)}`);
  return { index: best, rest: text.slice(bestLen) };
}

function render(slots: SlotLists, index: number, seq: number, dense: boolean): string {
  let line = "";
  for (const name of orderFor(seq, dense)) {
    const list = slots[name];
    const logical = piece(index, SHIFT[name], BITS[name]);
    const opt = (logical + rot(seq, SALT[name], list.length)) % list.length;
    line += list[opt];
  }
  return line;
}

function parse(slots: SlotLists, line: string, seq: number, dense: boolean): number {
  let rest = line;
  let index = 0;
  for (const name of orderFor(seq, dense)) {
    const list = slots[name];
    const got = take(rest, list);
    rest = got.rest;
    const turn = rot(seq, SALT[name], list.length);
    const logical = (got.index - turn + list.length) % list.length;
    index += logical * 2 ** SHIFT[name];
  }
  if (rest.length !== 0) throw new Error("codec leftover");
  return index;
}

export type BitLine = {
  readonly bytesPerLine: number;
  last: LineMeta;
  emit(index: number): string;
  absorb(line: string): number;
};

export class PhrasePipe {
  private inbox: number[] = [];
  private read = 0;

  constructor(
    public enc: BitLine,
    public dec: BitLine,
  ) {}

  encode(payload: Uint8Array): { line: string; meta: LineMeta }[] {
    const width = this.enc.bytesPerLine;
    const head = 2 + payload.length;
    const pad = (width - (head % width)) % width;
    const raw = new Uint8Array(head + pad);
    raw[0] = payload.length >> 8;
    raw[1] = payload.length & 255;
    raw.set(payload, 2);
    const lines: { line: string; meta: LineMeta }[] = [];
    for (let i = 0; i < raw.length; i += width) {
      const line = this.enc.emit(readIndex(raw.subarray(i, i + width)));
      lines.push({ line, meta: { ...this.enc.last } });
    }
    return lines;
  }

  pushLine(line: string): Uint8Array[] {
    const width = this.dec.bytesPerLine;
    const n = this.dec.absorb(line);
    for (const b of toBytes(n, width)) this.inbox.push(b);
    const out: Uint8Array[] = [];
    for (;;) {
      if (this.inbox.length - this.read < 2) break;
      const len = (this.inbox[this.read] << 8) | this.inbox[this.read + 1];
      const head = 2 + len;
      const pad = (width - (head % width)) % width;
      const total = head + pad;
      if (this.inbox.length - this.read < total) break;
      const payload = Uint8Array.from(this.inbox.slice(this.read + 2, this.read + 2 + len));
      this.read += total;
      out.push(payload);
    }
    if (this.read > 4096) {
      this.inbox = this.inbox.slice(this.read);
      this.read = 0;
    }
    return out;
  }
}

function readIndex(b: Uint8Array): number {
  let n = 0;
  for (const x of b) n = n * 256 + x;
  return n;
}

function toBytes(n: number, width: number): number[] {
  const out: number[] = [];
  let x = n;
  for (let i = 0; i < width; i++) {
    out.push(x % 256);
    x = Math.floor(x / 256);
  }
  return out.reverse();
}
