import type { Brief, FactSkin, Quad, SpeechBank } from "./script";
import { isZh, mentionsPublicScript } from "./script";

function mix(text: string): number {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pieces(text: string): string[] {
  const punct = text
    .split(/[，。；、！？,.!?\s]/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
  if (punct.length >= 2) return punct.slice(0, 6);
  const source = punct[0] || text.trim() || "这件";
  const cut: string[] = [];
  let buf = "";
  for (const ch of source) {
    buf += ch;
    if (buf.length >= 2 && /[的把在了是就而又从对给让被到过]/.test(ch) && cut.length < 5) {
      cut.push(buf);
      buf = "";
    }
  }
  if (buf) cut.push(buf);
  const usable = cut.filter((part) => part.length >= 2);
  if (usable.length >= 2) return usable;
  const mid = Math.max(1, Math.floor(source.length / 2));
  return [source.slice(0, mid), source.slice(mid) || source];
}

function windows(text: string): string[] {
  const source = text.replace(/[，。；、！？\s]/g, "");
  const out: string[] = [];
  const base = source || "就事说事";
  for (let n = 2; n <= Math.min(6, base.length); n++) {
    for (let i = 0; i + n <= base.length; i++) out.push(base.slice(i, i + n));
  }
  return out.length ? out : [base];
}

function prefixFree(list: string[]): boolean {
  const sorted = [...list].sort();
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startsWith(sorted[i - 1])) return false;
  }
  return new Set(list).size === list.length && list.every((item) => item.length > 0);
}

function takeDistinct(n: number, at: (tryIndex: number) => string, punct: "，" | "。"): string[] {
  const out: string[] = [];
  let t = 0;
  while (out.length < n) {
    if (t > n * 12) throw new Error("私稿拼不出足够的不同说法");
    const core = at(t).replace(/[，。\s]/g, "");
    t++;
    if (!core) continue;
    const line = `${core}${punct}`;
    if (out.includes(line)) continue;
    if (out.some((have) => have.startsWith(line) || line.startsWith(have))) continue;
    if (mentionsPublicScript(line)) continue;
    out.push(line);
  }
  return out;
}

function rotateTake(n: number, salt: string, items: string[], punct: "，" | "。"): string[] {
  if (items.length < n) throw new Error("私稿太短，写不开");
  const start = mix(salt) % items.length;
  const ordered = items.map((_, i) => items[(i + start) % items.length]);
  return takeDistinct(n, (i) => ordered[i % ordered.length], punct);
}

const STANCES = [
  "照旧", "当场", "顺口", "低声", "就近", "原样", "眼下", "此刻",
  "手里", "灯下", "窗边", "门口", "路上", "桌边", "晨起", "夜里",
  "起身", "坐下", "站着", "停下", "回头", "仅此", "到此", "先放",
  "按下", "记下", "留白", "说开", "短问", "慢说", "直说", "罢了",
];

export function forgeSpeech(brief: Brief, voice: string, author: string, epoch: number, pen = "私稿拼接"): SpeechBank {
  if (!isZh(brief.language || "中文")) return forgeSpeechOther(brief, voice, author, epoch, pen);
  const salt = `${author}|${voice}|${epoch}|${brief.persona}`;
  const bits = windows(brief.persona);
  const openers = rotateTake(
    16,
    `${salt}|open`,
    STANCES.map((stance, i) => `${voice}${stance}提起${bits[i % bits.length]}`),
    "，",
  );
  const moods = rotateTake(
    16,
    `${salt}|mood`,
    STANCES.map((stance, i) => `口气${stance}留在${bits[(i + 3) % bits.length]}`),
    "，",
  );
  const tails = rotateTake(
    16,
    `${salt}|tail`,
    STANCES.map((stance, i) => `${stance}便停在${bits[(i + 5) % bits.length]}`),
    "。",
  );

  const verbs = ["先是", "提到", "仍是", "对着", "留着", "碰到", "说回", "重复", "收在", "只剩", "未改", "重提"];
  const facts: FactSkin[] = brief.facts.map((fact) => {
    const clips = pieces(fact.text).flatMap((part) => [part, part.slice(0, Math.min(6, part.length))]).filter((part) => part.length >= 2);
    const bodies = verbs.flatMap((verb) => clips.map((clip) => `${verb}${fact.anchor}里的${clip}`));
    const skin = (phase: string, slot: "a" | "b"): Quad => {
      if (phase === "bridge" && slot === "a") {
        return asQuad(takeDistinct(4, (i) => ["{here}先收到这", "先把{here}放下", "{here}不再展开", "离开{here}"][i % 4], "，"));
      }
      if (phase === "bridge" && slot === "b") {
        return asQuad(takeDistinct(4, (i) => ["转到{next}", "{next}接上来", "下面改看{next}", "{next}这头"][i % 4], "，"));
      }
      return asQuad(rotateTake(4, `${salt}|${fact.anchor}|${phase}|${slot}`, bodies, "，"));
    };
    return {
      anchor: fact.anchor,
      text: fact.text,
      open: { a: skin("open", "a"), b: skin("open", "b") },
      memory: { a: skin("memory", "a"), b: skin("memory", "b") },
      today: { a: skin("today", "a"), b: skin("today", "b") },
      bridge: { a: skin("bridge", "a"), b: skin("bridge", "b") },
    };
  });

  return { voice, author, epoch, persona: brief.persona, openers, moods, tails, facts, pen };
}

type Marks = { comma: string; stop: string; spaced: boolean; kind: "ja" | "en" | "plain" };

function marks(language: string): Marks {
  const name = language.trim().toLowerCase();
  if (/^(ja|jp|日本語|日语|日語|japanese)$/.test(language.trim()) || name === "ja" || name === "jp" || name === "japanese") {
    return { comma: "、", stop: "。", spaced: false, kind: "ja" };
  }
  if (/^(en|english|英文|英语|英語)$/.test(name) || name === "en" || name === "english") {
    return { comma: ", ", stop: ".", spaced: true, kind: "en" };
  }
  return { comma: ", ", stop: ".", spaced: true, kind: "plain" };
}

function wordsOf(text: string, spaced: boolean): string[] {
  if (spaced) {
    const words = text
      .split(/[^\p{L}\p{N}]+/u)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2);
    return words.length ? words : [text.trim().slice(0, 24) || "item"];
  }
  const chunks = text
    .split(/[，。、；！？\s]/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
  if (chunks.length) return chunks.slice(0, 6);
  const whole = text.trim().slice(0, 18);
  return whole ? [whole] : [];
}

function takeKept(n: number, at: (tryIndex: number) => string, punct: string): string[] {
  const out: string[] = [];
  let t = 0;
  while (out.length < n) {
    if (t > n * 24) throw new Error("这种语言的词不够，把私稿写长一点");
    let core = at(t).trim().replace(/\s+/g, " ");
    t++;
    core = core.replace(/[，。、,.]+$/g, "").trim();
    if (!core) continue;
    const line = `${core}${punct}`;
    if (out.includes(line)) continue;
    if (out.some((have) => have.startsWith(line) || line.startsWith(have))) continue;
    if (mentionsPublicScript(line)) continue;
    out.push(line);
  }
  return out;
}

function forgeSpeechOther(brief: Brief, voice: string, author: string, epoch: number, pen: string): SpeechBank {
  const tongue = marks(brief.language);
  const salt = `${author}|${voice}|${epoch}|${brief.language}|${brief.persona}`;
  const pool = [
    ...new Set([
      ...brief.facts.map((fact) => fact.anchor),
      ...brief.facts.flatMap((fact) => wordsOf(fact.text, tongue.spaced)),
      ...wordsOf(brief.persona, tongue.spaced),
    ]),
  ].filter(Boolean);
  const pairs: string[] = [];
  for (let i = 0; i < pool.length; i++) {
    pairs.push(pool[i]);
    for (let j = 0; j < pool.length; j++) {
      if (i === j) continue;
      pairs.push(tongue.kind === "ja" ? `${pool[i]}と${pool[j]}` : `${pool[i]} ${pool[j]}`);
    }
  }
  const say = (kind: string, bit: string): string => {
    if (tongue.kind === "ja") {
      if (kind === "open") return `${voice}は${bit}から`;
      if (kind === "mood") return `調子は${bit}のまま`;
      return `${bit}で切る`;
    }
    if (tongue.kind === "en") {
      if (kind === "open") return `${voice} mentions ${bit}`;
      if (kind === "mood") return `tone stays on ${bit}`;
      return `stop after ${bit}`;
    }
    if (kind === "open") return `${voice} ${bit}`;
    if (kind === "mood") return `${bit} ${voice}`;
    return `${bit}`;
  };
  const openers = takeKept(16, (i) => say("open", pairs[(mix(`${salt}|open`) + i) % pairs.length]), tongue.comma);
  const moods = takeKept(16, (i) => say("mood", pairs[(mix(`${salt}|mood`) + i) % pairs.length]), tongue.comma);
  const tails = takeKept(16, (i) => say("tail", pairs[(mix(`${salt}|tail`) + i) % pairs.length]), tongue.stop);
  const bridgeA =
    tongue.kind === "ja"
      ? ["{here}はここまで", "先に{here}を置く", "{here}は閉じる", "{here}から離れる"]
      : ["{here} stays", "set {here} down", "leave {here}", "{here} ends"];
  const bridgeB =
    tongue.kind === "ja"
      ? ["次は{next}", "{next}に渡す", "これから{next}", "{next}の方"]
      : ["on to {next}", "{next} takes over", "then {next}", "{next} from here"];
  const facts: FactSkin[] = brief.facts.map((fact) => {
    const clips = wordsOf(fact.text, tongue.spaced);
    const pads =
      tongue.kind === "ja"
        ? ["そのまま", "一度", "改めて", "あとで", "近く", "先に", "まだ", "だけ"]
        : ["still", "once", "again", "later", "near", "first", "yet", "only"];
    const bodies = clips.flatMap((clip) =>
      pads.map((pad) => (tongue.kind === "ja" ? `${fact.anchor}の${clip}を${pad}` : `${fact.anchor} ${clip} ${pad}`)),
    );
    const skin = (phase: string, slot: "a" | "b"): Quad => {
      if (phase === "bridge" && slot === "a") return asQuad(takeKept(4, (i) => bridgeA[i % 4], tongue.comma));
      if (phase === "bridge" && slot === "b") return asQuad(takeKept(4, (i) => bridgeB[i % 4], tongue.comma));
      return asQuad(takeKept(4, (i) => bodies[(mix(`${salt}|${fact.anchor}|${phase}|${slot}`) + i) % bodies.length], tongue.comma));
    };
    return {
      anchor: fact.anchor,
      text: fact.text,
      open: { a: skin("open", "a"), b: skin("open", "b") },
      memory: { a: skin("memory", "a"), b: skin("memory", "b") },
      today: { a: skin("today", "a"), b: skin("today", "b") },
      bridge: { a: skin("bridge", "a"), b: skin("bridge", "b") },
    };
  });
  return { voice, author, epoch, persona: brief.persona, openers, moods, tails, facts, pen };
}

function asQuad(list: string[]): Quad {
  if (list.length !== 4 || !prefixFree(list)) throw new Error("说法没有站稳");
  return list as Quad;
}

const CLI_TOOLS = ["ferry", "ledger", "harbor", "keeper", "relay", "archive"];
const CLI_VERBS = ["get", "describe", "apply", "diff", "sync", "logs", "edit", "wait", "label", "annotate"];
const CLI_SLOTS = ["live", "hold", "arc", "tmp", "bak", "new"];

function cliId(anchor: string): string {
  const id = [...anchor.replace(/[\s"\\]/g, "")].slice(0, 12).join("");
  return id || "item";
}

function toolName(salt: string): string {
  return CLI_TOOLS[mix(`${salt}|tool`) % CLI_TOOLS.length];
}

function cliNote(step: number, fact: { anchor: string }, tool: string, salt: string, rich: boolean): string {
  const id = cliId(fact.anchor);
  const n = 10 + ((mix(`${salt}|${step}`) >>> 0) % 90);
  const slot = CLI_SLOTS[(mix(`${salt}|slot`) + step) % CLI_SLOTS.length];
  const form = step % 16;
  const path = (wide: boolean) => (wide ? `var/lib/${slot}/${id}` : `${slot}/${id}`);
  const file = (wide: boolean) => (wide ? `var/lib/${slot}/${id}.toml` : `${slot}/${id}.toml`);
  const log = (wide: boolean) => (wide ? `var/log/${slot}/${id}.log` : `${slot}/${id}.log`);
  const listing = `var/lib/${slot}/${id}`;
  const dry = rich ? " --dry-run" : "";
  const lines = (wide: boolean) => [
    `${tool} get ${path(wide)} --rev ${n}`,
    `${tool} get ${path(wide)} -o json`,
    `${tool} describe ${path(wide)}`,
    `${tool} apply -f ${file(wide)}`,
    `${tool} apply -f ${file(wide)}${dry}`,
    `${tool} diff ${path(wide)} --since ${n}`,
    `${tool} sync ${path(wide)}`,
    `${tool} sync ${path(wide)}${dry}`,
    `${tool} logs ${path(wide)} --tail ${n}`,
    `${tool} edit ${path(wide)}`,
    `${tool} wait ${path(wide)} --timeout ${n}`,
    `${tool} label ${path(wide)} ${slot}=${n}`,
    `${tool} annotate ${path(wide)} rev=${n}`,
    `tail -n ${n} ${log(wide)}`,
    `ls -l ${listing}`,
    `${tool} get ${path(wide)} -o text`,
  ];
  let note = lines(false)[form];
  if (note.length < 20) note = lines(true)[form];
  note = note.replace(/ --dry-run$/, (full) => (note.length > 48 ? "" : full));
  while (note.length > 48 && note.includes(" ")) note = note.slice(0, note.lastIndexOf(" "));
  return note.replace(/["\n\r]/g, "").trim();
}

export function forgeNotes(brief: Brief, voice: string, author: string, epoch: number, rich: boolean): string[] {
  const salt = `${author}|${voice}|${epoch}|${brief.language}`;
  const tool = toolName(salt);
  const out: string[] = [];
  let step = 0;
  while (out.length < 16) {
    if (step > 400) throw new Error("附言拼不够");
    const fact = brief.facts[step % brief.facts.length];
    const note = cliNote(step, fact, tool, salt, rich);
    step += 1;
    if (!note || out.includes(note) || !isCli(note)) continue;
    out.push(note);
  }
  assertNamed(out);
  const lens = out.map((note) => note.length);
  const min = Math.min(...lens);
  const max = Math.max(...lens);
  if (max > min * 3) throw new Error("附言长短差得太大");
  return out;
}

function isCli(note: string): boolean {
  if (/[。，！？、；："']/.test(note) || note.length > 48 || note.length < 8) return false;
  if (/^tail -n \d+ \S+\.log$/.test(note)) return true;
  if (/^ls -l \S+$/.test(note)) return true;
  const verb = CLI_VERBS.join("|");
  return new RegExp(`^[a-z][a-z0-9-]*\\s+(${verb})(\\s+\\S+)*$`).test(note);
}

function assertNamed(notes: string[]): void {
  const tools = notes.filter((note) => !note.startsWith("tail ") && !note.startsWith("ls "));
  if (tools.length < 12) throw new Error("附言里的系统命令太多");
  const names = new Set(tools.map((note) => note.split(" ")[0]));
  if (names.size !== 1) throw new Error("附言没有守住同一个程序名");
  for (const note of notes) {
    if (note.startsWith("tail ") && !/^tail -n \d+ \S+\.log$/.test(note)) throw new Error("tail 只用 -n 和日志路径");
    if (note.startsWith("ls ") && !/^ls -l \S+$/.test(note)) throw new Error("ls 只用 -l 和路径");
  }
}

type RemoteShape = {
  openers?: unknown;
  moods?: unknown;
  tails?: unknown;
  facts?: unknown;
};

function quadOf(value: unknown, label: string, punct: string, spaced: boolean): Quad {
  if (!Array.isArray(value) || value.length !== 4) throw new Error(`${label}需要四条`);
  const list = value.map((item, i) => stringItem(item, `${label}${i}`, punct, spaced));
  if (!prefixFree(list)) throw new Error(`${label}里有彼此遮住的句子`);
  return list as Quad;
}

function stringItem(value: unknown, label: string, punct: string, spaced: boolean): string {
  if (typeof value !== "string") throw new Error(`${label}不是句子`);
  const text = spaced ? value.trim().replace(/\s+/g, " ") : value.trim().replace(/\s+/g, "");
  if (!text.endsWith(punct)) throw new Error(`${label}要以${punct}收束`);
  if (mentionsPublicScript(text)) throw new Error(`${label}撞上了公开话题表`);
  return text;
}

function sixteen(value: unknown, label: string, punct: string, spaced: boolean): string[] {
  if (!Array.isArray(value) || value.length !== 16) throw new Error(`${label}需要十六条`);
  const list = value.map((item, i) => stringItem(item, `${label}${i}`, punct, spaced));
  if (!prefixFree(list)) throw new Error(`${label}里有彼此遮住的句子`);
  return list;
}

export function parseRemoteSpeech(raw: string, brief: Brief, voice: string, author: string, epoch: number): SpeechBank {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/g, "").trim();
  let parsed: RemoteShape;
  try {
    parsed = JSON.parse(trimmed) as RemoteShape;
  } catch {
    throw new Error("模型没有返回成稿");
  }
  const tongue = isZh(brief.language || "中文")
    ? { comma: "，", stop: "。", spaced: false }
    : marks(brief.language);
  const openers = sixteen(parsed.openers, "起句", tongue.comma, tongue.spaced);
  const moods = sixteen(parsed.moods, "口气", tongue.comma, tongue.spaced);
  const tails = sixteen(parsed.tails, "收句", tongue.stop, tongue.spaced);
  const rows = parsed.facts;
  if (!Array.isArray(rows) || rows.length !== brief.facts.length) {
    throw new Error("模型改动了事实的件数");
  }
  const facts: FactSkin[] = brief.facts.map((fact, index) => {
    const got = rows[index] as { open?: { a?: unknown; b?: unknown }; memory?: { a?: unknown; b?: unknown }; today?: { a?: unknown; b?: unknown }; bridge?: { a?: unknown; b?: unknown } } | undefined;
    const phase = (name: "open" | "memory" | "today" | "bridge", slot: "a" | "b"): Quad => {
      const list = quadOf(got?.[name]?.[slot], `${fact.anchor}${name}${slot}`, tongue.comma, tongue.spaced);
      if (name === "bridge" && slot === "a" && list.some((item) => !item.includes("{here}"))) {
        throw new Error("转折要留住这一件的锚点");
      }
      if (name === "bridge" && slot === "b" && list.some((item) => !item.includes("{next}"))) {
        throw new Error("转折要指向下一件");
      }
      if (name !== "bridge" && list.some((item) => !item.includes(fact.anchor))) {
        throw new Error("句子离开了这一件事实");
      }
      return list;
    };
    return {
      anchor: fact.anchor,
      text: fact.text,
      open: { a: phase("open", "a"), b: phase("open", "b") },
      memory: { a: phase("memory", "a"), b: phase("memory", "b") },
      today: { a: phase("today", "a"), b: phase("today", "b") },
      bridge: { a: phase("bridge", "a"), b: phase("bridge", "b") },
    };
  });
  return { voice, author, epoch, persona: brief.persona, openers, moods, tails, facts, pen: "本地模型" };
}

export function parseRemoteNotes(raw: string): string[] {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("模型没有返回附言");
  }
  const list = Array.isArray(parsed) ? parsed : (parsed as { notes?: unknown }).notes;
  if (!Array.isArray(list) || list.length !== 16) throw new Error("附言要十六条");
  const notes = list.map((item, i) => {
    if (typeof item !== "string") throw new Error(`附言${i}不是文字`);
    const note = item.replace(/[\n\r"]/g, "").trim();
    if (!isCli(note) || note.length > 48) throw new Error(`附言${i}要写成命令，不要写成句子`);
    return note;
  });
  if (new Set(notes).size !== 16) throw new Error("附言有重复");
  assertNamed(notes);
  return notes;
}

async function complete(url: string, model: string, system: string, user: string): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`本地模型回应 ${response.status}`);
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[]; message?: { content?: string }; response?: string };
  const text = body.choices?.[0]?.message?.content ?? body.message?.content ?? body.response ?? "";
  if (!text.trim()) throw new Error("本地模型没有写出内容");
  return text;
}

const SPEECH_SYSTEM =
  "你在上线前为一份私稿写表面说法。只输出 JSON，不要解释。句子必须使用私稿里的词，并且只使用规定的语言。列表里的句子不能彼此作为前缀。";

export async function forgeSpeechRemote(
  url: string,
  model: string,
  brief: Brief,
  voice: string,
  author: string,
  epoch: number,
): Promise<SpeechBank> {
  const tongue = isZh(brief.language || "中文")
    ? { comma: "，", stop: "。", spaced: false }
    : marks(brief.language);
  const facts = brief.facts.map((fact) => `${fact.anchor}｜${fact.text}`).join("\n");
  const user = `纪元 ${epoch}，作者 ${author}，口气 ${voice}。
规定语言：${brief.language || "中文"}。整句只用这种语言，不要夹别的语言。
${tongue.spaced ? "词与词之间保留空格。" : "不要插入空格。"}
人设：${brief.persona}
事实：
${facts}

返回一个 JSON 对象，键为 openers、moods、tails、facts。
openers 十六条，每条以 ${JSON.stringify(tongue.comma)} 结尾。
moods 十六条，每条以 ${JSON.stringify(tongue.comma)} 结尾。
tails 十六条，每条以 ${JSON.stringify(tongue.stop)} 结尾。
facts 与上面的事实等长、同序。每件含 open、memory、today、bridge，各自有 a、b 两个数组，每个数组四条，以 ${JSON.stringify(tongue.comma)} 结尾。
open、memory、today 的每条都要含该件锚点。
bridge.a 的每条含 {here}，bridge.b 的每条含 {next}，这两个记号原样保留，不要翻译。`;
  const text = await complete(url, model, SPEECH_SYSTEM, user);
  return parseRemoteSpeech(text, brief, voice, author, epoch);
}

export async function forgeNotesRemote(
  url: string,
  model: string,
  brief: Brief,
  voice: string,
  author: string,
  epoch: number,
): Promise<string[]> {
  const facts = brief.facts.map((fact) => `${fact.anchor}｜${fact.text}`).join("\n");
  const user = `纪元 ${epoch}，作者 ${author}，口气 ${voice}。
规定语言：${brief.language || "中文"}。附言只用这种语言。
人设：${brief.persona}
事实：
${facts}

只输出 JSON 字符串数组，十六条。同一个声音只用一个小写程序名，不要带 .sh，十六条里不要换名字。子命令只能是 get、describe、apply、diff、sync、logs、edit、wait、label、annotate。旗标跟子命令走：get 可以用 --rev 或 -o，apply 可以用 -f 和 --dry-run，diff 用 --since，sync 可以用 --dry-run，logs 用 --tail，wait 用 --timeout。其中两条可以换成系统命令，而且只能是 tail -n 数字 路径.log，或 ls -l 路径。不要给 tail 或 ls 加别的旗标。事实的锚点只放在路径里。不要句号、逗号、问号或自然语言。长度 20 到 46，不含换行和引号。不要解释。`;
  const text = await complete(
    url,
    model,
    "你在给一个已经定好字段的程序写附言。附言是命令行，不是自然语言。一个声音只用一个程序名。不要改字段名，不要输出对象，只输出十六条字符串的 JSON 数组。",
    user,
  );
  return parseRemoteNotes(text);
}

export type Coherence = { asked: boolean; ok: boolean | null; notes: string[] };

export function parseCoherence(raw: string): { ok: boolean; notes: string[] } {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/g, "").trim();
  let parsed: { ok?: unknown; notes?: unknown };
  try {
    parsed = JSON.parse(trimmed) as { ok?: unknown; notes?: unknown };
  } catch {
    throw new Error("模型没有按格式审完");
  }
  if (typeof parsed.ok !== "boolean") throw new Error("模型没有按格式审完");
  const notes = Array.isArray(parsed.notes)
    ? parsed.notes.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 4)
    : [];
  return { ok: parsed.ok, notes };
}

export async function reviewCoherence(url: string, model: string, language: string, lines: string[]): Promise<Coherence> {
  const sample = lines.slice(0, 8).map((line, i) => `${i + 1}. ${line}`).join("\n");
  const text = await complete(
    url,
    model,
    "你只审语言连贯性。只输出 JSON，不要改写句子。",
    `规定语言是「${language}」。
看这些句子：是不是都用这种语言、相邻句有没有接不上、有没有残词或中途换语言。
只输出 {"ok":true或false,"notes":["最多四条，用中文写给操作者"]}。

${sample}`,
  );
  const got = parseCoherence(text);
  return { asked: true, ok: got.ok, notes: got.notes };
}
