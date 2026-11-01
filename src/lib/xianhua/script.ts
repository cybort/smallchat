import { sha256 } from "@noble/hashes/sha2.js";
import { utf8 } from "./bytes";
import { BRIDGE_B, CONNECTORS, MOODS, OPENERS, TAILS } from "./topics";

export type BriefFact = { anchor: string; text: string };

export type Brief = {
  persona: string;
  language: string;
  facts: BriefFact[];
};

export type Quad = [string, string, string, string];

export type FactSkin = {
  anchor: string;
  text: string;
  open: { a: Quad; b: Quad };
  memory: { a: Quad; b: Quad };
  today: { a: Quad; b: Quad };
  /** `{here}` is this fact's anchor, `{next}` is the next episode's. */
  bridge: { a: Quad; b: Quad };
};

export type SpeechBank = {
  voice: string;
  author: string;
  epoch: number;
  persona: string;
  openers: string[];
  moods: string[];
  tails: string[];
  facts: FactSkin[];
  pen: string;
};

export type ProgramCard = {
  keys: {
    op: string;
    shelf: string;
    req: string;
    cursor: string;
    at: string;
    note: string;
    ok: string;
  };
  ops: Quad;
  shelves: Quad;
};

const BANNED = [...OPENERS, ...MOODS, ...TAILS, ...CONNECTORS, ...BRIDGE_B.map((s) => s.replace("{hint}", ""))].filter(
  (s) => s.length >= 2,
);

export function hitsPublicScript(line: string): boolean {
  return OPENERS.some((opener) => line.startsWith(opener)) && TAILS.some((tail) => line.endsWith(tail));
}

export function mentionsPublicScript(line: string): boolean {
  return BANNED.some((piece) => line.includes(piece));
}

export function fingerprint(value: unknown): string {
  const bytes = sha256(utf8(JSON.stringify(value)));
  return [...bytes.subarray(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function languageOf(raw: string): string {
  for (const line of raw.split(/\n/)) {
    const hit = /^(?:语言|語言|language|lang)[:：]\s*(.+)$/i.exec(line.trim());
    if (hit) return hit[1].trim().slice(0, 40);
  }
  return "";
}

export function isZh(language: string): boolean {
  const name = language.trim().toLowerCase();
  return (
    name === "" ||
    name === "中文" ||
    name === "汉语" ||
    name === "华语" ||
    name === "中国话" ||
    name === "简体中文" ||
    name === "zh" ||
    name === "zh-cn" ||
    name === "chinese"
  );
}

export function parseBrief(raw: string): Brief {
  const lines = raw
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let persona = "";
  let language = "";
  const facts: BriefFact[] = [];
  for (const line of lines) {
    const langLine = /^(?:语言|語言|language|lang)[:：]\s*(.+)$/i.exec(line);
    if (langLine) {
      language = langLine[1].trim();
      continue;
    }
    const personaLine = /^(?:人设|口气|persona)[:：]\s*(.+)$/i.exec(line);
    if (personaLine) {
      persona = personaLine[1].trim();
      continue;
    }
    if (/^(?:事实|私稿)[:：]?$/.test(line)) continue;
    const body = line.replace(/^[-*·]\s*/, "");
    const parts = body.split(/\s*[|｜]\s*/);
    const text = (parts.length >= 2 ? parts.slice(1).join("｜") : parts[0]).trim();
    const anchor = (parts.length >= 2 ? parts[0] : text.slice(0, Math.min(4, text.length))).trim();
    if (!text || !anchor) continue;
    facts.push({
      anchor: anchor.replace(/[{}]/g, "").slice(0, 12),
      text: text.replace(/[{}]/g, "").slice(0, 80),
    });
  }
  if (!persona) persona = "就事说事";
  persona = persona.replace(/[{}]/g, "").slice(0, 80);
  language = (language || "中文").replace(/[{}]/g, "").slice(0, 40);
  if (facts.length < 2) throw new Error("私稿至少写两件事实");
  if (facts.length > 12) throw new Error("事实先留在十二件以内");
  for (let i = 0; i < facts.length; i++) {
    for (let j = 0; j < facts.length; j++) {
      if (i === j) continue;
      if (facts[i].anchor === facts[j].anchor) throw new Error(`锚点重复：${facts[i].anchor}`);
      if (facts[j].anchor.startsWith(facts[i].anchor) || facts[i].anchor.startsWith(facts[j].anchor)) {
        throw new Error(`锚点不能互相做前缀：${facts[i].anchor} / ${facts[j].anchor}`);
      }
    }
  }
  return { persona, language, facts };
}

const KEY_RE = /^[\p{L}_][\p{L}\p{N}_]{0,24}$/u;

function quad(label: string, raw: string): Quad {
  const values = raw
    .split(/[,，]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (values.length !== 4) throw new Error(`${label}要正好四个取值`);
  if (new Set(values).size !== 4) throw new Error(`${label}的取值不能重复`);
  for (const value of values) {
    if (value.length > 24) throw new Error(`${label}的取值太长`);
    if (/[\n\r"]/.test(value)) throw new Error(`${label}的取值里不要换行或引号`);
  }
  return values as Quad;
}

function key(label: string, raw: string): string {
  const name = raw.trim();
  if (!KEY_RE.test(name)) throw new Error(`${label}用程序里的字段名`);
  return name;
}

export function programCard(input: {
  opKey: string;
  opValues: string;
  shelfKey: string;
  shelfValues: string;
  reqKey: string;
  cursorKey: string;
  atKey: string;
  noteKey: string;
  okKey: string;
}): ProgramCard {
  const keys = {
    op: key("操作字段", input.opKey),
    shelf: key("分类字段", input.shelfKey),
    req: key("计数字段", input.reqKey),
    cursor: key("游标字段", input.cursorKey),
    at: key("时钟字段", input.atKey),
    note: key("附言字段", input.noteKey),
    ok: key("结果字段", input.okKey),
  };
  const names = Object.values(keys);
  if (new Set(names).size !== names.length) throw new Error("字段名不能重复");
  return {
    keys,
    ops: quad("操作", input.opValues),
    shelves: quad("分类", input.shelfValues),
  };
}

export const DEMO_BRIEF = `人设：说话短，先摆事实，不抒情。
草稿｜周三把窗口的草稿寄出
面馆｜巷口那家只在雨天去
钥匙｜抽屉里的旧钥匙还在
轮渡｜过江会站在下风的一侧`;

export const DEMO_CARD_TEXT = `操作 op = pull, ack, ping, fold
分类 shelf = draft, sent, hold, bin
计数 req
游标 cursor
时钟 at
附言 note
结果 ok`;

const CARD_ROLES: Record<string, "op" | "shelf" | "req" | "cursor" | "at" | "note" | "ok"> = {
  操作: "op",
  op: "op",
  分类: "shelf",
  shelf: "shelf",
  计数: "req",
  req: "req",
  游标: "cursor",
  cursor: "cursor",
  时钟: "at",
  at: "at",
  附言: "note",
  note: "note",
  结果: "ok",
  ok: "ok",
};

export function parseCardText(raw: string): ProgramCard {
  const names: Partial<Record<"op" | "shelf" | "req" | "cursor" | "at" | "note" | "ok", string>> = {};
  const values: Partial<Record<"op" | "shelf", string>> = {};
  for (const line of raw
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean)) {
    const hit = /^(\S+)\s+(.+)$/.exec(line);
    if (!hit) throw new Error(`认不出字段行：${line}`);
    const role = CARD_ROLES[hit[1]] ?? CARD_ROLES[hit[1].toLowerCase()];
    if (!role) throw new Error(`认不出字段行：${line}`);
    const rest = hit[2].trim();
    if (role === "op" || role === "shelf") {
      const parts = rest.split(/\s*=\s*/);
      if (parts.length === 2) {
        names[role] = parts[0].trim();
        values[role] = parts[1].trim();
      } else {
        names[role] = role;
        values[role] = rest;
      }
    } else {
      names[role] = rest.split(/\s+/)[0];
    }
  }
  for (const role of ["op", "shelf", "req", "cursor", "at", "note", "ok"] as const) {
    if (!names[role]) throw new Error("程序字段要写全操作、分类、计数、游标、时钟、附言、结果");
  }
  if (!values.op || !values.shelf) throw new Error("操作和分类要各有四个取值");
  return programCard({
    opKey: names.op ?? "op",
    opValues: values.op,
    shelfKey: names.shelf ?? "shelf",
    shelfValues: values.shelf,
    reqKey: names.req ?? "req",
    cursorKey: names.cursor ?? "cursor",
    atKey: names.at ?? "at",
    noteKey: names.note ?? "note",
    okKey: names.ok ?? "ok",
  });
}

export const DEMO_CARD_INPUT = {
  opKey: "op",
  opValues: "pull, ack, ping, fold",
  shelfKey: "shelf",
  shelfValues: "draft, sent, hold, bin",
  reqKey: "req",
  cursorKey: "cursor",
  atKey: "at",
  noteKey: "note",
  okKey: "ok",
};
