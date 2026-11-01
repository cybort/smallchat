import { n as x25519, r as sha256, t as ed25519 } from "../_libs/noble__curves+noble__hashes.mjs";
import { t as chacha20poly1305 } from "../_libs/noble__ciphers.mjs";
import { n as hmac, t as hkdf } from "../_libs/noble__hashes.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/wire-Cct7XKhD.js
function concat(parts) {
	const n = parts.reduce((s, p) => s + p.length, 0);
	const out = new Uint8Array(n);
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}
function utf8(s) {
	return new TextEncoder().encode(s);
}
function text(b) {
	return new TextDecoder().decode(b);
}
function b64url(b) {
	let s = "";
	for (const x of b) s += String.fromCharCode(x);
	return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function unb64url(s) {
	const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - s.length % 4);
	const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/") + pad);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}
function equalBytes(a, b) {
	if (a.length !== b.length) return false;
	let d = 0;
	for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
	return d === 0;
}
function createIdentity(name) {
	const k = ed25519.keygen();
	return {
		v: 1,
		name,
		edPub: b64url(k.publicKey),
		edPriv: b64url(k.secretKey)
	};
}
function publicIdentity(id) {
	return {
		v: 1,
		name: id.name,
		edPub: id.edPub
	};
}
function nonceFor(dir, counter) {
	const n = /* @__PURE__ */ new Uint8Array(12);
	const v = new DataView(n.buffer);
	v.setUint32(0, dir);
	v.setUint32(4, Math.floor(counter / 2 ** 32));
	v.setUint32(8, counter >>> 0);
	return n;
}
function seal(key, dir, counter, plain) {
	return chacha20poly1305(key, nonceFor(dir, counter)).encrypt(plain);
}
function open(key, dir, counter, boxed) {
	return chacha20poly1305(key, nonceFor(dir, counter)).decrypt(boxed);
}
function mac(key, msg) {
	return hmac(sha256, key, msg);
}
var MAGIC = utf8("XH1");
function pack(...parts) {
	return concat(parts);
}
var Handshake = class {
	role;
	self;
	peerEdPub;
	peerName;
	profile;
	now;
	seen;
	ephPriv = /* @__PURE__ */ new Uint8Array(32);
	ephPub = /* @__PURE__ */ new Uint8Array(32);
	transcript = /* @__PURE__ */ new Uint8Array(0);
	msg1 = /* @__PURE__ */ new Uint8Array(0);
	constructor(role, self, peerEdPub, peerName, profile, now, seen) {
		this.role = role;
		this.self = self;
		this.peerEdPub = peerEdPub;
		this.peerName = peerName;
		this.profile = profile;
		this.now = now;
		this.seen = seen;
	}
	selfEdPub() {
		return unb64url(this.self.edPub);
	}
	selfEdPriv() {
		return unb64url(this.self.edPriv);
	}
	clientHello(timeSec = Math.floor(this.now() / 1e3)) {
		if (this.role !== "client") throw new Error("not client");
		const eph = x25519.keygen();
		this.ephPriv = eph.secretKey;
		this.ephPub = eph.publicKey;
		const nonce = /* @__PURE__ */ new Uint8Array(16);
		crypto.getRandomValues(nonce);
		const time = /* @__PURE__ */ new Uint8Array(4);
		new DataView(time.buffer).setUint32(0, timeSec);
		this.msg1 = pack(MAGIC, Uint8Array.of(1), this.ephPub, nonce, time);
		this.transcript = this.msg1;
		return this.msg1;
	}
	takeClientHello(msg, timeSec = Math.floor(this.now() / 1e3)) {
		if (this.role !== "server") throw new Error("not server");
		if (msg.length !== 56) throw new Error("bad hello");
		if (textOf(msg.subarray(0, 3)) !== "XH1" || msg[3] !== 1) throw new Error("bad hello magic");
		const nonce = b64url(msg.subarray(36, 52));
		if (this.seen.has(nonce)) throw new Error("replayed hello");
		this.seen.add(nonce);
		const stamp = new DataView(msg.buffer, msg.byteOffset + msg.length - 4, 4).getUint32(0);
		if (Math.abs(stamp - timeSec) > 600) throw new Error("hello time");
		this.msg1 = msg;
		this.transcript = msg;
		const eph = x25519.keygen();
		this.ephPriv = eph.secretKey;
		this.ephPub = eph.publicKey;
		msg.subarray(4, 36);
		const signed = pack(utf8("xianhua-server"), this.transcript, this.ephPub);
		const sig = ed25519.sign(signed, this.selfEdPriv());
		const out = pack(MAGIC, Uint8Array.of(2), this.ephPub, sig);
		this.transcript = pack(this.transcript, this.ephPub, sig);
		return out;
	}
	takeServerHello(msg) {
		if (this.role !== "client") throw new Error("not client");
		if (msg.length !== 100) throw new Error("bad reply");
		if (msg[3] !== 2) throw new Error("bad reply type");
		const serverEph = msg.subarray(4, 36);
		const sig = msg.subarray(36, 100);
		const signed = pack(utf8("xianhua-server"), this.transcript, serverEph);
		if (!ed25519.verify(sig, signed, this.peerEdPub)) throw new Error("server identity");
		this.transcript = pack(this.transcript, serverEph, sig);
		const keys = derive(x25519.getSharedSecret(this.ephPriv, serverEph), this.ephPub, serverEph, this.selfEdPub(), this.peerEdPub, this.transcript, "client", this.peerName, this.profile);
		const clientSigned = pack(utf8("xianhua-client"), this.transcript, Uint8Array.of(profileByte(this.profile)));
		const clientSig = ed25519.sign(clientSigned, this.selfEdPriv());
		const confirm = mac(keys.confirm, pack(utf8("xianhua-confirm-c"), this.transcript));
		return {
			keys,
			finish: pack(MAGIC, Uint8Array.of(3), clientSig, confirm, Uint8Array.of(profileByte(this.profile)))
		};
	}
	takeClientFinish(msg) {
		if (this.role !== "server") throw new Error("not server");
		if (msg.length !== 101) throw new Error("bad finish");
		if (msg[3] !== 3) throw new Error("bad finish type");
		const sig = msg.subarray(4, 68);
		const confirm = msg.subarray(68, 100);
		if ((msg[100] === 1 ? "talk" : msg[100] === 2 ? "dense" : null) !== this.profile) throw new Error("profile");
		const signed = pack(utf8("xianhua-client"), this.transcript, Uint8Array.of(msg[100]));
		if (!ed25519.verify(sig, signed, this.peerEdPub)) throw new Error("client identity");
		const clientEph = this.msg1.subarray(4, 36);
		const keys = derive(x25519.getSharedSecret(this.ephPriv, clientEph), clientEph, this.ephPub, this.peerEdPub, this.selfEdPub(), this.transcript, "server", this.peerName, this.profile);
		if (!equalBytes(mac(keys.confirm, pack(utf8("xianhua-confirm-c"), this.transcript)), confirm)) throw new Error("confirm");
		return keys;
	}
};
function derive(dh, clientEph, serverEph, clientEd, serverEd, transcript, role, peerName, profile) {
	const salt = sha256(pack(clientEph, serverEph, clientEd, serverEd, sha256(transcript)));
	const okm = hkdf(sha256, dh, salt, utf8("xianhua-v1"), 128);
	const sessionId = hkdf(sha256, dh, salt, utf8("xianhua-sid"), 16);
	const c2s = okm.subarray(0, 32);
	const s2c = okm.subarray(32, 64);
	const confirm = okm.subarray(64, 96);
	const topic = okm.subarray(96, 128);
	const token = mac(confirm, utf8("xianhua-token")).subarray(0, 4);
	return {
		sessionId,
		sendKey: role === "client" ? c2s : s2c,
		recvKey: role === "client" ? s2c : c2s,
		confirm,
		topic,
		token,
		peerName,
		profile
	};
}
function profileByte(profile) {
	return profile === "talk" ? 1 : 2;
}
function compareBytes(a, b) {
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
	return a.length - b.length;
}
/** Cover schedule shared by a pair. An on-path observer without the long-term public keys cannot strip it. */
function pairCover(a, b, domain) {
	const swap = compareBytes(a, b) > 0;
	return hkdf(sha256, pack(swap ? b : a, swap ? a : b), utf8("xianhua-cover"), utf8(domain), 32);
}
function textOf(b) {
	return new TextDecoder().decode(b);
}
function dataPreamble(keys, profile) {
	const profileByte = Uint8Array.of(profile === "talk" ? 1 : 2);
	const tag = mac(keys.confirm, pack(utf8("xianhua-data"), profileByte, keys.sessionId));
	const plain = pack(profileByte, keys.sessionId, tag);
	const boxed = seal(keys.sendKey, 0, 1, plain);
	const len = /* @__PURE__ */ new Uint8Array(2);
	new DataView(len.buffer).setUint16(0, boxed.length);
	return pack(keys.token, len, boxed);
}
function readPreamble(keys, blob) {
	if (blob.length < 6) throw new Error("short preamble");
	if (!equalBytes(blob.subarray(0, 4), keys.token)) throw new Error("token");
	const len = new DataView(blob.buffer, blob.byteOffset + 4, 2).getUint16(0);
	const boxed = blob.subarray(6, 6 + len);
	if (boxed.length !== len) throw new Error("preamble length");
	const plain = open(keys.recvKey, 0, 1, boxed);
	if (plain.length !== 49) throw new Error("preamble plain");
	const profileByte = plain[0];
	if (profileByte !== 1 && profileByte !== 2) throw new Error("profile");
	if (!equalBytes(plain.subarray(1, 17), keys.sessionId)) throw new Error("session");
	const tag = plain.subarray(17);
	if (!equalBytes(mac(keys.confirm, pack(utf8("xianhua-data"), Uint8Array.of(profileByte), keys.sessionId)), tag)) throw new Error("preamble mac");
	return { profile: profileByte === 1 ? "talk" : "dense" };
}
function sessionAck(keys) {
	return mac(keys.confirm, utf8("xianhua-ack"));
}
function topicSeed(keys, dir) {
	return hmac(sha256, keys.topic, utf8(dir));
}
function shannon(d) {
	if (d.length === 0) return 0;
	const f = new Array(256).fill(0);
	for (const b of d) f[b]++;
	let h = 0;
	for (const c of f) {
		if (!c) continue;
		const p = c / d.length;
		h -= p * Math.log2(p);
	}
	return h;
}
/** Adjacent-byte correlation. Ciphertext sits near 0; prose does not. */
function serialCorrelation(d) {
	const n = d.length;
	if (n < 3) return 0;
	let sum = 0;
	for (const x of d) sum += x;
	const mean = sum / n;
	let varSum = 0;
	let prod = 0;
	for (let i = 0; i < n; i++) {
		const x = d[i] - mean;
		const y = d[(i + 1) % n] - mean;
		varSum += x * x;
		prod += x * y;
	}
	if (varSum === 0) return 0;
	return prod / varSum;
}
/** Pearson chi-square against a uniform byte. Larger means less like ciphertext. */
function chiSquareUniform(d) {
	if (d.length === 0) return 0;
	const f = new Array(256).fill(0);
	for (const b of d) f[b]++;
	const expected = d.length / 256;
	let chi = 0;
	for (const c of f) {
		const diff = c - expected;
		chi += diff * diff / expected;
	}
	return chi;
}
function cjkRatio(s) {
	if (!s.length) return 0;
	let n = 0;
	for (const ch of s) {
		const c = ch.codePointAt(0) ?? 0;
		if (c >= 19968 && c <= 40959) n++;
	}
	return n / [...s].length;
}
async function gzipRatio(d) {
	if (d.length === 0) return 0;
	const cs = new CompressionStream("gzip");
	const stream = new Blob([Uint8Array.from(d)]).stream().pipeThrough(cs);
	return (await new Response(stream).arrayBuffer()).byteLength / d.length;
}
async function measure(bytes, asText) {
	return {
		shannon: shannon(bytes),
		serial: serialCorrelation(bytes),
		chiSquare: chiSquareUniform(bytes),
		gzipRatio: await gzipRatio(bytes),
		cjkRatio: cjkRatio(asText),
		chars: [...asText].length
	};
}
/** HMAC-SHA256 counter DRBG. Both ends must call `int` the same number of times. */
var Rng = class {
	seed;
	counter = 0;
	pool = /* @__PURE__ */ new Uint8Array(0);
	off = 0;
	constructor(seed) {
		this.seed = seed;
	}
	refill() {
		const c = /* @__PURE__ */ new Uint8Array(4);
		new DataView(c.buffer).setUint32(0, this.counter++);
		this.pool = hmac(sha256, this.seed, c);
		this.off = 0;
	}
	u32() {
		if (this.off + 4 > this.pool.length) this.refill();
		const x = this.pool[this.off] * 16777216 + this.pool[this.off + 1] * 65536 + this.pool[this.off + 2] * 256 + this.pool[this.off + 3];
		this.off += 4;
		return x;
	}
	/** Uniform integer in [0, n). */
	int(n) {
		if (n <= 1) return 0;
		const limit = Math.floor(4294967296 / n) * n;
		for (;;) {
			const x = this.u32();
			if (x < limit) return x % n;
		}
	}
};
var OPENERS = [
	"说起来，",
	"我跟你讲，",
	"对了，",
	"刚才忽然想到，",
	"跟你说个事，",
	"哦对，",
	"先说这个，",
	"诶，",
	"其实吧，",
	"讲真，",
	"顺便提一句，",
	"我突然想起来，",
	"还有件事，",
	"唔，",
	"你听我说，",
	"先把这句说完，"
];
var MOODS = [
	"老实讲，",
	"不夸张，",
	"按老习惯，",
	"我寻思，",
	"这么说吧，",
	"细想一下，",
	"随口讲，",
	"认真说，",
	"照实说，",
	"不绕弯，",
	"平平常常，",
	"没怎么酝酿，",
	"大概其，",
	"就是那么回事，",
	"一言蔽之，",
	"不想铺垫，"
];
var TAILS = [
	"说完我自己先点了点头。",
	"这事我记了很久了。",
	"没想征得谁的同意。",
	"你要是有别的看法也行。",
	"我讲的都是日常。",
	"不拿它当一件新闻。",
	"生活里就这么点波澜。",
	"我习惯把这种事说出来。",
	"不然它会在脑子里转。",
	"讲给谁听其实都一样。",
	"今天愿意多说两句。",
	"语气轻，事情也轻。",
	"我没有要一个结论。",
	"听过就算陪我待了一下。",
	"这句话可以不回。",
	"我接着过我的下午。"
];
var CONNECTORS = [
	"另外，",
	"还有就是，",
	"补充一句，",
	"接着说，",
	"再补一个细节，",
	"顺带一提，",
	"背后还有，",
	"我再交代一下，",
	"没说完的是，",
	"具体点讲，",
	"展开一下，",
	"底下的情况是，",
	"容易漏掉的是，",
	"我自己在意的是，",
	"人们常忽略的是，",
	"最后补上，"
];
/** Sixteen ways to restate one true fragment, all ending in a comma. */
var COMMA_FRAMES = [
	(s) => `也就是${s}，`,
	(s) => `无非是${s}，`,
	(s) => `说到底${s}，`,
	(s) => `反正${s}，`,
	(s) => `我记得是${s}，`,
	(s) => `一直都是${s}，`,
	(s) => `没别的，就是${s}，`,
	(s) => `简单讲是${s}，`,
	(s) => `你也知道${s}，`,
	(s) => `老样子是${s}，`,
	(s) => `还是那样，${s}，`,
	(s) => `变来变去还是${s}，`,
	(s) => `我能确定${s}，`,
	(s) => `不算新鲜，${s}，`,
	(s) => `提一嘴，${s}，`,
	(s) => `归根是${s}，`
];
var PERIOD_FRAMES = [
	(s) => `也就是${s}。`,
	(s) => `无非是${s}。`,
	(s) => `说到底${s}。`,
	(s) => `反正${s}。`,
	(s) => `我记得是${s}。`,
	(s) => `一直都是${s}。`,
	(s) => `没别的，就是${s}。`,
	(s) => `简单讲是${s}。`,
	(s) => `你也知道${s}。`,
	(s) => `老样子是${s}。`,
	(s) => `还是那样，${s}。`,
	(s) => `变来变去还是${s}。`,
	(s) => `我能确定${s}。`,
	(s) => `不算新鲜，${s}。`,
	(s) => `提一嘴，${s}。`,
	(s) => `归根是${s}。`
];
var BRIDGE_B = [
	"倒是想起{hint}。",
	"我改说{hint}。",
	"下面转到{hint}。",
	"忽然就落到{hint}上。"
];
function focus(name, a, b, c, d, e, f) {
	return {
		name,
		a,
		b,
		c,
		d,
		e,
		f
	};
}
var TOPICS = [
	{
		id: "lunch",
		label: "午饭",
		hint: "午饭",
		focuses: [
			focus("巷口那家面馆", "牛肉面", "同事", "中午要排队", "汤很香", "不算贵", "点牛肉面"),
			focus("公司楼下的盖饭", "鸡腿饭", "同事", "窗口出得快", "酱有点咸", "很便宜", "点鸡腿饭"),
			focus("家附近的寿司店", "三文鱼", "家里人", "位置不多", "饭是温的", "偶尔才舍得", "只点熟的"),
			focus("周末那家火锅", "清汤锅", "朋友", "得先预约", "菜很新鲜", "当一次正经开销", "把辣的让给别人"),
			focus("新开的面包店", "肉松小贝", "自己", "下午才出炉", "甜度刚好", "当点心的价", "买两个就走"),
			focus("菜市场的粥铺", "皮蛋瘦肉粥", "自己", "一早才开张", "粥很绵", "便宜得不用想", "盛一碗就走")
		],
		openA: [
			"中午路过{name}，",
			"一到饭点就想起{name}，",
			"刚才在{name}门口停了停，",
			"肚子响的时候想到{name}，"
		],
		openB: [
			"里头{c}。",
			"想吃的是{a}。",
			"味道上，{d}。",
			"我一般{f}。"
		],
		memoryA: [
			"上次去{name}，",
			"还记得{name}，",
			"{name}那回，",
			"我回想{name}，"
		],
		memoryB: [
			"点了{a}，{d}。",
			"跟平时一样，{c}。",
			"花费上{e}。",
			"还是会{f}。"
		],
		todayA: [
			"今天若去{name}，",
			"这顿想着{name}，",
			"就近的话是{name}，",
			"懒得找新的，就{name}，"
		],
		todayB: [
			"还是会{f}。",
			"躲不开的是{c}。",
			"嘴里想的是{a}。",
			"钱的方面，{e}。"
		],
		bridgeA: [
			"{name}先说到这，",
			"吃饭先不绕{name}了，",
			"先把{name}放下，",
			"{name}的事先停，"
		]
	},
	{
		id: "commute",
		label: "通勤",
		hint: "通勤",
		focuses: [
			focus("地铁二号线", "四十分钟", "自己", "早高峰很挤", "有点闷", "换乘并不省事", "提前一站下车"),
			focus("那班早公交", "半小时", "邻座", "座位要碰运气", "车窗会起雾", "比打车省", "到站就起身"),
			focus("林荫路骑行", "二十分钟", "自己", "红绿灯很密", "风是凉的", "不花钱", "下雨就改乘地铁"),
			focus("过江轮渡", "看一会江的工夫", "看江的人", "班次少", "风大但醒神", "票价便宜", "赶时间就不选它"),
			focus("公司班车", "固定的钟点", "同事", "会等迟到的人", "能补一小会儿觉", "不算进开销", "坐倒数第二排"),
			focus("步行接地铁", "腿要出点力", "自己", "出站后还有一段", "比全程挤着强", "省下一截车费", "换上舒服的鞋再走")
		],
		openA: [
			"今早走的是{name}，",
			"通勤还是落在{name}，",
			"我默认的是{name}，",
			"今天这段是{name}，"
		],
		openB: [
			"单程{a}。",
			"路上{c}。",
			"体会是{d}。",
			"习惯上，{f}。"
		],
		memoryA: [
			"上次是{name}，",
			"我记得清楚的是{name}，",
			"前几天走了{name}，",
			"印象深的是{name}，"
		],
		memoryB: [
			"单程{a}，跟平时一样。",
			"当时{c}。",
			"感受仍是{d}。",
			"还是老习惯，{f}。"
		],
		todayA: [
			"今天继续{name}，",
			"今早还是{name}，",
			"若是平常的一天，就{name}，",
			"没有临时变卦的话，{name}，"
		],
		todayB: [
			"预计{a}。",
			"路上大概{c}。",
			"感觉仍会是{d}。",
			"习惯上，{f}。"
		],
		bridgeA: [
			"{name}先说到这，",
			"{name}的账先停，",
			"先不盘{name}，",
			"不再细说{name}，"
		]
	},
	{
		id: "weather",
		label: "出门",
		hint: "出门",
		focuses: [
			focus("江边", "一层薄云", "外套", "风从水面来", "适合慢慢走", "不用打伞", "出门前看一眼天"),
			focus("楼下空地", "云有点厚", "薄外套", "地上是干的", "光不刺眼", "鞋不用换", "下楼会站一会"),
			focus("车站那个坡", "风比平地大", "围巾", "上坡要低头", "脸会被吹醒", "不用带伞", "会把帽子压一压"),
			focus("桥面", "江风直来", "扣子", "栏杆是凉的", "视线很开", "站久了会冷", "只走到桥中就回"),
			focus("小区花园", "树荫还在", "便鞋", "长椅有空", "闹中有静", "不需要门票", "绕一圈再回家"),
			focus("街角屋檐", "檐下没雨", "包", "滴水已经停了", "可以躲一会", "不用买伞", "等一等再走")
		],
		openA: [
			"我路过{name}，",
			"今天经过{name}，",
			"站到{name}的时候，",
			"一出门就对着{name}，"
		],
		openB: [
			"天上是{a}。",
			"风的事，{c}。",
			"我觉得{d}。",
			"我{f}。"
		],
		memoryA: [
			"上次在{name}，",
			"还记得{name}那天，",
			"{name}给我留过印象，",
			"提起{name}，"
		],
		memoryB: [
			"天也是{a}。",
			"同样{c}。",
			"感觉还是{d}。",
			"做法还是{f}。"
		],
		todayA: [
			"今天的{name}，",
			"这回的{name}，",
			"若现在去{name}，",
			"眼下的{name}，"
		],
		todayB: [
			"看起来是{a}。",
			"仍然{c}。",
			"所以{d}。",
			"于是我{f}。"
		],
		bridgeA: [
			"{name}先说到这，",
			"先别站在{name}了，",
			"{name}的风先放下，",
			"不继续描述{name}，"
		]
	},
	{
		id: "reading",
		label: "看书",
		hint: "手里的书",
		focuses: [
			focus("枕边那本小说", "人物不多", "睡前", "看到一半", "句子慢", "不厚", "每天只看几页"),
			focus("包里的随笔", "篇幅短", "通勤", "可以随时合上", "不费眼神", "很轻", "等车时翻两页"),
			focus("图书馆借的那本", "到期日近了", "周末", "还没读完", "注解多", "逾期要算钱", "这周会还"),
			focus("旧书店淘的诗集", "页边有别人的铅笔", "夜里", "挑着读", "空白很多", "花得不多", "读完就搁回架子"),
			focus("桌上的菜谱", "步骤清楚", "晚饭前", "看着就能做", "图比字多", "当工具书", "做完才合上"),
			focus("重读的旧书", "情节还记得", "下午", "专挑折过的页", "像见熟人", "不用再买", "只读喜欢的章")
		],
		openA: [
			"最近在看{name}，",
			"手里这本是{name}，",
			"说到书，是{name}，",
			"眼下读的是{name}，"
		],
		openB: [
			"它{a}。",
			"我多半在{b}看。",
			"进度是{c}。",
			"我{f}。"
		],
		memoryA: [
			"当初拿起{name}，",
			"头一回翻{name}，",
			"记得打开{name}那天，",
			"{name}刚到我手里时，"
		],
		memoryB: [
			"就已经{a}。",
			"也是{b}看的。",
			"那时就{c}。",
			"从一开始就{f}。"
		],
		todayA: [
			"今天还会碰{name}，",
			"这会儿的{name}，",
			"若有空，就拿{name}，",
			"睡前仍是{name}，"
		],
		todayB: [
			"它还是{a}。",
			"仍放在{b}。",
			"眼下{c}。",
			"所以我{f}。"
		],
		bridgeA: [
			"{name}先合上，",
			"书的事不绕{name}了，",
			"先把{name}扣下，",
			"{name}说到这，"
		]
	},
	{
		id: "cooking",
		label: "晚饭",
		hint: "晚饭",
		focuses: [
			focus("番茄炒蛋", "番茄和蛋", "自己", "糖放得少", "味道稳", "洗一口锅", "五分钟能好"),
			focus("青椒肉丝", "青椒和一碟肉", "自己", "火要大", "咸香", "油会溅一点", "米饭配得下"),
			focus("味噌汤", "豆腐和海带", "家里人", "不能久煮", "热乎就好", "几乎不油", "先喝再吃饭"),
			focus("煎饺", "白菜猪肉馅", "朋友", "锅要热", "底要脆", "油比炒菜多", "蘸醋吃"),
			focus("蔬菜面", "一把青菜", "自己", "汤单独烧", "清淡", "比外卖便宜", "卧一个蛋"),
			focus("蒸蛋", "两只蛋", "自己", "盖子留一条缝", "嫩就行", "洗碗最省事", "撒一点葱")
		],
		openA: [
			"晚饭做{name}，",
			"今晚想的是{name}，",
			"厨房里准备的是{name}，",
			"这顿就定{name}，"
		],
		openB: [
			"用的是{a}。",
			"吃的人是{b}。",
			"做法上，{c}。",
			"习惯是{f}。"
		],
		memoryA: [
			"上次做{name}，",
			"还是那道{name}，",
			"熟练的是{name}，",
			"回头说{name}，"
		],
		memoryB: [
			"材料也是{a}。",
			"当时给{b}吃。",
			"同样{c}。",
			"结尾我{f}。"
		],
		todayA: [
			"今天的{name}，",
			"这顿的{name}，",
			"若就做{name}，",
			"不换了，{name}，"
		],
		todayB: [
			"材料还是{a}。",
			"上桌给{b}。",
			"关键仍是{c}。",
			"出锅前我{f}。"
		],
		bridgeA: [
			"{name}先说到这，",
			"厨房先别围着{name}，",
			"先把{name}端走，",
			"{name}的烟先散，"
		]
	},
	{
		id: "weekend",
		label: "周末",
		hint: "周末",
		focuses: [
			focus("下午的长走", "江边来回", "自己", "不安排第二件事", "腿酸得刚好", "只花时间", "周日晚上就收"),
			focus("博物馆的半天", "一个展厅", "朋友", "不贪多", "看完会饿", "门票还行", "出来找家馆子"),
			focus("在家修东西", "松了的柜门", "自己", "工具就那几样", "弄完很安静", "不用叫人", "下午三点前停手"),
			focus("早市逛一圈", "两条街", "家里人", "去早才有好的", "包会变重", "比超市便宜", "九点前离开"),
			focus("看电影的一场", "后排靠过道", "朋友", "不选太晚的场", "散场外面已经暗了", "爆米花可有可无", "看完直接回家"),
			focus("什么都不约", "家里", "自己", "手机放远一点", "难得不看钟", "最省", "晚上再出门吃饭")
		],
		openA: [
			"周末多半是{name}，",
			"我把周末留给{name}，",
			"说到休息，就是{name}，",
			"空下来会去做{name}，"
		],
		openB: [
			"范围是{a}。",
			"一起的是{b}。",
			"分寸是{c}。",
			"我{f}。"
		],
		memoryA: [
			"上次的{name}，",
			"还记得那回{name}，",
			"{name}做过不止一次，",
			"提起{name}，"
		],
		memoryB: [
			"也就是{a}。",
			"同伴是{b}。",
			"一样{c}。",
			"结束时{f}。"
		],
		todayA: [
			"这个周末若是{name}，",
			"眼下倾向{name}，",
			"不另找节目的话，{name}，",
			"就按老样子，{name}，"
		],
		todayB: [
			"还是{a}。",
			"人还是{b}。",
			"依旧{c}。",
			"到点我就{f}。"
		],
		bridgeA: [
			"{name}先说到这，",
			"周末的事先离开{name}，",
			"先不排{name}了，",
			"{name}先搁下，"
		]
	},
	{
		id: "sleep",
		label: "睡觉",
		hint: "睡觉",
		focuses: [
			focus("夜里那段睡眠", "十二点前躺下", "手机", "容易半夜醒", "房间黑一点好", "晚上不喝茶", "醒了就不看屏幕"),
			focus("午后的小睡", "二十分钟", "闹钟", "超过就头疼", "沙发就行", "不盖太厚", "醒来喝一口水"),
			focus("出差时的床", "陌生枕头", "耳塞", "第一夜会浅", "窗帘要夹严", "不喝迷你吧", "先洗热水再躺"),
			focus("周末的懒觉", "自然醒", "窗帘", "不设闹钟", "阳光进来就够了", "误不了什么", "醒了先发呆"),
			focus("熬过后的补觉", "第二天上午", "安静", "做梦很碎", "补不回全部", "咖啡先停", "中午前一定起来"),
			focus("雨夜的睡眠", "雨声", "窗户", "睡得比平时沉", "被角要暖", "不用白噪音", "窗留一条缝")
		],
		openA: [
			"说到睡，是{name}，",
			"我在意的是{name}，",
			"真正算数的是{name}，",
			"这阵子依赖{name}，"
		],
		openB: [
			"时间上，{a}。",
			"旁边是{b}。",
			"麻烦在于{c}。",
			"所以我{f}。"
		],
		memoryA: [
			"以前的{name}，",
			"记得{name}那种时候，",
			"{name}一直如此，",
			"回头看{name}，"
		],
		memoryB: [
			"也同样{a}。",
			"离不了{b}。",
			"还是{c}。",
			"我早已{f}。"
		],
		todayA: [
			"今晚的{name}，",
			"接下来的{name}，",
			"若一切平常，{name}，",
			"我准备好的是{name}，"
		],
		todayB: [
			"仍想{a}。",
			"还是把{b}放在手边。",
			"防的就是{c}。",
			"因此我{f}。"
		],
		bridgeA: [
			"{name}先说到这，",
			"睡的事先别扯{name}，",
			"先把{name}放下，",
			"{name}先告一段落，"
		]
	},
	{
		id: "neighborhood",
		label: "楼下",
		hint: "楼下",
		focuses: [
			focus("楼下便利店", "夜班店员", "晚上", "灯很亮", "东西算齐", "略贵", "忘了买就下去一趟"),
			focus("街角菜摊", "固定的摊主", "傍晚", "收得早", "菜是当天的", "可以讲价", "路过就看一眼叶子"),
			focus("巷口修车的", "老师傅", "下午", "不接太复杂的活", "手脚慢但稳", "价格先说死", "链条响了才去"),
			focus("小区门岗", "夜班的师傅", "夜里", "会多看一眼", "话不多", "不算麻烦", "晚归会点一下头"),
			focus("对面理发店", "老板自己剪", "周末", "不用预约", "剪得保守", "不推销", "两个月才去一次"),
			focus("转角面包店", "清晨出炉", "早上", "八点后就少了", "咸的比甜的好", "当早餐刚好", "只买一个就走")
		],
		openA: [
			"楼下绕不开{name}，",
			"我常去的是{name}，",
			"出了门就是{name}，",
			"这条街上有{name}，"
		],
		openB: [
			"那儿的人是{a}。",
			"我一般{b}去。",
			"规矩是{c}。",
			"我{f}。"
		],
		memoryA: [
			"认识{name}很久了，",
			"头一回去{name}，",
			"{name}一直在，",
			"说起{name}，"
		],
		memoryB: [
			"见面的就是{a}。",
			"也是{b}去的。",
			"当初就{c}。",
			"我从那时起就{f}。"
		],
		todayA: [
			"今天也许去{name}，",
			"若要补点东西，{name}，",
			"顺路会进{name}，",
			"还是{name}最省事，"
		],
		todayB: [
			"还是找{a}。",
			"时间仍是{b}。",
			"他们依旧{c}。",
			"所以我{f}。"
		],
		bridgeA: [
			"{name}先说到这，",
			"楼下的事先离开{name}，",
			"先不进{name}了，",
			"{name}的门先带上，"
		]
	},
	{
		id: "workday",
		label: "白天",
		hint: "白天的杂事",
		focuses: [
			focus("上午那段会", "半小时", "同事", "不算长", "该说的能说完", "不把工作带回家", "四点后效率就差"),
			focus("午后的文档", "一份纪要", "自己", "改两遍就停", "句子要短", "不追求漂亮", "下班前发出去"),
			focus("排队等的答复", "一封邮件", "对方", "催一次就好", "不干等", "先做别的", "到点再看收件箱"),
			focus("桌面的整理", "一摞纸", "自己", "只留这周的", "清完能喘气", "不买新文件夹", "周五下午做"),
			focus("跟同事对的进度", "三件事", "同组的人", "站着说完", "不展开闲篇", "十分钟够了", "说完就回座位"),
			focus("自己的那份清单", "五项", "自己", "做完就划掉", "不临时加塞", "留一项给明天", "中午前看一次")
		],
		openA: [
			"白天躲不开{name}，",
			"今天工作里有{name}，",
			"桌上摆着的是{name}，",
			"我会先处理{name}，"
		],
		openB: [
			"分量是{a}。",
			"对面是{b}。",
			"分寸是{c}。",
			"我{f}。"
		],
		memoryA: [
			"以前的{name}，",
			"做过很多次{name}，",
			"{name}并不新鲜，",
			"回想{name}，"
		],
		memoryB: [
			"也就是{a}。",
			"一起的是{b}。",
			"一向{c}。",
			"我习惯{f}。"
		],
		todayA: [
			"今天的{name}，",
			"这回的{name}，",
			"若按计划，{name}，",
			"先了结{name}，"
		],
		todayB: [
			"还是{a}。",
			"人还是{b}。",
			"依旧{c}。",
			"做的时候我{f}。"
		],
		bridgeA: [
			"{name}先说到这，",
			"工作的事先放下{name}，",
			"先不谈{name}，",
			"{name}先划掉，"
		]
	}
];
new Map(TOPICS.map((t) => [t.id, t]));
function fill(tpl, f, hint) {
	return tpl.replaceAll("{name}", f.name).replaceAll("{a}", f.a).replaceAll("{b}", f.b).replaceAll("{c}", f.c).replaceAll("{d}", f.d).replaceAll("{e}", f.e).replaceAll("{f}", f.f).replaceAll("{hint}", hint);
}
function phaseBanks(topic, phase) {
	if (phase === "open") return {
		a: topic.openA,
		b: topic.openB
	};
	if (phase === "memory") return {
		a: topic.memoryA,
		b: topic.memoryB
	};
	if (phase === "today") return {
		a: topic.todayA,
		b: topic.todayB
	};
	return {
		a: topic.bridgeA,
		b: BRIDGE_B
	};
}
var SLOT_BITS = {
	opener: 4,
	mood: 4,
	a: 2,
	b: 2,
	tail: 4,
	conn: 4,
	ea: 4,
	eb: 4,
	ec: 4
};
var checkedSlots = /* @__PURE__ */ new Set();
function assertSlots(key, lists) {
	if (checkedSlots.has(key)) return;
	for (const name of Object.keys(SLOT_BITS)) {
		const list = lists[name];
		const want = 2 ** SLOT_BITS[name];
		if (list.length !== want) throw new Error(`${key} ${name} has ${list.length}, want ${want}`);
		for (let i = 0; i < list.length; i++) {
			if (!list[i]) throw new Error(`${key} ${name} empty`);
			for (let j = 0; j < list.length; j++) if (i !== j && (list[i] === list[j] || list[j].startsWith(list[i]))) throw new Error(`${key} ${name} overlaps: ${list[i]} ‖ ${list[j]}`);
		}
	}
	checkedSlots.add(key);
}
function slotLists(topic, focus, phase, hint) {
	const bank = phaseBanks(topic, phase);
	const lists = {
		opener: OPENERS,
		mood: MOODS,
		a: bank.a.map((s) => fill(s, focus, hint)),
		b: bank.b.map((s) => fill(s, focus, hint)),
		tail: TAILS,
		conn: CONNECTORS,
		ea: COMMA_FRAMES.map((fn) => fn(focus.c)),
		eb: COMMA_FRAMES.map((fn) => fn(focus.d)),
		ec: PERIOD_FRAMES.map((fn) => fn(focus.e))
	};
	assertSlots(`${topic.id}:${focus.name}:${phase}:${hint}`, lists);
	return lists;
}
/** Uneven so a histogram of topic runs is not a flat 6–12. Sum is 60. */
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
var TALK_ORDER = [
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
	tail: 0,
	conn: 28,
	ea: 24,
	eb: 20,
	ec: 16
};
var BITS = {
	opener: 4,
	mood: 4,
	a: 2,
	b: 2,
	tail: 4,
	conn: 4,
	ea: 4,
	eb: 4,
	ec: 4
};
var SALT = {
	opener: 3,
	mood: 5,
	a: 7,
	b: 11,
	tail: 13,
	conn: 17,
	ea: 19,
	eb: 23,
	ec: 29
};
function episodeLength(rng) {
	let x = rng.int(60);
	for (let i = 0; i < EPISODE_WEIGHTS.length; i++) {
		if (x < EPISODE_WEIGHTS[i]) return 4 + i;
		x -= EPISODE_WEIGHTS[i];
	}
	return 8;
}
/** Uniform over topics that are neither the current one nor the one just left. */
function otherTopic(rng, current, previous, n) {
	const banned = /* @__PURE__ */ new Set([current]);
	if (previous >= 0 && previous !== current) banned.add(previous);
	let x = rng.int(n - banned.size);
	for (let i = 0; i < n; i++) {
		if (banned.has(i)) continue;
		if (x === 0) return i;
		x--;
	}
	throw new Error("topic choice");
}
function orderFor(seq, dense) {
	const base = TALK_ORDER[seq % TALK_ORDER.length];
	return dense ? [
		...base,
		"conn",
		"ea",
		"eb",
		"ec"
	] : [...base];
}
function rot(seq, salt, n) {
	if (n <= 1) return 0;
	return (Math.imul(seq + 1, salt) >>> 0) % n;
}
var Codec = class {
	state;
	last = {
		topicId: "",
		label: "",
		phase: "open",
		focus: "",
		hint: "",
		fact: ""
	};
	constructor(mode, seed) {
		this.state = {
			mode,
			rng: new Rng(seed),
			seq: 0,
			topicIndex: 0,
			nextTopicIndex: 1,
			focusIndex: 0,
			episodeStart: -1,
			episodeLen: 0,
			left: 0
		};
	}
	get bytesPerLine() {
		return this.state.mode === "talk" ? 2 : 4;
	}
	roll() {
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
	prepare() {
		if (this.state.left <= 0) this.roll();
	}
	locate() {
		const topic = TOPICS[this.state.topicIndex];
		const pos = this.state.seq - this.state.episodeStart;
		let phase = "memory";
		if (pos <= 0) phase = "open";
		else if (pos >= this.state.episodeLen - 1) phase = "bridge";
		else if (pos === this.state.episodeLen - 2) phase = "today";
		return {
			topic,
			phase,
			focusIndex: this.state.focusIndex,
			hint: TOPICS[this.state.nextTopicIndex].hint
		};
	}
	lists() {
		const here = this.locate();
		const focus = here.topic.focuses[here.focusIndex];
		this.last = {
			topicId: here.topic.id,
			label: here.topic.label,
			phase: here.phase,
			focus: focus.name,
			hint: here.hint,
			fact: `${focus.a}，${focus.c}，${focus.f}`
		};
		return slotLists(here.topic, focus, here.phase, here.hint);
	}
	finish() {
		this.state.left -= 1;
		this.state.seq += 1;
	}
	emit(index) {
		this.prepare();
		const line = render(this.lists(), index, this.state.seq, this.state.mode === "dense");
		this.finish();
		return line;
	}
	absorb(line) {
		this.prepare();
		const index = parse(this.lists(), line, this.state.seq, this.state.mode === "dense");
		this.finish();
		return index;
	}
};
function piece(n, shift, width) {
	return Math.floor(n / 2 ** shift) % 2 ** width;
}
function take(text, options) {
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
	return {
		index: best,
		rest: text.slice(bestLen)
	};
}
function render(slots, index, seq, dense) {
	let line = "";
	for (const name of orderFor(seq, dense)) {
		const list = slots[name];
		const opt = (piece(index, SHIFT[name], BITS[name]) + rot(seq, SALT[name], list.length)) % list.length;
		line += list[opt];
	}
	return line;
}
function parse(slots, line, seq, dense) {
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
var PhrasePipe = class {
	enc;
	dec;
	inbox = [];
	read = 0;
	constructor(enc, dec) {
		this.enc = enc;
		this.dec = dec;
	}
	encode(payload) {
		const width = this.enc.bytesPerLine;
		const head = 2 + payload.length;
		const pad = (width - head % width) % width;
		const raw = new Uint8Array(head + pad);
		raw[0] = payload.length >> 8;
		raw[1] = payload.length & 255;
		raw.set(payload, 2);
		const lines = [];
		for (let i = 0; i < raw.length; i += width) {
			const line = this.enc.emit(readIndex(raw.subarray(i, i + width)));
			lines.push({
				line,
				meta: { ...this.enc.last }
			});
		}
		return lines;
	}
	pushLine(line) {
		const width = this.dec.bytesPerLine;
		const n = this.dec.absorb(line);
		for (const b of toBytes(n, width)) this.inbox.push(b);
		const out = [];
		for (;;) {
			if (this.inbox.length - this.read < 2) break;
			const len = this.inbox[this.read] << 8 | this.inbox[this.read + 1];
			const head = 2 + len;
			const total = head + (width - head % width) % width;
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
};
function readIndex(b) {
	let n = 0;
	for (const x of b) n = n * 256 + x;
	return n;
}
function toBytes(n, width) {
	const out = [];
	let x = n;
	for (let i = 0; i < width; i++) {
		out.push(x % 256);
		x = Math.floor(x / 256);
	}
	return out.reverse();
}
function memoryPair() {
	let leftHandler = null;
	let rightHandler = null;
	const toLeft = [];
	const toRight = [];
	let closed = false;
	return [{
		send(line) {
			if (closed) return;
			if (rightHandler) rightHandler(line);
			else toRight.push(line);
		},
		onLine(cb) {
			leftHandler = cb;
			for (const line of toLeft.splice(0)) cb(line);
		},
		close() {
			closed = true;
		}
	}, {
		send(line) {
			if (closed) return;
			if (leftHandler) leftHandler(line);
			else toLeft.push(line);
		},
		onLine(cb) {
			rightHandler = cb;
			for (const line of toRight.splice(0)) cb(line);
		},
		close() {
			closed = true;
		}
	}];
}
var Inbox = class {
	queue = [];
	waiter = null;
	failed = null;
	fail(err) {
		if (this.failed) return;
		this.failed = err;
		if (this.waiter) {
			const w = this.waiter;
			this.waiter = null;
			w(utf8(""));
		}
	}
	push(frame) {
		if (this.failed) return;
		if (this.waiter) {
			const w = this.waiter;
			this.waiter = null;
			w(frame);
		} else this.queue.push(frame);
	}
	recv() {
		if (this.failed && this.queue.length === 0) return Promise.reject(this.failed);
		const first = this.queue.shift();
		if (first) return Promise.resolve(first);
		if (this.failed) return Promise.reject(this.failed);
		return new Promise((resolve, reject) => {
			this.waiter = (frame) => {
				if (this.failed && frame.length === 0) reject(this.failed);
				else resolve(frame);
			};
		});
	}
};
async function handshakeOn(socket, hs, cover, log, onServerReady, surface) {
	const opened = surface?.open(hs.role, cover, cover);
	const pipe = opened ? new PhrasePipe(opened.enc, opened.dec) : new PhrasePipe(new Codec("talk", cover), new Codec("talk", cover));
	const inbox = new Inbox();
	socket.onLine((line) => {
		if (!line) return;
		try {
			for (const frame of pipe.pushLine(line)) inbox.push(frame);
		} catch (err) {
			inbox.fail(err instanceof Error ? err : /* @__PURE__ */ new Error("decode"));
		}
	});
	const recv = () => inbox.recv();
	const send = (payload) => {
		for (const item of pipe.encode(payload)) {
			log?.(item.line, item.meta);
			socket.send(item.line);
		}
	};
	if (hs.role === "client") {
		send(hs.clientHello());
		const reply = await recv();
		const done = hs.takeServerHello(reply);
		send(done.finish);
		if (!equalBytes(await recv(), sessionAck(done.keys))) throw new Error("ack");
		return done.keys;
	}
	const hello = await recv();
	send(hs.takeClientHello(hello));
	const finish = await recv();
	const keys = hs.takeClientFinish(finish);
	onServerReady?.(keys);
	send(sessionAck(keys));
	return keys;
}
var TYPE_DATA = 1;
var TYPE_OPEN = 2;
var TYPE_OK = 3;
var TYPE_ERR = 4;
var TYPE_CLOSE = 5;
function safeHost(host) {
	if (host.length < 1 || host.length > 253) return false;
	return /^[A-Za-z0-9._:-]+$/.test(host);
}
var Tunnel = class Tunnel {
	keys;
	profile;
	role;
	pipe = null;
	socket = null;
	sendCounter = 1;
	recvCounter = 1;
	nextId;
	streams = /* @__PURE__ */ new Map();
	failed = null;
	onOpen = null;
	onLine = null;
	outgoing = [];
	cipherOut = [];
	constructor(keys, profile, role) {
		this.keys = keys;
		this.profile = profile;
		this.role = role;
		this.nextId = role === "client" ? 1 : 2;
	}
	/** Client: one conversation for the whole data connection, seeded by the session. */
	static connect(socket, keys, profile, surface) {
		const tunnel = new Tunnel(keys, profile, "client");
		const opened = surface?.open("client", topicSeed(keys, "c2s"), topicSeed(keys, "s2c"));
		tunnel.pipe = opened ? new PhrasePipe(opened.enc, opened.dec) : new PhrasePipe(new Codec(profile, topicSeed(keys, "c2s")), new Codec(profile, topicSeed(keys, "s2c")));
		tunnel.sendCounter = 2;
		tunnel.recvCounter = 1;
		tunnel.socket = socket;
		tunnel.bind();
		tunnel.writeRaw(dataPreamble(keys, profile));
		return tunnel;
	}
	/** Server: the session is already known, so the first line is already in the session's voice. */
	static accept(socket, keys, surface) {
		const profile = keys.profile;
		const opened = surface?.open("server", topicSeed(keys, "s2c"), topicSeed(keys, "c2s"));
		const pipe = opened ? new PhrasePipe(opened.enc, opened.dec) : new PhrasePipe(new Codec(profile, topicSeed(keys, "s2c")), new Codec(profile, topicSeed(keys, "c2s")));
		return new Promise((resolve, reject) => {
			let tunnel = null;
			const fail = (err) => {
				if (!tunnel) reject(err);
				else tunnel.fail(err);
			};
			socket.onLine((line) => {
				if (!line) return;
				let payloads;
				try {
					payloads = pipe.pushLine(line);
				} catch (err) {
					fail(err instanceof Error ? err : /* @__PURE__ */ new Error("decode"));
					return;
				}
				if (!tunnel) {
					if (!payloads.length) return;
					try {
						const raw = payloads[0];
						if (!equalBytes(raw.subarray(0, 4), keys.token)) throw new Error("unknown session");
						if (readPreamble(keys, raw).profile !== profile) throw new Error("profile");
						tunnel = new Tunnel(keys, profile, "server");
						tunnel.pipe = pipe;
						tunnel.sendCounter = 1;
						tunnel.recvCounter = 2;
						tunnel.socket = socket;
						resolve(tunnel);
						for (const extra of payloads.slice(1)) tunnel.onCipher(extra);
					} catch (err) {
						fail(err instanceof Error ? err : /* @__PURE__ */ new Error("preamble"));
					}
					return;
				}
				for (const payload of payloads) tunnel.onCipher(payload);
			});
		});
	}
	bind() {
		const socket = this.socket;
		if (!socket) return;
		socket.onLine((line) => {
			if (!line || !this.pipe) return;
			let payloads;
			try {
				payloads = this.pipe.pushLine(line);
			} catch (err) {
				this.fail(err instanceof Error ? err : /* @__PURE__ */ new Error("decode"));
				return;
			}
			for (const payload of payloads) this.onCipher(payload);
		});
	}
	fail(err) {
		this.failed = err;
		for (const slot of this.streams.values()) {
			if (!slot.opened) slot.reject(err);
			slot.onClose();
		}
	}
	writeRaw(payload) {
		if (!this.pipe || !this.socket) throw new Error("tunnel closed");
		for (const item of this.pipe.encode(payload)) {
			this.outgoing.push({
				text: item.line,
				meta: item.meta
			});
			this.onLine?.(item.line, item.meta, "out");
			this.socket.send(item.line);
		}
	}
	sendPlain(plain) {
		if (this.failed) throw this.failed;
		const dir = this.role === "client" ? 0 : 1;
		const boxed = seal(this.keys.sendKey, dir, this.sendCounter++, plain);
		this.cipherOut.push(boxed);
		this.writeRaw(boxed);
	}
	onCipher(boxed) {
		const dir = this.role === "client" ? 1 : 0;
		let plain;
		try {
			plain = open(this.keys.recvKey, dir, this.recvCounter++, boxed);
		} catch (err) {
			this.fail(err instanceof Error ? err : /* @__PURE__ */ new Error("open"));
			return;
		}
		if (plain.length < 5) return;
		const type = plain[0];
		const id = new DataView(plain.buffer, plain.byteOffset + 1, 4).getUint32(0);
		const rest = plain.subarray(5);
		if (type === TYPE_DATA) this.onData(id, rest);
		else if (type === TYPE_OPEN) this.onOpenFrame(id, rest);
		else if (type === TYPE_OK) this.onOk(id);
		else if (type === TYPE_ERR) this.onErr(id, text(rest));
		else if (type === TYPE_CLOSE) this.onClose(id);
	}
	slotFrame(type, id, rest = /* @__PURE__ */ new Uint8Array()) {
		const out = new Uint8Array(5 + rest.length);
		out[0] = type;
		new DataView(out.buffer).setUint32(1, id);
		out.set(rest, 5);
		return out;
	}
	open(host, port) {
		if (!safeHost(host) || port < 1 || port > 65535) throw new Error("refused address");
		const id = this.nextId;
		this.nextId += 2;
		const slot = this.makeSlot(id, false);
		const hostBytes = utf8(host);
		const rest = new Uint8Array(2 + hostBytes.length);
		new DataView(rest.buffer).setUint16(0, port);
		rest.set(hostBytes, 2);
		this.sendPlain(this.slotFrame(TYPE_OPEN, id, rest));
		return this.view(slot);
	}
	makeSlot(id, opened) {
		let resolve = () => {};
		let reject = () => {};
		const slot = {
			id,
			onData: () => {},
			onClose: () => {},
			ready: new Promise((res, rej) => {
				resolve = res;
				reject = rej;
			}),
			resolve,
			reject,
			opened,
			closed: false,
			buffer: []
		};
		this.streams.set(id, slot);
		return slot;
	}
	view(slot) {
		return {
			id: slot.id,
			write: (data) => this.writeStream(slot, data),
			close: () => this.closeStream(slot),
			onData: (cb) => {
				slot.onData = cb;
			},
			onClose: (cb) => {
				slot.onClose = cb;
			},
			ready: slot.ready
		};
	}
	writeStream(slot, data) {
		if (slot.closed) return;
		const size = 200;
		for (let i = 0; i < data.length; i += size) this.sendPlain(this.slotFrame(TYPE_DATA, slot.id, data.subarray(i, i + size)));
	}
	closeStream(slot) {
		if (slot.closed) return;
		slot.closed = true;
		this.streams.delete(slot.id);
		try {
			this.sendPlain(this.slotFrame(TYPE_CLOSE, slot.id));
		} catch {}
	}
	onData(id, data) {
		const slot = this.streams.get(id);
		if (!slot || slot.closed) return;
		if (!slot.opened) slot.buffer.push(data);
		else slot.onData(data);
	}
	onOk(id) {
		const slot = this.streams.get(id);
		if (!slot || slot.opened) return;
		slot.opened = true;
		slot.resolve();
		const buffered = slot.buffer.splice(0);
		for (const chunk of buffered) slot.onData(chunk);
	}
	onErr(id, reason) {
		const slot = this.streams.get(id);
		if (!slot) return;
		slot.closed = true;
		this.streams.delete(id);
		slot.reject(new Error(reason || "open failed"));
		slot.onClose();
	}
	onClose(id) {
		const slot = this.streams.get(id);
		if (!slot || slot.closed) return;
		slot.closed = true;
		this.streams.delete(id);
		if (!slot.opened) slot.reject(/* @__PURE__ */ new Error("closed"));
		slot.onClose();
	}
	onOpenFrame(id, rest) {
		if (rest.length < 2) return;
		const port = new DataView(rest.buffer, rest.byteOffset, 2).getUint16(0);
		const host = text(rest.subarray(2));
		const slot = this.makeSlot(id, false);
		const view = this.view(slot);
		const accept = this.onOpen;
		if (!accept || !safeHost(host)) {
			this.sendPlain(this.slotFrame(TYPE_ERR, id, utf8("refused")));
			slot.closed = true;
			this.streams.delete(id);
			return;
		}
		Promise.resolve().then(() => accept(host, port, view)).then(() => {
			slot.opened = true;
			slot.resolve();
			this.sendPlain(this.slotFrame(TYPE_OK, id));
			const buffered = slot.buffer.splice(0);
			for (const chunk of buffered) slot.onData(chunk);
		}).catch((err) => {
			const reason = err instanceof Error ? err.message : "dial failed";
			slot.closed = true;
			this.streams.delete(id);
			this.sendPlain(this.slotFrame(TYPE_ERR, id, utf8(reason)));
		});
	}
};
function startHandshake(opts) {
	const hs = new Handshake(opts.role, opts.self, opts.peerEdPub, opts.peerName, opts.profile, () => Date.now(), opts.seen ?? /* @__PURE__ */ new Set());
	const cover = pairCover(unb64url(opts.self.edPub), opts.peerEdPub, "control");
	return handshakeOn(opts.socket, hs, cover, opts.log, opts.onServerReady, opts.surface);
}
//#endregion
export { utf8 as S, safeHost as _, MOODS as a, text as b, Rng as c, createIdentity as d, handshakeOn as f, publicIdentity as g, pairCover as h, Handshake as i, TAILS as l, memoryPair as m, CONNECTORS as n, OPENERS as o, measure as p, Codec as r, PhrasePipe as s, BRIDGE_B as t, Tunnel as u, seal as v, unb64url as x, startHandshake as y };
