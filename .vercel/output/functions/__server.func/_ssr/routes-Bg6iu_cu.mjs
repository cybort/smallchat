import { i as __toESM } from "../_runtime.mjs";
import { r as sha256 } from "../_libs/noble__curves+noble__hashes.mjs";
import { S as utf8, a as MOODS, b as text, c as Rng, d as createIdentity, g as publicIdentity, l as TAILS, m as memoryPair, n as CONNECTORS, o as OPENERS, p as measure, r as Codec, s as PhrasePipe, t as BRIDGE_B, u as Tunnel, x as unb64url, y as startHandshake } from "./wire-Cct7XKhD.mjs";
import { b as require_jsx_runtime, q as require_react } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-Bg6iu_cu.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var BANNED = [
	...OPENERS,
	...MOODS,
	...TAILS,
	...CONNECTORS,
	...BRIDGE_B.map((s) => s.replace("{hint}", ""))
].filter((s) => s.length >= 2);
function hitsPublicScript(line) {
	return OPENERS.some((opener) => line.startsWith(opener)) && TAILS.some((tail) => line.endsWith(tail));
}
function mentionsPublicScript(line) {
	return BANNED.some((piece) => line.includes(piece));
}
function fingerprint(value) {
	return [...sha256(utf8(JSON.stringify(value))).subarray(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function parseBrief(raw) {
	const lines = raw.split(/\n/).map((line) => line.trim()).filter(Boolean);
	let persona = "";
	const facts = [];
	for (const line of lines) {
		const personaLine = /^(?:人设|口气)[:：]\s*(.+)$/.exec(line);
		if (personaLine) {
			persona = personaLine[1].trim();
			continue;
		}
		if (/^(?:事实|私稿)[:：]?$/.test(line)) continue;
		const parts = line.replace(/^[-*·]\s*/, "").split(/\s*[|｜]\s*/);
		const text = (parts.length >= 2 ? parts.slice(1).join("｜") : parts[0]).trim();
		const anchor = (parts.length >= 2 ? parts[0] : text.slice(0, Math.min(4, text.length))).trim();
		if (!text || !anchor) continue;
		facts.push({
			anchor: anchor.replace(/[{}]/g, "").slice(0, 12),
			text: text.replace(/[{}]/g, "").slice(0, 80)
		});
	}
	if (!persona) persona = "就事说事";
	persona = persona.replace(/[{}]/g, "").slice(0, 80);
	if (facts.length < 2) throw new Error("私稿至少写两件事实");
	if (facts.length > 12) throw new Error("事实先留在十二件以内");
	for (let i = 0; i < facts.length; i++) for (let j = 0; j < facts.length; j++) {
		if (i === j) continue;
		if (facts[i].anchor === facts[j].anchor) throw new Error(`锚点重复：${facts[i].anchor}`);
		if (facts[j].anchor.startsWith(facts[i].anchor) || facts[i].anchor.startsWith(facts[j].anchor)) throw new Error(`锚点不能互相做前缀：${facts[i].anchor} / ${facts[j].anchor}`);
	}
	return {
		persona,
		facts
	};
}
var KEY_RE = /^[\p{L}_][\p{L}\p{N}_]{0,24}$/u;
function quad(label, raw) {
	const values = raw.split(/[,，]/).map((part) => part.trim()).filter(Boolean);
	if (values.length !== 4) throw new Error(`${label}要正好四个取值`);
	if (new Set(values).size !== 4) throw new Error(`${label}的取值不能重复`);
	for (const value of values) {
		if (value.length > 24) throw new Error(`${label}的取值太长`);
		if (/[\n\r"]/.test(value)) throw new Error(`${label}的取值里不要换行或引号`);
	}
	return values;
}
function key(label, raw) {
	const name = raw.trim();
	if (!KEY_RE.test(name)) throw new Error(`${label}用程序里的字段名`);
	return name;
}
function programCard(input) {
	const keys = {
		op: key("操作字段", input.opKey),
		shelf: key("分类字段", input.shelfKey),
		req: key("计数字段", input.reqKey),
		cursor: key("游标字段", input.cursorKey),
		at: key("时钟字段", input.atKey),
		note: key("附言字段", input.noteKey),
		ok: key("结果字段", input.okKey)
	};
	const names = Object.values(keys);
	if (new Set(names).size !== names.length) throw new Error("字段名不能重复");
	return {
		keys,
		ops: quad("操作", input.opValues),
		shelves: quad("分类", input.shelfValues)
	};
}
var DEMO_BRIEF = `人设：说话短，先摆事实，不抒情。
草稿｜周三把窗口的草稿寄出
面馆｜巷口那家只在雨天去
钥匙｜抽屉里的旧钥匙还在
轮渡｜过江会站在下风的一侧`;
var DEMO_CARD_INPUT = {
	opKey: "op",
	opValues: "pull, ack, ping, fold",
	shelfKey: "shelf",
	shelfValues: "draft, sent, hold, bin",
	reqKey: "req",
	cursorKey: "cursor",
	atKey: "at",
	noteKey: "note",
	okKey: "ok"
};
function mix(text) {
	let h = 2166136261;
	for (const ch of text) {
		h ^= ch.codePointAt(0) ?? 0;
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}
function pieces(text) {
	const punct = text.split(/[，。；、！？,.!?\s]/).map((part) => part.trim()).filter((part) => part.length >= 2);
	if (punct.length >= 2) return punct.slice(0, 6);
	const source = punct[0] || text.trim() || "这件";
	const cut = [];
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
function windows(text) {
	const source = text.replace(/[，。；、！？\s]/g, "");
	const out = [];
	const base = source || "就事说事";
	for (let n = 2; n <= Math.min(6, base.length); n++) for (let i = 0; i + n <= base.length; i++) out.push(base.slice(i, i + n));
	return out.length ? out : [base];
}
function prefixFree(list) {
	const sorted = [...list].sort();
	for (let i = 1; i < sorted.length; i++) if (sorted[i].startsWith(sorted[i - 1])) return false;
	return new Set(list).size === list.length && list.every((item) => item.length > 0);
}
function takeDistinct(n, at, punct) {
	const out = [];
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
function rotateTake(n, salt, items, punct) {
	if (items.length < n) throw new Error("私稿太短，写不开");
	const start = mix(salt) % items.length;
	const ordered = items.map((_, i) => items[(i + start) % items.length]);
	return takeDistinct(n, (i) => ordered[i % ordered.length], punct);
}
var STANCES = [
	"照旧",
	"当场",
	"顺口",
	"低声",
	"就近",
	"原样",
	"眼下",
	"此刻",
	"手里",
	"灯下",
	"窗边",
	"门口",
	"路上",
	"桌边",
	"晨起",
	"夜里",
	"起身",
	"坐下",
	"站着",
	"停下",
	"回头",
	"仅此",
	"到此",
	"先放",
	"按下",
	"记下",
	"留白",
	"说开",
	"短问",
	"慢说",
	"直说",
	"罢了"
];
function forgeSpeech(brief, voice, author, epoch, pen = "私稿拼接") {
	const salt = `${author}|${voice}|${epoch}|${brief.persona}`;
	const bits = windows(brief.persona);
	const openers = rotateTake(16, `${salt}|open`, STANCES.map((stance, i) => `${voice}${stance}提起${bits[i % bits.length]}`), "，");
	const moods = rotateTake(16, `${salt}|mood`, STANCES.map((stance, i) => `口气${stance}留在${bits[(i + 3) % bits.length]}`), "，");
	const tails = rotateTake(16, `${salt}|tail`, STANCES.map((stance, i) => `${stance}便停在${bits[(i + 5) % bits.length]}`), "。");
	const verbs = [
		"先是",
		"提到",
		"仍是",
		"对着",
		"留着",
		"碰到",
		"说回",
		"重复",
		"收在",
		"只剩",
		"未改",
		"重提"
	];
	const facts = brief.facts.map((fact) => {
		const clips = pieces(fact.text).flatMap((part) => [part, part.slice(0, Math.min(6, part.length))]).filter((part) => part.length >= 2);
		const bodies = verbs.flatMap((verb) => clips.map((clip) => `${verb}${fact.anchor}里的${clip}`));
		const skin = (phase, slot) => {
			if (phase === "bridge" && slot === "a") return asQuad(takeDistinct(4, (i) => [
				"{here}先收到这",
				"先把{here}放下",
				"{here}不再展开",
				"离开{here}"
			][i % 4], "，"));
			if (phase === "bridge" && slot === "b") return asQuad(takeDistinct(4, (i) => [
				"转到{next}",
				"{next}接上来",
				"下面改看{next}",
				"{next}这头"
			][i % 4], "，"));
			return asQuad(rotateTake(4, `${salt}|${fact.anchor}|${phase}|${slot}`, bodies, "，"));
		};
		return {
			anchor: fact.anchor,
			text: fact.text,
			open: {
				a: skin("open", "a"),
				b: skin("open", "b")
			},
			memory: {
				a: skin("memory", "a"),
				b: skin("memory", "b")
			},
			today: {
				a: skin("today", "a"),
				b: skin("today", "b")
			},
			bridge: {
				a: skin("bridge", "a"),
				b: skin("bridge", "b")
			}
		};
	});
	return {
		voice,
		author,
		epoch,
		persona: brief.persona,
		openers,
		moods,
		tails,
		facts,
		pen
	};
}
function asQuad(list) {
	if (list.length !== 4 || !prefixFree(list)) throw new Error("说法没有站稳");
	return list;
}
function forgeNotes(brief, voice, author, epoch, rich) {
	const salt = `${author}|${voice}|${epoch}`;
	const out = [];
	let t = 0;
	while (out.length < 16) {
		if (t > 400) throw new Error("附言拼不够");
		const fact = brief.facts[(t + epoch) % brief.facts.length];
		const bits = pieces(fact.text).join("");
		const start = (t * 2 + mix(salt)) % Math.max(1, bits.length - 4);
		const clip = bits.slice(start, start + 8 + t % 5) || fact.text.slice(0, 8);
		const form = t % (rich ? 6 : 2);
		let note = "";
		if (!rich || form === 0) note = `${fact.anchor}:${clip}`;
		else if (form === 1) note = `${fact.anchor}/${clip}`;
		else if (form === 2) note = `${voice}:${fact.anchor}:${clip}`;
		else if (form === 3) note = `${fact.anchor} ${clip}`;
		else if (form === 4) note = `${clip}→${fact.anchor}`;
		else note = `${fact.anchor}#${clip}`;
		t++;
		note = note.replace(/[\n\r"]/g, "").slice(0, 48);
		if (!note || out.includes(note)) continue;
		out.push(note);
	}
	const lens = out.map((note) => note.length);
	const min = Math.min(...lens);
	if (Math.max(...lens) > min * 3) throw new Error("附言长短差得太大");
	return out;
}
function quadOf(value, label, punct) {
	if (!Array.isArray(value) || value.length !== 4) throw new Error(`${label}需要四条`);
	const list = value.map((item, i) => stringItem(item, `${label}${i}`, punct));
	if (!prefixFree(list)) throw new Error(`${label}里有彼此遮住的句子`);
	return list;
}
function stringItem(value, label, punct) {
	if (typeof value !== "string") throw new Error(`${label}不是句子`);
	const text = value.trim().replace(/\s+/g, "");
	if (!text.endsWith(punct)) throw new Error(`${label}要以${punct}收束`);
	if (mentionsPublicScript(text)) throw new Error(`${label}撞上了公开话题表`);
	return text;
}
function sixteen(value, label, punct) {
	if (!Array.isArray(value) || value.length !== 16) throw new Error(`${label}需要十六条`);
	const list = value.map((item, i) => stringItem(item, `${label}${i}`, punct));
	if (!prefixFree(list)) throw new Error(`${label}里有彼此遮住的句子`);
	return list;
}
function parseRemoteSpeech(raw, brief, voice, author, epoch) {
	const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/g, "").trim();
	let parsed;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		throw new Error("模型没有返回成稿");
	}
	const openers = sixteen(parsed.openers, "起句", "，");
	const moods = sixteen(parsed.moods, "口气", "，");
	const tails = sixteen(parsed.tails, "收句", "。");
	const rows = parsed.facts;
	if (!Array.isArray(rows) || rows.length !== brief.facts.length) throw new Error("模型改动了事实的件数");
	const facts = brief.facts.map((fact, index) => {
		const got = rows[index];
		const phase = (name, slot) => {
			const list = quadOf(got?.[name]?.[slot], `${fact.anchor}${name}${slot}`, "，");
			if (name === "bridge" && slot === "a" && list.some((item) => !item.includes("{here}"))) throw new Error("转折要留住这一件的锚点");
			if (name === "bridge" && slot === "b" && list.some((item) => !item.includes("{next}"))) throw new Error("转折要指向下一件");
			if (name !== "bridge" && list.some((item) => !item.includes(fact.anchor))) throw new Error("句子离开了这一件事实");
			return list;
		};
		return {
			anchor: fact.anchor,
			text: fact.text,
			open: {
				a: phase("open", "a"),
				b: phase("open", "b")
			},
			memory: {
				a: phase("memory", "a"),
				b: phase("memory", "b")
			},
			today: {
				a: phase("today", "a"),
				b: phase("today", "b")
			},
			bridge: {
				a: phase("bridge", "a"),
				b: phase("bridge", "b")
			}
		};
	});
	return {
		voice,
		author,
		epoch,
		persona: brief.persona,
		openers,
		moods,
		tails,
		facts,
		pen: "本地模型"
	};
}
function parseRemoteNotes(raw) {
	const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/g, "").trim();
	let parsed;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		throw new Error("模型没有返回附言");
	}
	const list = Array.isArray(parsed) ? parsed : parsed.notes;
	if (!Array.isArray(list) || list.length !== 16) throw new Error("附言要十六条");
	const notes = list.map((item, i) => {
		if (typeof item !== "string") throw new Error(`附言${i}不是文字`);
		const note = item.replace(/[\n\r"]/g, "").trim();
		if (!note || note.length > 48) throw new Error(`附言${i}太长或是空的`);
		return note;
	});
	if (new Set(notes).size !== 16) throw new Error("附言有重复");
	return notes;
}
async function complete(url, model, system, user) {
	const response = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			model,
			temperature: .4,
			stream: false,
			messages: [{
				role: "system",
				content: system
			}, {
				role: "user",
				content: user
			}]
		}),
		signal: AbortSignal.timeout(25e3)
	});
	if (!response.ok) throw new Error(`本地模型回应 ${response.status}`);
	const body = await response.json();
	const text = body.choices?.[0]?.message?.content ?? body.message?.content ?? body.response ?? "";
	if (!text.trim()) throw new Error("本地模型没有写出内容");
	return text;
}
var SPEECH_SYSTEM = "你在上线前为一份私稿写表面说法。只输出 JSON，不要解释。句子必须使用私稿里的词，不要写成通用闲聊套话。列表里的句子不能彼此作为前缀。";
async function forgeSpeechRemote(url, model, brief, voice, author, epoch) {
	const facts = brief.facts.map((fact) => `${fact.anchor}｜${fact.text}`).join("\n");
	return parseRemoteSpeech(await complete(url, model, SPEECH_SYSTEM, `纪元 ${epoch}，作者 ${author}，口气 ${voice}。
人设：${brief.persona}
事实：
${facts}

返回一个 JSON 对象，键为 openers、moods、tails、facts。
openers 十六条，每条以逗号结尾。
moods 十六条，每条以逗号结尾。
tails 十六条，每条以句号结尾。
facts 与上面的事实等长、同序。每件含 open、memory、today、bridge，各自有 a、b 两个数组，每个数组四条，以逗号结尾。
open、memory、today 的每条都要含该件锚点。
bridge.a 的每条含 {here}，bridge.b 的每条含 {next}，这两个记号原样保留。`), brief, voice, author, epoch);
}
async function forgeNotesRemote(url, model, brief, voice, author, epoch) {
	const facts = brief.facts.map((fact) => `${fact.anchor}｜${fact.text}`).join("\n");
	return parseRemoteNotes(await complete(url, model, "你在给一个已经定好字段的程序写附言。不要改字段名，不要输出对象，只输出十六条字符串的 JSON 数组。", `纪元 ${epoch}，作者 ${author}，口气 ${voice}。
人设：${brief.persona}
事实：
${facts}

只输出 JSON 字符串数组，十六条。每条是程序附言，短，不含换行和引号，长度彼此接近，意思来自这些事实，十六条彼此不同。不要解释。`));
}
var EPISODE_WEIGHTS = [
	1,
	4,
	8,
	11,
	10,
	8,
	6,
	4,
	3,
	2,
	2,
	1
];
var ORDERS = [
	[
		"opener",
		"mood",
		"a",
		"b",
		"tail"
	],
	[
		"opener",
		"a",
		"mood",
		"b",
		"tail"
	],
	[
		"opener",
		"mood",
		"b",
		"a",
		"tail"
	],
	[
		"opener",
		"a",
		"b",
		"mood",
		"tail"
	]
];
var SHIFT = {
	opener: 12,
	mood: 8,
	a: 6,
	b: 4,
	tail: 0
};
var BITS = {
	opener: 4,
	mood: 4,
	a: 2,
	b: 2,
	tail: 4
};
var SALT = {
	opener: 3,
	mood: 5,
	a: 7,
	b: 11,
	tail: 13
};
function piece(n, shift, width) {
	return Math.floor(n / 2 ** shift) % 2 ** width;
}
function rot(seq, salt, n) {
	if (n <= 1) return 0;
	return (Math.imul(seq + 1, salt) >>> 0) % n;
}
function take(line, options) {
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
	return {
		index: best,
		rest: line.slice(options[best].length)
	};
}
function episodeLength(rng) {
	let x = rng.int(60);
	for (let i = 0; i < EPISODE_WEIGHTS.length; i++) {
		if (x < EPISODE_WEIGHTS[i]) return 4 + i;
		x -= EPISODE_WEIGHTS[i];
	}
	return 8;
}
function otherFact(rng, current, previous, n) {
	const banned = /* @__PURE__ */ new Set([current]);
	if (previous >= 0 && previous !== current) banned.add(previous);
	let x = rng.int(n - banned.size);
	for (let i = 0; i < n; i++) {
		if (banned.has(i)) continue;
		if (x === 0) return i;
		x--;
	}
	throw new Error("事实不够换");
}
function assertFree(list) {
	const sorted = [...list].sort();
	for (let i = 1; i < sorted.length; i++) if (sorted[i].startsWith(sorted[i - 1])) throw new Error("成稿里有彼此遮住的句子");
}
function fill(pattern, here, next) {
	return pattern.replaceAll("{here}", here).replaceAll("{next}", next);
}
var PrivateCodec = class {
	bank;
	bytesPerLine = 2;
	last = {
		topicId: "",
		label: "",
		phase: "open",
		focus: "",
		hint: "",
		fact: ""
	};
	rng;
	seq = 0;
	factIndex = 0;
	nextIndex = 1;
	episodeStart = -1;
	episodeLen = 0;
	left = 0;
	constructor(bank, seed) {
		this.bank = bank;
		this.rng = new Rng(seed);
	}
	roll() {
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
	phase() {
		const pos = this.seq - this.episodeStart;
		if (pos <= 0) return "open";
		if (pos >= this.episodeLen - 1) return "bridge";
		if (pos === this.episodeLen - 2) return "today";
		return "memory";
	}
	lists() {
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
			fact: fact.text
		};
		const here = fact.anchor;
		const hint = next.anchor;
		const slots = {
			opener: this.bank.openers,
			mood: this.bank.moods,
			a: skin.a.map((item) => fill(item, here, hint)),
			b: skin.b.map((item) => fill(item, here, hint)),
			tail: this.bank.tails
		};
		assertFree(slots.a);
		assertFree(slots.b);
		return slots;
	}
	finish() {
		this.left -= 1;
		this.seq += 1;
	}
	emit(index) {
		const slots = this.lists();
		const order = ORDERS[this.seq % ORDERS.length];
		let line = "";
		for (const name of order) {
			const list = slots[name];
			const opt = (piece(index, SHIFT[name], BITS[name]) + rot(this.seq, SALT[name], list.length)) % list.length;
			line += list[opt];
		}
		this.finish();
		return line;
	}
	absorb(line) {
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
};
function cursorAt(seed, dir, seq) {
	const alphabet = "0123456789abcdefghij";
	let n = 2166136261 ^ dir.charCodeAt(0);
	for (let i = 0; i < seed.length; i++) {
		n ^= seed[i];
		n = Math.imul(n, 16777619);
	}
	n ^= seq + 1;
	let out = "c.";
	for (let i = 0; i < 10; i++) {
		n = Math.imul(n ^ i + 9, 16777619);
		out += alphabet[(n >>> 0) % 20];
	}
	return out;
}
var ProgramCodec = class {
	card;
	notes;
	dir;
	seed;
	respond;
	bytesPerLine = 1;
	last = {
		topicId: "",
		label: "",
		phase: "open",
		focus: "",
		hint: "",
		fact: ""
	};
	state;
	constructor(card, notes, dir, seed, respond) {
		this.card = card;
		this.notes = notes;
		this.dir = dir;
		this.seed = seed;
		this.respond = respond;
		if (notes.length !== 16) throw new Error("附言要十六条");
		const origin = 2400 + (seed[0] << 8 | seed[1]) % 7e3;
		this.state = {
			seq: 0,
			req: origin,
			at: 173e7 + seed[3] * 3600 + (dir === "s2c" ? 40 : 0)
		};
	}
	material() {
		const keys = this.card.keys;
		const seq = this.state.seq;
		const body = {};
		body[keys.op] = "";
		body[keys.shelf] = "";
		body[keys.req] = this.state.req;
		body[keys.cursor] = cursorAt(this.seed, this.dir, seq);
		body[keys.at] = this.state.at;
		body[keys.note] = "";
		if (this.respond) body[keys.ok] = true;
		return body;
	}
	advance() {
		const step = 2 + this.seed[(this.state.seq + this.dir.length) % this.seed.length] % 5;
		this.state.seq += 1;
		this.state.req += 1;
		this.state.at += step;
	}
	paint(index, into) {
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
			fact: String(into[keys.note])
		};
	}
	emit(index) {
		const body = this.material();
		this.paint(index, body);
		const line = JSON.stringify(body);
		this.advance();
		return line;
	}
	absorb(line) {
		let parsed;
		try {
			parsed = JSON.parse(line);
		} catch {
			throw new Error("这行不是程序的说法");
		}
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("这行不是程序的说法");
		const got = parsed;
		const expect = this.material();
		const gotKeys = Object.keys(got);
		const expectKeys = Object.keys(expect);
		if (gotKeys.length !== expectKeys.length || gotKeys.some((key, i) => key !== expectKeys[i])) throw new Error("字段或顺序变了");
		const keys = this.card.keys;
		if (got[keys.req] !== expect[keys.req]) throw new Error("计数没有接上");
		if (got[keys.cursor] !== expect[keys.cursor]) throw new Error("游标换了写法");
		if (got[keys.at] !== expect[keys.at]) throw new Error("时钟断了");
		if (this.respond && got[keys.ok] !== true) throw new Error("结果字段变了");
		const seq = this.state.seq;
		const op = logicalOf(got[keys.op], this.card.ops, rot(seq, 3, 4));
		const shelf = logicalOf(got[keys.shelf], this.card.shelves, rot(seq, 5, 4));
		const note = logicalOf(String(got[keys.note] ?? ""), this.notes, rot(seq, 7, 16));
		this.paint(op << 6 | shelf << 4 | note, expect);
		this.advance();
		return op << 6 | shelf << 4 | note;
	}
};
function logicalOf(value, list, turn) {
	const found = list.indexOf(String(value));
	if (found < 0) throw new Error("取值跑出了这版合同");
	return (found - turn + list.length) % list.length;
}
function inspectProgram(lines, card) {
	const notes = [];
	const groups = /* @__PURE__ */ new Map();
	for (const line of lines) {
		let parsed;
		try {
			parsed = JSON.parse(line.text);
		} catch {
			return {
				ok: false,
				notes: ["有一行不是程序的说法"]
			};
		}
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {
			ok: false,
			notes: ["有一行不是对象"]
		};
		const list = groups.get(line.dir) ?? [];
		list.push(parsed);
		groups.set(line.dir, list);
	}
	const requestKeys = [
		card.keys.op,
		card.keys.shelf,
		card.keys.req,
		card.keys.cursor,
		card.keys.at,
		card.keys.note
	];
	const responseKeys = [...requestKeys, card.keys.ok];
	let echoed = true;
	const reqs = /* @__PURE__ */ new Map();
	for (const [dir, list] of groups) {
		const keyText = (dir === "乙" ? responseKeys : requestKeys).join(" ");
		if (list.some((row) => Object.keys(row).join(" ") !== keyText)) notes.push(`${dir}的字段或顺序中途变了`);
		else notes.push(`${dir}每一句的字段都是 ${keyText}`);
		const cursors = list.map((row) => String(row[card.keys.cursor]));
		const clocks = list.map((row) => row[card.keys.at]);
		const req = list.map((row) => row[card.keys.req]);
		reqs.set(dir, req.filter((item) => typeof item === "number"));
		if (cursors.some((cursor) => !/^c\.[0-9a-j]{10}$/.test(cursor))) notes.push(`${dir}的游标换了字母表或长度`);
		else notes.push(`${dir}的游标始终是 c. 加十位，只换字符`);
		if (clocks.some((item) => typeof item !== "number")) notes.push(`${dir}的时钟改了类型`);
		else if (clocks.some((item, i) => i > 0 && item <= clocks[i - 1])) notes.push(`${dir}的时钟没有只增`);
		else notes.push(`${dir}的时钟只增不减`);
		if (req.some((item, i) => typeof item !== "number" || i > 0 && item !== req[i - 1] + 1)) notes.push(`${dir}的计数没有逐句加一`);
		else notes.push(`${dir}的计数逐句加一`);
		if (list.some((row) => !card.ops.includes(String(row[card.keys.op])))) notes.push(`${dir}的操作跑出了取值表`);
		if (list.some((row) => !card.shelves.includes(String(row[card.keys.shelf])))) notes.push(`${dir}的分类跑出了取值表`);
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
	return {
		ok: !notes.some((note) => /变了|跑出|没有|断了|改了|不是|换了|不该/.test(note)) && echoed,
		notes
	};
}
function merge$1(parts) {
	const n = parts.reduce((sum, part) => sum + part.length, 0);
	const out = new Uint8Array(n);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}
function dirSeed(seed, dir) {
	const out = new Uint8Array(seed);
	out[31] ^= dir.charCodeAt(0);
	return out;
}
function roundtrip(dir, make, payload) {
	const frames = new PhrasePipe(make(), make()).encode(utf8(payload));
	const receiver = new PhrasePipe(make(), make());
	const parts = [];
	for (const frame of frames) for (const part of receiver.pushLine(frame.line)) parts.push(part);
	const recovered = text(merge$1(parts));
	return {
		lines: frames.map((frame) => ({
			dir,
			text: frame.line,
			anchor: frame.meta.label,
			token: frame.meta.focus,
			phase: frame.meta.phase,
			fact: frame.meta.fact
		})),
		recovered,
		match: recovered === payload
	};
}
function speechContinuity(lines) {
	const notes = [];
	const client = lines.filter((line) => line.dir === "甲");
	const finished = [];
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
	return {
		ok: !drifted && finished.every((len) => len >= 4),
		notes
	};
}
async function walkAudit(opts) {
	const epoch = Math.max(1, Math.floor(opts.epoch) || 1);
	const payload = opts.payload;
	if (!payload.trim()) throw new Error("原文是空的");
	const seed = /* @__PURE__ */ new Uint8Array(32);
	crypto.getRandomValues(seed);
	let warning = "";
	let pen = "公开剧本";
	if (opts.dialect === "speech" && opts.posture === "none") {
		const gone = roundtrip("甲", () => new Codec("talk", dirSeed(seed, "甲")), payload);
		const back = roundtrip("乙", () => new Codec("talk", dirSeed(seed, "乙")), payload);
		const lines = [...gone.lines, ...back.lines];
		const publicHits = lines.filter((line) => hitsPublicScript(line.text)).length;
		return {
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
			frozen: null
		};
	}
	const brief = parseBrief(opts.briefText);
	const remote = opts.remote?.url.trim() ? opts.remote : null;
	const voices = opts.posture === "one" ? [{
		voice: "甲",
		author: "甲"
	}, {
		voice: "乙",
		author: "甲"
	}] : opts.posture === "both" ? [{
		voice: "甲",
		author: "甲"
	}, {
		voice: "乙",
		author: "乙"
	}] : [{
		voice: "合",
		author: "私稿"
	}];
	if (opts.dialect === "speech") {
		const banks = [];
		for (const voice of voices) {
			if (remote && opts.posture !== "none") try {
				banks.push(await forgeSpeechRemote(remote.url.trim(), remote.model.trim() || "local", brief, voice.voice, voice.author, epoch));
				pen = "本地模型";
				continue;
			} catch (err) {
				warning = err instanceof Error ? err.message : "本地模型没有写成";
			}
			banks.push(forgeSpeech(brief, voice.voice, voice.author, epoch));
			if (pen !== "本地模型") pen = "私稿拼接";
		}
		const bankFor = (dir) => opts.posture === "none" ? banks[0] : dir === "甲" ? banks[0] : banks[1];
		const gone = roundtrip("甲", () => new PrivateCodec(bankFor("甲"), dirSeed(seed, "甲")), payload);
		const back = roundtrip("乙", () => new PrivateCodec(bankFor("乙"), dirSeed(seed, "乙")), payload);
		const lines = [...gone.lines, ...back.lines];
		const publicHits = lines.filter((line) => hitsPublicScript(line.text)).length;
		const used = opts.posture === "none" ? [banks[0]] : banks;
		return {
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
				hex: fingerprint(bank)
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
				card: opts.card,
				speech: {
					c2s: bankFor("甲"),
					s2c: bankFor("乙")
				}
			}
		};
	}
	const noteSets = [];
	for (const voice of voices) {
		if (remote && opts.posture !== "none") try {
			const notes = await forgeNotesRemote(remote.url.trim(), remote.model.trim() || "local", brief, voice.voice, voice.author, epoch);
			noteSets.push({
				...voice,
				notes
			});
			pen = "本地模型";
			continue;
		} catch (err) {
			warning = err instanceof Error ? err.message : "本地模型没有写成";
		}
		noteSets.push({
			...voice,
			notes: forgeNotes(brief, voice.voice, voice.author, epoch, opts.posture !== "none")
		});
		if (pen !== "本地模型") pen = opts.posture === "none" ? "私稿原文" : "私稿拼接";
	}
	const notesFor = (dir) => opts.posture === "none" ? noteSets[0].notes : dir === "甲" ? noteSets[0].notes : noteSets[1].notes;
	const respond = {
		甲: false,
		乙: true
	};
	const gone = roundtrip("甲", () => new ProgramCodec(opts.card, notesFor("甲"), "c2s", seed, respond["甲"]), payload);
	const back = roundtrip("乙", () => new ProgramCodec(opts.card, notesFor("乙"), "s2c", seed, respond["乙"]), payload);
	const lines = [...gone.lines, ...back.lines];
	const continuity = inspectProgram(lines, opts.card);
	const publicHits = lines.filter((line) => hitsPublicScript(line.text)).length;
	const shown = interleave(gone.lines, back.lines, 4);
	return {
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
			hex: fingerprint({
				card: opts.card.keys,
				notes: set.notes,
				epoch,
				voice: set.voice,
				author: set.author
			})
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
			card: opts.card,
			notes: {
				c2s: notesFor("甲"),
				s2c: notesFor("乙")
			}
		}
	};
}
function interleave(left, right, pairs) {
	const out = [];
	for (let i = 0; i < pairs && (i < left.length || i < right.length); i++) {
		if (left[i]) out.push(left[i]);
		if (right[i]) out.push(right[i]);
	}
	return out;
}
function speechVerdict(posture, publicHits, pen, warning) {
	return `${posture === "one" ? "只有一端有模型：这一端把甲、乙两套口气都写好，对端只保存成稿。" : posture === "both" ? "两端都有模型：各写自己的出站口气，再把成稿交给对方。解码用的是对方冻住的那一版。" : "没有模型：两套口气都由私稿拼接，仍然不读取程序里的话题表。"}${warning ? `本地模型这次没接上（${warning}），已改用私稿拼接。` : `这一版由${pen}写成，写完即冻住，线上不再问模型。`}公开话题表对上 ${publicHits} 句。观察者拿着程序，也看不到这些句子从哪张表里来。同一纪元用久了仍会循环，换纪元就换表面，协议不动。`;
}
function programVerdict(posture, ok, publicHits, pen) {
	return `${ok ? "字段、类型、计数、游标和时钟都守住了。" : "格式连续性有一处没守住。"}${posture === "none" ? "没有模型时，附言只是私稿的切段，程序的形状仍然连续。" : posture === "one" ? "一端把两套附言都写好交给对端。字段名是合同，模型不许改。" : "两端各写自己方向的附言，字段仍是同一套。"}这一版由${pen}填附言。公开话题表对上 ${publicHits} 句。`;
}
var CARD = programCard(DEMO_CARD_INPUT);
function VeilPanel() {
	const [dialect, setDialect] = (0, import_react.useState)("speech");
	const [posture, setPosture] = (0, import_react.useState)("both");
	const [epoch, setEpoch] = (0, import_react.useState)("3");
	const [brief, setBrief] = (0, import_react.useState)(DEMO_BRIEF);
	const [modelUrl, setModelUrl] = (0, import_react.useState)("");
	const [modelName, setModelName] = (0, import_react.useState)("qwen2.5:7b");
	const [report, setReport] = (0, import_react.useState)(null);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)("");
	async function walk(next = {}) {
		const kind = next.dialect ?? dialect;
		const who = next.posture ?? posture;
		const text = next.brief ?? brief;
		const era = Number(next.epoch ?? epoch) || 1;
		setBusy(true);
		setError("");
		try {
			const got = await walkAudit({
				posture: who,
				dialect: kind,
				briefText: text,
				card: CARD,
				epoch: era,
				payload: "今天下午把窗口的草稿寄出，对方只需要看到一封平常的信。",
				remote: modelUrl.trim() ? {
					url: modelUrl.trim(),
					model: modelName.trim() || "local"
				} : null
			});
			setReport(got);
		} catch (err) {
			setError(err instanceof Error ? err.message : "私稿没走通");
		} finally {
			setBusy(false);
		}
	}
	(0, import_react.useEffect)(() => {
		let cancel = false;
		walkAudit({
			posture: "both",
			dialect: "speech",
			briefText: DEMO_BRIEF,
			card: CARD,
			epoch: 3,
			payload: "今天下午把窗口的草稿寄出，对方只需要看到一封平常的信。"
		}).then((got) => {
			if (!cancel) setReport(got);
		}).catch((err) => {
			if (!cancel) setError(err instanceof Error ? err.message : "私稿没走通");
		});
		return () => {
			cancel = true;
		};
	}, []);
	function download() {
		if (!report?.frozen) return;
		const blob = new Blob([JSON.stringify(report.frozen, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "surface.json";
		link.click();
		URL.revokeObjectURL(url);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "mt-10 grid gap-4 rounded-card border border-border bg-surface p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-xl text-fg",
				children: "手里有程序，也读不出这套说法"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-sm text-muted",
				children: "公开话题表留在程序里，只作对照。真正对外的句子来自私稿，模型只在换纪元时离线写一版，写完就冻住，两边各存同一份。线上不再问模型。观察者就算拿着程序，没有这份额外的成稿，对不上槽位。"
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Choice, {
					active: dialect === "speech",
					label: "闲聊",
					note: "私稿里的事，换着说法",
					onClick: () => {
						setDialect("speech");
						walk({ dialect: "speech" });
					}
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Choice, {
					active: dialect === "program",
					label: "程序",
					note: "字段不动，只换附言",
					onClick: () => {
						setDialect("program");
						walk({ dialect: "program" });
					}
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Choice, {
						active: posture === "none",
						label: "没有模型",
						note: dialect === "speech" ? "仍用程序里的话题表" : "附言只是私稿切段",
						onClick: () => {
							setPosture("none");
							walk({ posture: "none" });
						}
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Choice, {
						active: posture === "one",
						label: "一端有模型",
						note: "这一端写好两边的口气",
						onClick: () => {
							setPosture("one");
							walk({ posture: "one" });
						}
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Choice, {
						active: posture === "both",
						label: "两端都有",
						note: "各写自己的出站，再交换",
						onClick: () => {
							setPosture("both");
							walk({ posture: "both" });
						}
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "grid gap-2 text-sm text-muted",
				children: ["私稿，不放进程序", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
					value: brief,
					onChange: (e) => setBrief(e.target.value),
					rows: 5,
					className: "w-full resize-y rounded-card border border-border bg-bg px-3 py-3 text-base text-fg"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-3 sm:grid-cols-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "grid gap-1 text-sm text-muted",
					children: ["纪元", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						inputMode: "numeric",
						value: epoch,
						onChange: (e) => setEpoch(e.target.value.replace(/[^\d]/g, "").slice(0, 4)),
						className: "h-11 rounded-card border border-border bg-bg px-3 text-base text-fg"
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "grid gap-1 text-sm text-muted sm:col-span-2",
					children: ["本地模型地址，可空", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						value: modelUrl,
						onChange: (e) => setModelUrl(e.target.value),
						placeholder: "http://127.0.0.1:11434/v1/chat/completions",
						className: "h-11 rounded-card border border-border bg-bg px-3 text-base text-fg"
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "grid gap-1 text-sm text-muted",
				children: ["模型名", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					value: modelName,
					onChange: (e) => setModelName(e.target.value),
					className: "h-11 rounded-card border border-border bg-bg px-3 text-base text-fg"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-muted",
				children: "推荐 7B 到 8B 的指令模型，四比特或五比特量化，例如 Qwen2.5 7B。3B 经常写坏「只填句子、不改字段」这份合同；14B 句子更稳，但成稿一旦冻住，再大的模型也不出现在线上。两边不要各跑一次模型指望字面相同，温度对不上。一端写好，把成稿交给对端。"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => void walk(),
					disabled: busy,
					className: "h-11 rounded-card bg-sage px-4 text-sage-ink disabled:opacity-50",
					children: busy ? "正在写表面…" : "用这版私稿走一遍"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: download,
					disabled: !report?.frozen,
					className: "h-11 rounded-card border border-border px-4 text-fg disabled:opacity-50",
					children: "下载成稿"
				})]
			}),
			error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-ember",
				children: error
			}) : null,
			report ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AuditView, { report }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-muted",
				children: "正在用默认私稿写一版。"
			})
		]
	});
}
function AuditView({ report }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-fg",
				children: report.verdict
			}),
			report.warning ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-ember",
				children: report.warning
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-sm text-muted",
				children: [
					report.match ? "原文走通了。" : "原文没有走通。",
					" 笔是",
					report.pen,
					"。公开话题表对上 ",
					report.publicHits,
					" 句。纪元 ",
					report.epoch,
					"。",
					report.frozen ? " 这份成稿可以交给另一台机器。" : " 这一档没有私稿成稿。"
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "grid gap-1 text-sm text-muted",
				children: report.continuity.notes.map((note) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: note }, note))
			}),
			report.fingerprints.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-muted",
				children: report.fingerprints.map((item) => `${item.voice}/${item.author} ${item.hex}`).join(" · ")
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "rounded-card bg-paper p-4 text-ink",
				children: report.samples.map((sample, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-3 font-serif break-all first:mt-0",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-sage-ink",
							children: sample.dir
						}),
						" ",
						sample.text
					]
				}, `${sample.dir}-${i}`))
			})
		]
	});
}
function Choice({ active, label, note, onClick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick,
		className: active ? "min-h-11 rounded-card bg-sage px-4 py-2 text-left text-sage-ink" : "min-h-11 rounded-card border border-border px-4 py-2 text-left text-fg",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "block text-sm",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: active ? "block text-sm text-sage-ink" : "block text-sm text-muted",
			children: note
		})]
	});
}
async function runDemo(profile, payload) {
	const clientId = createIdentity("甲");
	const serverId = createIdentity("乙");
	const [clientCtrl, serverCtrl] = memoryPair();
	const [clientData, serverData] = memoryPair();
	const control = [];
	const seen = /* @__PURE__ */ new Set();
	const serverKeysP = startHandshake({
		socket: serverCtrl,
		role: "server",
		self: serverId,
		peerEdPub: unb64url(clientId.edPub),
		peerName: clientId.name,
		profile,
		seen,
		log: (line, meta) => control.push({
			channel: "control",
			from: "server",
			text: line,
			label: meta.label,
			phase: meta.phase,
			focus: meta.focus,
			hint: meta.hint,
			fact: meta.fact
		})
	});
	const clientKeysP = startHandshake({
		socket: clientCtrl,
		role: "client",
		self: clientId,
		peerEdPub: unb64url(serverId.edPub),
		peerName: serverId.name,
		profile,
		log: (line, meta) => control.push({
			channel: "control",
			from: "client",
			text: line,
			label: meta.label,
			phase: meta.phase,
			focus: meta.focus,
			hint: meta.hint,
			fact: meta.fact
		})
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
	const got = [];
	stream.onData((chunk) => got.push(chunk));
	await stream.ready;
	stream.write(raw);
	stream.close();
	const recovered = merge(got);
	const data = collect(clientTunnel, "client").concat(collect(serverTunnel, "server"));
	const wireText = control.map((l) => l.text).concat(data.map((l) => l.text)).join("\n");
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
		samples: pickSamples(clientLines)
	};
}
function collect(tunnel, from) {
	return tunnel.outgoing.map((item) => ({
		channel: "data",
		from,
		text: item.text,
		label: item.meta.label,
		phase: item.meta.phase,
		focus: item.meta.focus,
		hint: item.meta.hint,
		fact: item.meta.fact
	}));
}
function merge(parts) {
	const n = parts.reduce((s, p) => s + p.length, 0);
	const out = new Uint8Array(n);
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}
function episodeTopics(lines) {
	const out = [];
	for (const line of lines) if (out[out.length - 1] !== line.label) out.push(line.label);
	return out;
}
function episodeLens(lines) {
	const out = [];
	let n = 0;
	let prev = "";
	for (const line of lines) if (line.label !== prev) {
		if (n) out.push(n);
		prev = line.label;
		n = 1;
	} else n++;
	if (n) out.push(n);
	return out;
}
function countDupes(lines) {
	const seen = /* @__PURE__ */ new Set();
	let n = 0;
	for (const line of lines) {
		if (seen.has(line)) n++;
		seen.add(line);
	}
	return n;
}
function pickSamples(lines) {
	const out = [];
	let i = 0;
	while (i < lines.length && out.length < 3) {
		const label = lines[i].label;
		const focus = lines[i].focus;
		const group = [];
		while (i < lines.length && lines[i].label === label && lines[i].focus === focus && group.length < 4) {
			group.push(lines[i].text);
			i++;
		}
		while (i < lines.length && lines[i].label === label) i++;
		if (group.length >= 3) out.push({
			label,
			focus,
			lines: group
		});
	}
	return out;
}
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var proveSockets = createServerFn({ method: "POST" }).validator((data) => {
	if (data.profile !== "talk" && data.profile !== "dense") throw new Error("档位不对");
	if (typeof data.payload !== "string" || data.payload.length < 1 || data.payload.length > 2e3) throw new Error("内容太短或太长");
	return {
		profile: data.profile,
		payload: data.payload
	};
}).handler(createSsrRpc("b9af0695afd87b7f3eb911e01f2d3f448b280198bda37e48a2838009c1aa1d8b"));
var DEFAULT_PAYLOAD = "今天下午把窗口的草稿寄出，对方只需要看到一封平常的信。";
function num(n, digits) {
	if (!Number.isFinite(n)) return "—";
	return n.toFixed(digits);
}
function verdictOf(result) {
	const gzip = result.wire.gzipRatio < .75 && result.cipher.gzipRatio > .85;
	const ent = result.wire.shannon + .3 < result.cipher.shannon;
	const chi = result.wire.chiSquare > result.cipher.chiSquare;
	if (gzip && ent && chi) return "熵、相关、卡方和压缩率都落在闲聊一侧。抽样读的时候，一段里事实不变，只是换了说法。";
	return "有一项贴得太近。对话档通常比稠密档离密文更远；稠密档换来的是体积。";
}
function Console() {
	const [profile, setProfile] = (0, import_react.useState)("talk");
	const [payload, setPayload] = (0, import_react.useState)(DEFAULT_PAYLOAD);
	const [result, setResult] = (0, import_react.useState)(null);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)("");
	const [socket, setSocket] = (0, import_react.useState)(null);
	const [socketBusy, setSocketBusy] = (0, import_react.useState)(false);
	const [socketError, setSocketError] = (0, import_react.useState)("");
	const [controlPort, setControlPort] = (0, import_react.useState)("4711");
	const [dataPort, setDataPort] = (0, import_react.useState)("4712");
	const [socksPort, setSocksPort] = (0, import_react.useState)("1080");
	const [mapPort, setMapPort] = (0, import_react.useState)("15432");
	const [pair, setPair] = (0, import_react.useState)(null);
	async function walk(nextProfile = profile, nextPayload = payload) {
		setBusy(true);
		setError("");
		try {
			const demo = await runDemo(nextProfile, nextPayload);
			setResult(demo);
		} catch (err) {
			setError(err instanceof Error ? err.message : "没走通");
		} finally {
			setBusy(false);
		}
	}
	(0, import_react.useEffect)(() => {
		let cancel = false;
		runDemo("talk", DEFAULT_PAYLOAD).then((demo) => {
			if (!cancel) setResult(demo);
		}).catch((err) => {
			if (!cancel) setError(err instanceof Error ? err.message : "没走通");
		});
		const mine = createIdentity("甲");
		const other = createIdentity("乙");
		setPair({
			mine,
			other,
			peer: publicIdentity(other),
			minePub: publicIdentity(mine)
		});
		return () => {
			cancel = true;
		};
	}, []);
	async function walkSockets() {
		setSocketBusy(true);
		setSocketError("");
		try {
			const proof = await proveSockets({ data: {
				profile,
				payload: payload.slice(0, 180)
			} });
			setSocket(proof);
		} catch (err) {
			setSocketError(err instanceof Error ? err.message : "套接字没走通");
		} finally {
			setSocketBusy(false);
		}
	}
	const dataLines = result?.data.filter((line) => line.from === "client").slice(0, 18) ?? [];
	const controlLines = result?.control.filter((line) => line.from === "client").slice(0, 3) ?? [];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "max-w-2xl",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-sage",
						children: "闲话"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "mt-2 text-3xl text-fg",
						children: "两台机器之间，线上只看见闲聊"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 text-muted",
						children: "控制口先用长期公钥做一次握手，数据口再用会话密钥走流量。两口分开，都可以改。外面做统计，看到的是汉字和压缩率；偶尔抽一段来读，话题是连贯的，不会同一句翻来覆去。"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-8 grid gap-4 rounded-card border border-border bg-surface p-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProfileButton, {
							active: profile === "talk",
							onClick: () => setProfile("talk"),
							label: "对话档",
							note: "更像人说话，体积大"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProfileButton, {
							active: profile === "dense",
							onClick: () => setProfile("dense"),
							label: "稠密档",
							note: "同一套事实，多补几句"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "grid gap-2 text-sm text-muted",
						children: ["要送过去的原文", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
							value: payload,
							onChange: (e) => setPayload(e.target.value),
							rows: 3,
							className: "w-full resize-y rounded-card border border-border bg-bg px-3 py-3 text-base text-fg"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => void walk(),
						disabled: busy || payload.trim().length === 0,
						className: "h-11 rounded-card bg-sage px-4 text-sage-ink disabled:opacity-50",
						children: busy ? "正在走…" : "走一遍"
					}),
					error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-ember",
						children: error
					}) : null
				]
			}),
			result ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Report, {
				result,
				dataLines,
				controlLines
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-8 text-muted",
				children: "正在把默认的那封信走完。"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-10 grid gap-4 rounded-card border border-border bg-surface p-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-xl text-fg",
						children: "真实的两口套接字"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-sm text-muted",
						children: "这一步会真的听两个不同的口，再用 SOCKS、HTTP CONNECT 和一条固定映射把原文送回去。预览里口是临时的；下面的数字是你分到两台机器上时用的。"
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid grid-cols-2 gap-3 sm:grid-cols-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "控制口",
								value: controlPort,
								onChange: setControlPort
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "数据口",
								value: dataPort,
								onChange: setDataPort
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "本地代理",
								value: socksPort,
								onChange: setSocksPort
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "固定映射",
								value: mapPort,
								onChange: setMapPort
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => void walkSockets(),
						disabled: socketBusy,
						className: "h-11 rounded-card border border-sage px-4 text-sage disabled:opacity-50",
						children: socketBusy ? "套接字进行中…" : "用套接字再走一遍"
					}),
					socketError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-ember",
						children: socketError
					}) : null,
					socket ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid gap-2 text-sm",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: socket.match ? "text-sage" : "text-ember",
								children: [socket.match ? "原文从代理和映射两端都原样回来了。" : "有一路没有原样回来。", socket.differentPorts ? ` 控制口 ${socket.controlPort}，数据口 ${socket.dataPort}。` : ""]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-muted",
								children: [
									"线上压缩比 ",
									num(socket.wire.gzipRatio, 2),
									"，同长度密文 ",
									num(socket.cipher.gzipRatio, 2),
									"。汉字占比 ",
									num(socket.wire.cjkRatio * 100, 0),
									"%。"
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "rounded-card bg-paper p-4 text-ink",
								children: socket.sample.map((line, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-2 font-serif first:mt-0",
									children: line
								}, `${i}-${line.slice(0, 12)}`))
							})
						]
					}) : null
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(VeilPanel, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-10 grid gap-4 lg:grid-cols-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
					className: "rounded-card border border-border bg-surface p-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "text-xl",
							children: "留下的那一端"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-2 text-sm text-muted",
							children: [
								"监听控制口 ",
								controlPort || "—",
								" 和数据口 ",
								dataPort || "—",
								"。手里是自己的私钥，和对方的公钥。握手谈定档位，数据口不再换一套说法。"
							]
						}),
						pair ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeyBlock, {
							title: "甲的公钥，交给乙",
							value: JSON.stringify(pair.minePub)
						}) : null
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
					className: "rounded-card border border-border bg-surface p-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "text-xl",
							children: "出去的那一端"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-2 text-sm text-muted",
							children: [
								"连到对面的两个口。本地 ",
								socksPort || "—",
								" 给会设代理的程序，",
								mapPort || "—",
								" 给不能设代理的程序，映射到对端再拨出去的地址。应用本身不改协议。"
							]
						}),
						pair ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeyBlock, {
							title: "乙的公钥，交给甲",
							value: JSON.stringify(pair.peer)
						}) : null
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-8 max-w-2xl text-sm text-muted",
				children: "换题间隔由会话密钥决定，两边相同，看起来不规则。没有私稿时，拿到程序的人能认出公开话题表。带上成稿以后，程序里的那张表对不上线上的句子；成稿本身不走这两口，换纪元就换一版。"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-sm",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
					className: "text-sage underline",
					href: "/xianhua-peer.zip",
					children: "下载两端用的程序"
				})
			})
		]
	});
}
function ProfileButton({ active, onClick, label, note }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick,
		className: active ? "min-h-11 rounded-card bg-sage px-4 py-2 text-left text-sage-ink" : "min-h-11 rounded-card border border-border px-4 py-2 text-left text-fg",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "block text-sm",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: active ? "block text-sm text-sage-ink" : "block text-sm text-muted",
			children: note
		})]
	});
}
function Field({ label, value, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "grid min-w-0 gap-1 text-sm text-muted",
		children: [label, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			inputMode: "numeric",
			value,
			onChange: (e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 5)),
			className: "h-11 w-full min-w-0 rounded-card border border-border bg-bg px-3 text-base text-fg"
		})]
	});
}
function KeyBlock({ title, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "mt-4 grid gap-1 text-sm text-muted",
		children: [title, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
			readOnly: true,
			rows: 3,
			value,
			className: "w-full resize-none rounded-card border border-border bg-bg px-3 py-2 font-serif text-sm text-fg"
		})]
	});
}
function Report({ result, dataLines, controlLines }) {
	const rows = [
		[
			"熵",
			num(result.wire.shannon, 2),
			num(result.cipher.shannon, 2)
		],
		[
			"相邻相关",
			num(result.wire.serial, 3),
			num(result.cipher.serial, 3)
		],
		[
			"卡方",
			num(result.wire.chiSquare, 0),
			num(result.cipher.chiSquare, 0)
		],
		[
			"压缩比",
			num(result.wire.gzipRatio, 2),
			num(result.cipher.gzipRatio, 2)
		],
		[
			"汉字占比",
			`${num(result.wire.cjkRatio * 100, 0)}%`,
			"—"
		]
	];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "mt-8 grid gap-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-fg",
				children: verdictOf(result)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-sm text-muted",
				children: [
					result.match ? "对端收回的原文一致。" : "对端收回的原文不一致。",
					" 体积大约 ",
					num(result.expansion, 1),
					" 倍。重复句 ",
					result.duplicateLines,
					"。换题间隔",
					" ",
					result.episodeLengths.join("、"),
					"。"
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "overflow-hidden rounded-card border border-border",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid grid-cols-3 bg-surface-2 px-3 py-2 text-sm text-muted",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "统计" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "线上" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "内层密文" })
					]
				}), rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid grid-cols-3 border-t border-border px-3 py-2 text-sm",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-muted",
							children: row[0]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: row[1] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-ember",
							children: row[2]
						})
					]
				}, row[0]))]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex flex-wrap gap-2",
				children: result.topics.map((topic, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "rounded-card bg-surface-2 px-3 py-2 text-sm text-sage",
					children: [topic, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "text-muted",
						children: [" ", result.episodeLengths[i] ?? ""]
					})]
				}, `${topic}-${i}`))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-4 lg:grid-cols-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
					className: "rounded-card bg-paper p-4 text-ink",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-sm text-sage-ink",
						children: "数据口"
					}), dataLines.map((line, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-3",
						children: [i === 0 || line.label !== dataLines[i - 1]?.label ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-sm text-sage-ink",
							children: [
								line.label,
								" · ",
								line.focus,
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "block text-ink",
									children: line.fact
								})
							]
						}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 font-serif",
							children: line.text
						})]
					}, `${line.text}-${i}`))]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
						className: "rounded-card bg-paper p-4 text-ink",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "text-sm text-sage-ink",
							children: "控制口开头"
						}), controlLines.map((line, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 font-serif",
							children: line.text
						}, `c-${i}`))]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
						className: "rounded-card border border-border p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "text-sm text-muted",
							children: "抽样三段"
						}), result.samples.map((sample) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-sm text-sage",
								children: [
									sample.label,
									" · ",
									sample.focus
								]
							}), sample.lines.map((line, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-sm text-fg",
								children: line
							}, `${sample.label}-${i}`))]
						}, `${sample.label}-${sample.focus}`))]
					})]
				})]
			})
		]
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Console, {});
}
//#endregion
export { Home as component };
