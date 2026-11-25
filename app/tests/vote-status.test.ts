import { describe, expect, test } from "bun:test";
import { publicVoteStatus } from "../components/proposalVoting/voteStatus";
import { decideCommitmentStep } from "../plugins/crispVoting/utils/commitmentDecision";
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


describe("returning to a private proposal", () => {
  const scope = { chainId: 1, plugin: "0xabc", roundId: 7n, voter: "0xdef" };
  test("unsubscribing on navigation keeps evidence and its transaction for the same wallet and round", () => {
    const store = createVoteEvidenceStore();
    const leave = store.subscribe(() => {});
    store.record(scope, "confirmed", false, "0xfirst");
    leave();
    expect(store.get(scope)).toBe("confirmed");
    expect(store.transaction(scope)).toBe("0xfirst");
    expect(store.transaction({ ...scope, voter: "0xother" })).toBeUndefined();
    expect(store.transaction({ ...scope, roundId: 8n })).toBeUndefined();
    store.record(scope, "confirmed", true, "0xmask");
    store.record(scope, "submitted", false, "0xunconfirmed");
    expect(store.transaction(scope)).toBe("0xfirst");
    store.record(scope, "confirmed", false, "0xupdated");
    expect(store.transaction(scope)).toBe("0xupdated");
  });
  test("a new browser session has no invented vote evidence", () => {
    expect(createVoteEvidenceStore().get(scope)).toBeUndefined();
  });
});


describe("refresh-safe private participation receipts", () => {
  const scope = { chainId: 1, plugin: "0xabc", roundId: 7n, voter: "0xdef" };
  const hash = `0x${"ab".repeat(32)}`;
  function storage() {
    const data = new Map<string, string>();
    return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  }
  test("a fresh store restores participation and transaction without serializing ballot contents", () => {
    const tab = storage();
    const before = createVoteEvidenceStore(() => tab);
    before.record(scope, "confirmed", false, hash);
    expect(JSON.parse([...tab.data.values()][0])).toEqual({ version: 1, status: "confirmed", txHash: hash });
    const after = createVoteEvidenceStore(() => tab);
    expect(after.get(scope)).toBe("confirmed");
    expect(after.transaction(scope)).toBe(hash);
    for (const other of [{ ...scope, chainId: 2 }, { ...scope, plugin: "0xother" }, { ...scope, voter: "0xother" }, { ...scope, roundId: 8n }]) {
      expect(after.get(other)).toBeUndefined();
      expect(after.transaction(other)).toBeUndefined();
    }
  });
  test("pending stays pending after refresh; masks write no participation receipt", () => {
    const tab = storage();
    createVoteEvidenceStore(() => tab).record(scope, "confirmed", true, hash);
    expect(tab.data.size).toBe(0);
    createVoteEvidenceStore(() => tab).record(scope, "submitted");
    expect(createVoteEvidenceStore(() => tab).get(scope)).toBe("submitted");
  });
  test("a relayed private ballot keeps its explorer transaction after refresh", () => {
    const tab = storage();
    const step = decideCommitmentStep({ status: "pending_availability", tx_hash: hash, message: null });
    if (step.action !== "committed") throw new Error("Expected a relayed commitment");
    createVoteEvidenceStore(() => tab).record(scope, "submitted", false, step.txHash);
    const refreshed = createVoteEvidenceStore(() => tab);
    expect(refreshed.get(scope)).toBe("submitted");
    expect(refreshed.transaction(scope)).toBe(hash);
  });
  test("malformed records and invalid hashes cannot become confirmed", () => {
    const tab = storage();
    createVoteEvidenceStore(() => tab).record(scope, "confirmed", false, hash);
    const key = [...tab.data.keys()][0];
    for (const invalid of ["{", "null", '{"version":2,"status":"confirmed"}', '{"version":1,"status":"yes"}', '{"version":1,"status":"confirmed","txHash":"javascript:bad"}']) {
      tab.setItem(key, invalid);
      expect(createVoteEvidenceStore(() => tab).get(scope)).toBeUndefined();
    }
  });
  test("blocked storage keeps voting functional and preserves in-memory feedback", () => {
    const store = createVoteEvidenceStore(() => { throw new Error("Storage blocked"); });
    expect(store.get(scope)).toBeUndefined();
    store.record(scope, "confirmed", false, hash);
    expect(store.get(scope)).toBe("confirmed");
    expect(store.transaction(scope)).toBe(hash);
  });
});
