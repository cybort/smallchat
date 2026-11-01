import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { utf8 } from "./bytes";
import { PhrasePipe } from "./codec";
import { MEDIA_CONFIGS, MediaCodec, assessConfig, forgeMedia, recommendMedia } from "./media";
import { parseBrief } from "./script";

const brief = parseBrief(`人设：说话短，先摆事实，不抒情。
草稿｜周三把窗口的草稿寄出
面馆｜巷口那家只在雨天去
钥匙｜抽屉里的旧钥匙还在
轮渡｜过江会站在下风的一侧`);

const payload = "今天下午把窗口的草稿寄出，对方只需要看到一封平常的信。再附上一张不会被人当成噪声的卡片。";

describe("media cards", () => {
  for (const config of MEDIA_CONFIGS) {
    it(`round-trips ${config.id}`, () => {
      const bank = forgeMedia(brief, "甲", "甲", 3, config.id);
      const seed = new Uint8Array(32).fill(4);
      const send = new PhrasePipe(new MediaCodec(bank, seed), new MediaCodec(bank, seed));
      const recv = new PhrasePipe(new MediaCodec(bank, seed), new MediaCodec(bank, seed));
      const frames = send.encode(utf8(payload));
      const parts: Uint8Array[] = [];
      for (const frame of frames) {
        assert.ok(frame.line.startsWith("<svg"));
        assert.ok(!frame.line.includes("\n"));
        for (const part of recv.pushLine(frame.line)) parts.push(part);
      }
      const recovered = Buffer.concat(parts).toString("utf8");
      assert.equal(recovered, payload);
    });
  }

  it("scores completeness against detection", async () => {
    const rows = [];
    for (const config of MEDIA_CONFIGS) rows.push(await assessConfig(brief, config.id, 3, payload));
    const picks = recommendMedia(rows);
    assert.equal(picks.length, 3);
    for (const row of rows) {
      assert.equal(row.match, true);
      assert.ok(row.completeness >= 90, `${row.id} completeness ${row.completeness}`);
      assert.ok(row.cipherDistance >= 40, `${row.id} distance ${row.cipherDistance}`);
    }
    const still = rows.find((row) => row.id === "still-paper");
    const loose = rows.find((row) => row.id === "loose-ink");
    assert.ok(still && loose && still.templateRisk > loose.templateRisk);
    console.log(JSON.stringify({ rows, picks }, null, 2));
  });
});
