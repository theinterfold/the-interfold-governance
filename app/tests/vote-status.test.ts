import { describe, expect, test } from "bun:test";
import { publicVoteStatus } from "../components/proposalVoting/voteStatus";
import { createVoteEvidenceStore } from "../plugins/crispVoting/utils/voteEvidence";

describe("public vote status", () => {
  test("unknown and failed reads never become a no-vote result", () => {
    expect(publicVoteStatus(true)).toBe("loading");
    expect(publicVoteStatus(true, undefined, true)).toBe("unknown");
    expect(publicVoteStatus(true, 0, true)).toBe("unknown");
    expect(publicVoteStatus(false, 0)).toBe("disconnected");
  });

  test("only a successful zero read means no vote; supported options mean confirmed", () => {
    expect(publicVoteStatus(true, 0)).toBe("not-voted");
    for (const option of [1, 2, 3]) expect(publicVoteStatus(true, option)).toBe("confirmed");
    expect(publicVoteStatus(true, 4)).toBe("unknown");
  });
});

describe("private vote evidence", () => {
  const scope = { chainId: 1, plugin: "0xAaBb", roundId: 99n, voter: "0xDeF0" };

  test("evidence is scoped by chain, plugin, round and voter, with address matching case-insensitively", () => {
    const store = createVoteEvidenceStore();
    store.record(scope, "submitted");
    expect(store.get({ ...scope, plugin: "0xaabb", voter: "0xdef0" })).toBe("submitted");
    expect(store.get({ ...scope, chainId: 2 })).toBeUndefined();
    expect(store.get({ ...scope, plugin: "0xOther" })).toBeUndefined();
    expect(store.get({ ...scope, roundId: 100n })).toBeUndefined();
    expect(store.get({ ...scope, voter: "0xOther" })).toBeUndefined();
  });

  test("mask activity is ignored and confirmed evidence cannot regress to submitted", () => {
    const store = createVoteEvidenceStore();
    let notifications = 0;
    store.subscribe(() => notifications++);

    store.record(scope, "submitted");
    store.record(scope, "confirmed", true);
    expect(store.get(scope)).toBe("submitted");
    expect(notifications).toBe(1);

    store.record(scope, "confirmed");
    store.record(scope, "submitted");
    expect(store.get(scope)).toBe("confirmed");
    expect(notifications).toBe(2);
  });
});
