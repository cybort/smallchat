import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { equalBytes, unb64url } from "./bytes";
import { createIdentity } from "./crypto";
import { forgeNotes, forgeSpeech, parseCoherence, parseRemoteNotes, parseRemoteSpeech } from "./foundry";
import { DEMO_BRIEF, DEMO_CARD_INPUT, parseBrief, parseCardText, programCard } from "./script";
import { surfaceOf } from "./surface";
import { walkAudit } from "./veil";
import { memoryPair, startHandshake } from "./wire";

const payload = "今天下午把窗口的草稿寄出，对方只需要看到一封平常的信。";

describe("private script", () => {
  it("forges a bank the public topic list cannot claim", async () => {
    const card = programCard(DEMO_CARD_INPUT);
    const speech = await walkAudit({
      posture: "both",
      dialect: "speech",
      briefText: DEMO_BRIEF,
      card,
      epoch: 3,
      payload,
    });
    assert.equal(speech.match, true);
    assert.equal(speech.recovered, payload);
    assert.equal(speech.publicHits, 0);
    assert.equal(speech.continuity.ok, true);
    assert.equal(speech.fingerprints.length, 2);
    assert.notEqual(speech.fingerprints[0].hex, speech.fingerprints[1].hex);
    assert.ok(speech.samples.length >= 4);
  });

  it("changes surface when the epoch changes and when the author changes", () => {
    const brief = parseBrief(DEMO_BRIEF);
    const a = forgeSpeech(brief, "甲", "甲", 1);
    const b = forgeSpeech(brief, "甲", "甲", 2);
    const c = forgeSpeech(brief, "甲", "乙", 1);
    assert.notEqual(a.openers.join(""), b.openers.join(""));
    assert.notEqual(a.moods.join(""), c.moods.join(""));
    assert.equal(forgeSpeech(brief, "甲", "甲", 1).openers.join(""), a.openers.join(""));
  });

  it("round-trips program lines and keeps the schema continuous", async () => {
    const card = programCard({
      ...DEMO_CARD_INPUT,
      opKey: "verb",
      shelfKey: "bin",
      reqKey: "n",
      cursorKey: "cur",
      atKey: "ts",
      noteKey: "msg",
      okKey: "done",
    });
    const report = await walkAudit({
      posture: "one",
      dialect: "program",
      briefText: DEMO_BRIEF,
      card,
      epoch: 2,
      payload,
    });
    assert.equal(report.match, true);
    assert.equal(report.publicHits, 0);
    assert.equal(report.continuity.ok, true);
    assert.ok(report.continuity.notes.some((note) => note.includes("verb bin n cur ts msg")));
    assert.ok(report.continuity.notes.some((note) => note.includes("done")));
    const first = JSON.parse(report.samples[0].text) as { n: number; cur: string; ts: number };
    const second = JSON.parse(report.samples[2].text) as { n: number };
    assert.match(first.cur, /^c\.[0-9a-j]{10}$/);
    assert.equal(typeof first.ts, "number");
    assert.equal(second.n, first.n + 1);
  });

  it("shows that the shipped topic list is recognizable when no private script is used", async () => {
    const report = await walkAudit({
      posture: "none",
      dialect: "speech",
      briefText: DEMO_BRIEF,
      card: programCard(DEMO_CARD_INPUT),
      epoch: 1,
      payload,
    });
    assert.equal(report.match, true);
    assert.equal(report.publicHits, report.lineCount);
    assert.equal(report.continuity.ok, true);
  });

  it("rejects a program line that grows a new field", async () => {
    const { ProgramCodec } = await import("./veil");
    const card = programCard(DEMO_CARD_INPUT);
    const notes = forgeNotes(parseBrief(DEMO_BRIEF), "甲", "甲", 1, true);
    const seed = new Uint8Array(32);
    seed[0] = 4;
    const enc = new ProgramCodec(card, notes, "c2s", seed, false);
    const dec = new ProgramCodec(card, notes, "c2s", seed, false);
    const line = enc.emit(7);
    const broken = JSON.parse(line) as Record<string, unknown>;
    broken.extra = 1;
    assert.throws(() => dec.absorb(JSON.stringify(broken)), /字段或顺序/);
    assert.equal(dec.absorb(line), 7);
    const tools = notes.filter((note) => !note.startsWith("tail ") && !note.startsWith("ls "));
    const bins = new Set(tools.map((note) => note.split(" ")[0]));
    const verbs = new Set(tools.map((note) => note.split(" ")[1]));
    assert.equal(bins.size, 1);
    assert.ok(verbs.size >= 4);
    assert.ok(notes.some((note) => /^tail -n \d+ \S+\.log$/.test(note)));
    assert.ok(notes.some((note) => /^ls -l \S+$/.test(note)));
    for (const note of notes) {
      assert.doesNotMatch(note, /[。，！？]|--ttl/);
      if (note.startsWith("tail ")) assert.match(note, /^tail -n \d+ \S+\.log$/);
      if (note.startsWith("ls ")) assert.match(note, /^ls -l \S+$/);
    }
    const lens = notes.map((note) => note.length);
    assert.ok(Math.max(...lens) <= Math.min(...lens) * 3);
    assert.throws(() => parseRemoteNotes(JSON.stringify(Array.from({ length: 16 }, () => "抽屉里的旧钥匙还在"))), /命令/);
  });

  it("accepts a model-shaped bank", () => {
    const brief = parseBrief(DEMO_BRIEF);
    const bank = forgeSpeech(brief, "甲", "甲", 4);
    const raw = JSON.stringify({
      openers: bank.openers,
      moods: bank.moods,
      tails: bank.tails,
      facts: bank.facts.map((fact) => ({
        open: fact.open,
        memory: fact.memory,
        today: fact.today,
        bridge: fact.bridge,
      })),
    });
    const parsed = parseRemoteSpeech(raw, brief, "甲", "甲", 4);
    assert.equal(parsed.pen, "本地模型");
    assert.equal(parsed.facts.length, brief.facts.length);
    assert.ok(parsed.facts[0].bridge.b.every((item) => item.includes("{next}")));
  });

  it("handshakes through a frozen surface the shipped topic list cannot read", async () => {
    const card = programCard(DEMO_CARD_INPUT);
    const minted = await walkAudit({
      posture: "both",
      dialect: "program",
      briefText: DEMO_BRIEF,
      card,
      epoch: 2,
      payload: "寄出",
    });
    assert.ok(minted.frozen);
    if (!minted.frozen) return;
    const surface = surfaceOf(minted.frozen);
    const clientId = createIdentity("甲");
    const serverId = createIdentity("乙");
    const [clientSock, serverSock] = memoryPair();
    const seen: string[] = [];
    const serverKeys = startHandshake({
      socket: serverSock,
      role: "server",
      self: serverId,
      peerEdPub: unb64url(clientId.edPub),
      peerName: clientId.name,
      profile: "talk",
      surface,
      log: (line) => seen.push(line),
    });
    const clientKeys = startHandshake({
      socket: clientSock,
      role: "client",
      self: clientId,
      peerEdPub: unb64url(serverId.edPub),
      peerName: serverId.name,
      profile: "talk",
      surface,
    });
    const [left, right] = await Promise.all([clientKeys, serverKeys]);
    assert.ok(equalBytes(left.sessionId, right.sessionId));
    assert.ok(seen.length > 0);
    assert.ok(seen.every((line) => line.startsWith("{")));
    assert.equal(seen.filter((line) => line.includes("今天")).length, 0);
  });

  it("handshakes through a private speech surface", async () => {
    const card = programCard(DEMO_CARD_INPUT);
    const minted = await walkAudit({
      posture: "one",
      dialect: "speech",
      briefText: DEMO_BRIEF,
      card,
      epoch: 4,
      payload: "寄出",
    });
    if (!minted.frozen) throw new Error("no freeze");
    assert.equal(minted.publicHits, 0);
    const surface = surfaceOf(minted.frozen);
    const clientId = createIdentity("甲");
    const serverId = createIdentity("乙");
    const [clientSock, serverSock] = memoryPair();
    const seen: string[] = [];
    const [left, right] = await Promise.all([
      startHandshake({
        socket: clientSock,
        role: "client",
        self: clientId,
        peerEdPub: unb64url(serverId.edPub),
        peerName: serverId.name,
        profile: "talk",
        surface,
      }),
      startHandshake({
        socket: serverSock,
        role: "server",
        self: serverId,
        peerEdPub: unb64url(clientId.edPub),
        peerName: clientId.name,
        profile: "talk",
        surface,
        log: (line) => seen.push(line),
      }),
    ]);
    assert.ok(equalBytes(left.sessionId, right.sessionId));
    assert.ok(seen.length > 0);
    assert.ok(seen.every((line) => !line.startsWith("{")));
  });

  it("speaks the requested language and keeps custom program fields", async () => {
    const card = programCard(DEMO_CARD_INPUT);
    const english = await walkAudit({
      posture: "both",
      dialect: "speech",
      briefText: `人设：short factual and dry
draft｜the window draft goes out wednesday
shop｜the alley shop opens only in rain
key｜the old key stays in the drawer`,
      card,
      epoch: 2,
      language: "English",
      payload,
    });
    assert.equal(english.match, true);
    assert.equal(english.language, "English");
    assert.equal(english.coherence.asked, false);
    assert.equal(english.publicHits, 0);
    assert.ok(english.samples.some((sample) => sample.text.includes("mentions")));
    assert.equal(english.samples.some((sample) => sample.text.includes("提起")), false);
    assert.equal(english.frozen?.language, "English");

    const custom = parseCardText(`操作 verb = get, put, head, post
分类 box = inbox, sent, hold, bin
计数 n
游标 cur
时钟 ts
附言 msg
结果 done`);
    const program = await walkAudit({
      posture: "none",
      dialect: "program",
      briefText: DEMO_BRIEF,
      card: custom,
      epoch: 1,
      payload,
    });
    assert.equal(program.match, true);
    assert.equal(program.continuity.ok, true);
    assert.ok(program.samples[0]?.text.includes('"verb"'));
    assert.ok(program.samples[0]?.text.includes('"n"'));
    assert.equal(program.samples[0]?.text.includes('"op"'), false);
  });

  it("reads a coherence verdict", () => {
    const got = parseCoherence('```json\n{"ok":false,"notes":["第三句换了语言","相邻句接不上"]}\n```');
    assert.equal(got.ok, false);
    assert.equal(got.notes.length, 2);
    assert.throws(() => parseCoherence("不是 json"), /没有按格式审完/);
  });
});
