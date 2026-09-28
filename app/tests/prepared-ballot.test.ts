import { describe, expect, test } from "bun:test";
import {
  parsePreparedBallot,
  preparedBallotKey,
  preparedSenderError,
  readPreparedBallot,
  savePreparedBallot,
  type BallotScope,
  type PreparedBallot,
} from "../plugins/crispVoting/utils/preparedBallot";
import { sendPreparedBallot } from "../plugins/crispVoting/utils/sendPreparedBallot";
import { encodeAbiParameters, parseAbiParameters, type Address, type Hex } from "viem";

const voter: Address = "0x0000000000000000000000000000000000000001";
const sender: Address = "0x0000000000000000000000000000000000000002";
const program: Address = "0x0000000000000000000000000000000000000003";
const scope: BallotScope = {
  chainId: 1,
  plugin: program,
  roundId: "999999999999999999999999999999999999999",
  demo: false,
};
const ballot = (): PreparedBallot => ({
  ...scope,
  version: 1,
  voter,
  program,
  encodedProof: encodeAbiParameters(parseAbiParameters("bytes, address, bytes32, bytes, uint40"), [
    "0xabcd",
    voter,
    `0x${"00".repeat(32)}`,
    "0xabcd",
    0,
  ]),
  createdAt: Date.now() - 1000,
  expiresAt: Date.now() + 60000,
});
const hash = `0x${"ab".repeat(32)}` as Hex;
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe("Prepared encrypted ballot", () => {
  test("survives reload/account changes and strips unrecognised clear-text fields", () => {
    const store = storage(),
      original = ballot();
    savePreparedBallot(store, { ...original, choice: "Yes", signature: "raw signature" } as PreparedBallot);
    const raw = store.getItem(preparedBallotKey(scope))!;
    expect(raw).not.toContain("choice");
    expect(raw).not.toContain("signature");
    expect(readPreparedBallot(store, scope)).toEqual(original);
    expect(preparedSenderError(original, sender, 1)).toBeUndefined();
    expect(original.voter).toBe(voter);
  });
  test("never loads another chain, plugin, round, or demo payload", () => {
    const raw = JSON.stringify(ballot());
    for (const override of [{ chainId: 2 }, { plugin: sender }, { roundId: "2" }, { demo: true }])
      expect(parsePreparedBallot(raw, { ...scope, ...override })).toBeNull();
  });
  test("rejects malformed, expired and plaintext demo ballots in live mode", () => {
    for (const raw of [
      "not json",
      "null",
      JSON.stringify({}),
      JSON.stringify({ ...ballot(), expiresAt: Date.now() - 1 }),
      JSON.stringify({ ...ballot(), encodedProof: "0xzz" }),
      JSON.stringify({ ...ballot(), demoOption: 0 }),
      JSON.stringify({ ...ballot(), voter: sender }),
    ])
      expect(parsePreparedBallot(raw, scope)).toBeNull();
  });
  test("cleans expired payloads and keeps an already-broadcast hash after voting closes", () => {
    const store = storage(),
      expired = { ...ballot(), createdAt: 1, expiresAt: 2 };
    store.setItem(preparedBallotKey(scope), JSON.stringify(expired));
    expect(readPreparedBallot(store, scope)).toBeNull();
    expect(store.getItem(preparedBallotKey(scope))).toBeNull();
    expect(parsePreparedBallot(JSON.stringify({ ...expired, transactionHash: hash }), scope)?.transactionHash).toBe(
      hash
    );
  });
  test("refuses disconnected, same-wallet, wrong-network, and expired sends", () => {
    expect(preparedSenderError(ballot(), undefined, 1)).toContain("Connect");
    expect(preparedSenderError(ballot(), voter, 1)).toContain("different wallet");
    expect(preparedSenderError(ballot(), sender, 2)).toContain("network");
    expect(preparedSenderError({ ...ballot(), expiresAt: 1 }, sender, 1)).toContain("closed");
  });
  test("storage failure is explicit before the user switches wallets", () => {
    expect(() =>
      savePreparedBallot(
        {
          ...storage(),
          setItem: () => {
            throw new Error("quota");
          },
        },
        ballot()
      )
    ).toThrow("could not save");
  });
});

describe("Sending with a different wallet", () => {
  test("uses wallet B as sender, preserves A's exact proof, and saves hash before confirmation", async () => {
    const original = ballot(),
      events: string[] = [];
    let saved: PreparedBallot | undefined;
    const result = await sendPreparedBallot({
      ballot: original,
      sender,
      chainId: 1,
      publish: async (proof, options) => {
        expect(proof).toBe(original.encodedProof);
        expect(options.account).toBe(sender);
        expect(options.expectedProgram).toBe(program);
        options.onSubmitted(hash);
        events.push("confirmed");
        return hash;
      },
      receipt: async () => {
        throw new Error("Not resuming");
      },
      save: (value) => {
        saved = value;
        events.push("saved");
      },
      remove: () => events.push("removed"),
    });
    expect(result).toBe(hash);
    expect(saved?.voter).toBe(voter);
    expect(saved?.transactionHash).toBe(hash);
    expect(events).toEqual(["saved", "confirmed", "removed"]);
  });
  test("a rejected send retains the encrypted proof for retry", async () => {
    let removed = false;
    await expect(
      sendPreparedBallot({
        ballot: ballot(),
        sender,
        chainId: 1,
        publish: async () => {
          throw new Error("Rejected");
        },
        receipt: async () => ({ status: "success" }),
        save: () => {},
        remove: () => {
          removed = true;
        },
      })
    ).rejects.toThrow("Rejected");
    expect(removed).toBe(false);
  });
  test("confirmation timeout persists hash and a reload checks it without resending", async () => {
    const original = ballot();
    let saved = original;
    let sends = 0;
    let removed = false;
    const deps = {
      ballot: original,
      sender,
      chainId: 1,
      publish: async (_proof: Hex, options: { onSubmitted: (hash: Hex) => void }) => {
        sends++;
        options.onSubmitted(hash);
        throw new Error("Timeout");
      },
      receipt: async () => ({ status: "success" as const }),
      save: (value: PreparedBallot) => {
        saved = value;
      },
      remove: () => {
        removed = true;
      },
    };
    await expect(sendPreparedBallot(deps)).rejects.toThrow("Timeout");
    expect(removed).toBe(false);
    await sendPreparedBallot({ ...deps, ballot: saved, sender: undefined, chainId: undefined });
    expect(sends).toBe(1);
    expect(removed).toBe(true);
  });
  test("a reverted transaction is never marked successful", async () => {
    let saved: PreparedBallot | undefined,
      removed = false;
    await expect(
      sendPreparedBallot({
        ballot: { ...ballot(), transactionHash: hash },
        sender,
        chainId: 1,
        publish: async () => {
          throw new Error("Do not resend");
        },
        receipt: async () => ({ status: "reverted" }),
        save: (value) => {
          saved = value;
        },
        remove: () => {
          removed = true;
        },
      })
    ).rejects.toThrow("reverted");
    expect(saved?.transactionHash).toBeUndefined();
    expect(removed).toBe(false);
  });
  test("rejects a demo payload without a simulator; never falls through to live publication", async () => {
    let sends = 0;
    await expect(
      sendPreparedBallot({
        ballot: { ...ballot(), demo: true, demoOption: 0 },
        sender,
        chainId: 1,
        publish: async () => {
          sends++;
          return hash;
        },
        receipt: async () => ({ status: "success" }),
        save: () => {},
        remove: () => {},
      })
    ).rejects.toThrow("live network");
    expect(sends).toBe(0);
  });
});
