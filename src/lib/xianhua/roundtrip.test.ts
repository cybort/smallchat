import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { utf8 } from "./bytes";
import { Codec } from "./codec";
import { runDemo } from "./demo";
import { proveTcp } from "./node-host.server";
import { TOPICS, slotLists, type Phase } from "./topics";

describe("cover text", () => {
  it("every slot list is a prefix-free code of the right width", () => {
    const phases: Phase[] = ["open", "memory", "today", "bridge"];
    for (const topic of TOPICS) {
      for (const focus of topic.focuses) {
        for (const phase of phases) {
          for (const next of TOPICS) slotLists(topic, focus, phase, next.hint);
        }
      }
    }
  });

  it("round-trips both profiles and does not repeat a line inside a run", () => {
    const seed = utf8("xianhua-roundtrip-seed-32b!!!!");
    for (const mode of ["talk", "dense"] as const) {
      const enc = new Codec(mode, seed);
      const dec = new Codec(mode, seed);
      const seen = new Set<string>();
      let dup = 0;
      const width = mode === "talk" ? 2 : 4;
      const limit = width === 2 ? 65536 : 2 ** 32;
      for (let i = 0; i < 80; i++) {
        const index = (i * 9973 + 13) % Math.min(limit, 65536);
        const line = enc.emit(index);
        assert.equal(dec.absorb(line), index);
        if (seen.has(line)) dup++;
        seen.add(line);
      }
      assert.equal(dup, 0);
    }
  });

  it("topic runs vary and do not bounce straight back", () => {
    const seed = crypto.getRandomValues(new Uint8Array(32));
    const enc = new Codec("talk", seed);
    const labels: string[] = [];
    for (let i = 0; i < 80; i++) {
      enc.emit(i * 17);
      labels.push(enc.last.label);
    }
    const runs: number[] = [];
    let n = 0;
    let prev = "";
    const order: string[] = [];
    for (const label of labels) {
      if (label !== prev) {
        if (n) runs.push(n);
        if (order.length >= 2) assert.notEqual(label, order[order.length - 2]);
        order.push(label);
        prev = label;
        n = 1;
      } else n++;
    }
    if (n) runs.push(n);
    const finished = runs.slice(0, -1);
    assert.ok(finished.length >= 3);
    assert.ok(finished.every((len) => len >= 4 && len <= 15));
    assert.ok(runs[runs.length - 1] <= 15);
    assert.ok(new Set(finished).size >= 2);
  });
});

describe("session", () => {
  it("recovers a payload and keeps one fact inside an episode", async () => {
    const payload = "窗口那边只该看见一封平常的信，不要看见锁。";
    for (const profile of ["talk", "dense"] as const) {
      const result = await runDemo(profile, payload);
      assert.equal(result.match, true);
      assert.equal(result.recovered, payload);
      assert.equal(result.duplicateLines, 0);
      const finished = result.episodeLengths.slice(0, -1);
      assert.ok(finished.length >= 1);
      assert.ok(finished.every((len) => len >= 4 && len <= 15));
      assert.ok(result.wire.gzipRatio < result.cipher.gzipRatio);
      assert.ok(result.wire.shannon < result.cipher.shannon - 0.4);
      assert.ok(result.samples.length >= 1);
      for (const sample of result.samples) {
        assert.ok(sample.lines.length >= 3);
        assert.ok(sample.lines.every((line) => line.includes("，") || line.includes("。")));
      }
    }
  });

  it("carries bytes through two ports, a proxy, and a mapped port", async () => {
    const payload = "套接字这一程也该原样回来。";
    const proof = await proveTcp("talk", payload);
    assert.equal(proof.match, true);
    assert.equal(proof.differentPorts, true);
    assert.ok(proof.sample.length > 4);
    assert.ok(proof.wire.gzipRatio < proof.cipher.gzipRatio);
    assert.ok(proof.wire.cjkRatio > 0.5);
  });
});
