import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SETTINGS, connectCommand, freshIdentity, leaveFile, publicFile, renameIdentity, serveCommand, settingsOk, stayFile } from "./deploy";

describe("keys and deploy config", () => {
  it("regenerates a private key and a matching public key", () => {
    const first = freshIdentity("甲");
    const second = freshIdentity("甲");
    assert.notEqual(first.edPriv, second.edPriv);
    assert.notEqual(first.edPub, second.edPub);
    const pub = publicFile(second);
    assert.equal(pub.edPub, second.edPub);
    assert.equal("edPriv" in pub, false);
    const renamed = renameIdentity(second, "留下");
    assert.equal(renamed.edPriv, second.edPriv);
    assert.equal(renamed.name, "留下");
  });

  it("writes two sides that only share public keys", () => {
    const stay = freshIdentity("甲");
    const leave = freshIdentity("乙");
    const bad = { ...DEFAULT_SETTINGS, controlPort: DEFAULT_SETTINGS.dataPort };
    assert.match(settingsOk(bad), /不能相同/);
    assert.equal(settingsOk(DEFAULT_SETTINGS), "");
    const server = stayFile(stay, publicFile(leave), DEFAULT_SETTINGS);
    const client = leaveFile(leave, publicFile(stay), DEFAULT_SETTINGS);
    assert.equal(server.identity.edPriv, stay.edPriv);
    assert.equal(server.peer.edPub, leave.edPub);
    assert.equal("edPriv" in server.peer, false);
    assert.equal(client.peer.edPub, stay.edPub);
    assert.equal(client.maps?.[0]?.host, "10.0.0.8");
    assert.match(serveCommand(DEFAULT_SETTINGS, "甲.json", "乙.json.pub"), /--control 4711 --data 4712/);
    assert.match(connectCommand(DEFAULT_SETTINGS, "乙.json", "甲.json.pub"), /--map 15432=10.0.0.8:5432/);
  });
});
