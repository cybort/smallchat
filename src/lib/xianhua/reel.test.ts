import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PhrasePipe } from "./codec";
import { utf8 } from "./bytes";
import { parseBrief } from "./script";
import { ReelCodec, auditScore, composeBar, forgeReel, lyricText, proveReel, synthBars, textureOf, verseLine, wavBytes } from "./reel";

const brief = parseBrief(`人设：说话短，先摆事实，不抒情。
草稿｜周三把窗口的草稿寄出
面馆｜巷口那家只在雨天去
钥匙｜抽屉里的旧钥匙还在
轮渡｜过江会站在下风的一侧`);

describe("reel", () => {
  it("keeps four distinct legal choices in one bar", () => {
    const bank = forgeReel(brief, "甲", "甲", 3);
    const prev = 60 + bank.tonic;
    const seen = new Set<string>();
    for (let index = 0; index < 256; index++) {
      const bar = composeBar(bank, index, 0, prev);
      const key = `${bar.desc}|${bar.texture}`;
      assert.equal(seen.has(key), false, `index ${index} collides`);
      seen.add(key);
      assert.equal(bar.notes.filter((note) => !note.bass).reduce((sum, note) => sum + note.eighths, 0), 8);
    }
  });

  it("round-trips and stays inside the key", async () => {
    const payload = "今天下午把窗口的草稿寄出，对方只需要看到一封平常的信。";
    const proved = await proveReel(brief, 3, payload);
    assert.equal(proved.match, true);
    assert.equal(proved.theory.ok, true, proved.theory.problems.join(" / "));
    const bank = forgeReel(brief, "甲", "甲", 3);
    const seed = new Uint8Array(32).fill(6);
    const frames = new PhrasePipe(new ReelCodec(bank, seed), new ReelCodec(bank, seed)).encode(utf8(payload));
    assert.equal(auditScore(bank, frames.map((frame) => frame.line)).ok, true);
    assert.equal(textureOf(frames[0].line) >= 0, true);
    const sound = synthBars(frames.slice(0, 2).map((frame) => frame.line.match(/<desc id="bar">([^<]*)<\/desc>/)?.[1] ?? ""), bank.bpm);
    const wav = wavBytes(sound.pcm, sound.rate);
    assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
    assert.ok(sound.pcm.length > sound.rate);
    const lyrics = frames.slice(0, 4).map((frame) => lyricText(frame.line));
    assert.equal(new Set(lyrics).size, 4);
    assert.ok(lyrics[3].includes("面馆"));
    assert.equal(frames[0].line.includes("<ellipse"), false);
  });

  it("advances a verse in each sample language", () => {
    const samples = [
      { language: "中文", here: "钥匙", next: "轮渡", text: "抽屉里的旧钥匙还在" },
      { language: "日本語", here: "鍵", next: "船", text: "引き出しの古い鍵がまだある" },
      { language: "English", here: "key", next: "ferry", text: "The old key is still in the drawer" },
    ];
    for (const sample of samples) {
      const kind = sample.language === "中文" ? "zh" : sample.language === "日本語" ? "ja" : "en";
      const lines = [0, 1, 2, 3].map((step) => verseLine(kind, step, { anchor: sample.here, text: sample.text }, { anchor: sample.next }));
      assert.equal(new Set(lines).size, 4);
      for (const line of lines) assert.ok(line.includes(sample.here));
      assert.ok(lines[3].includes(sample.next));
      assert.notEqual(lines[0], lines[2]);
    }
  });
});
