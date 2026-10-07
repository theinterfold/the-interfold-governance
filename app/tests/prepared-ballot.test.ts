import { describe, expect, test } from "bun:test";
import {
  buildPreparedBallot,
  decodeAttestedPayload,
  parsePreparedBallot,
  preparedBallotKey,
  preparedExpiry,
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
};
const hash = `0x${"ab".repeat(32)}` as Hex;
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** `InputCommitmentEnvelope`, the payload `CRISPProgram.publishInput` decodes. */
const attested = (slot: Address, attestationExpiresAt: bigint, attestation: Hex = `0x${"33".repeat(65)}`) =>
  encodeAbiParameters(parseAbiParameters("bytes, address, bytes32, bytes32, uint40, uint64, bytes"), [
    "0xabcd",
    slot,
    `0x${"11".repeat(32)}`,
    `0x${"22".repeat(32)}`,
    0,
    attestationExpiresAt,
    attestation,
  ]);
/** `InputEnvelope`, what the client posts to `/voting/broadcast`. It carries no attestation. */
const unattested = (slot: Address) =>
  encodeAbiParameters(parseAbiParameters("bytes, address, bytes32, bytes32, uint40, bytes"), [
    "0xabcd",
    slot,
    `0x${"11".repeat(32)}`,
    `0x${"22".repeat(32)}`,
    0,
    "0xabcdef",
  ]);

/** A saved ballot whose attestation and commitment deadline are an hour away. */
const ballot = (): PreparedBallot =>
  buildPreparedBallot({
    scope,
    voter,
    program,
    attestedPayload: attested(voter, BigInt(nowSeconds() + 3600)),
    commitmentDeadline: BigInt(nowSeconds() + 7200),
  });

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

describe("Attested envelope", () => {
  test("round-trips through storage with the server's payload byte for byte", () => {
    const payload = attested(voter, BigInt(nowSeconds() + 3600));
    const built = buildPreparedBallot({
      scope,
      voter,
      program,
      attestedPayload: payload,
      commitmentDeadline: BigInt(nowSeconds() + 7200),
    });
    const store = storage();
    savePreparedBallot(store, built);
    const read = readPreparedBallot(store, scope);
    expect(read).toEqual(built);
    expect(read?.attestedPayload).toBe(payload);
    expect(decodeAttestedPayload(read!.attestedPayload).slot.toLowerCase()).toBe(voter);
  });

  test("refuses a payload whose slot is not the signing wallet", () => {
    const payload = attested(sender, BigInt(nowSeconds() + 3600));
    expect(() =>
      buildPreparedBallot({
        scope,
        voter,
        program,
        attestedPayload: payload,
        commitmentDeadline: BigInt(nowSeconds() + 7200),
      })
    ).toThrow("different wallet");
    // Nobody may relabel a stored payload's slot as another wallet's ballot.
    const stored = { ...ballot(), attestedPayload: payload };
    expect(parsePreparedBallot(JSON.stringify(stored), scope)).toBeNull();
  });

  test("refuses an unattested envelope and an empty attestation", () => {
    expect(() =>
      buildPreparedBallot({
        scope,
        voter,
        program,
        attestedPayload: unattested(voter),
        commitmentDeadline: BigInt(nowSeconds() + 7200),
      })
    ).toThrow("cannot be sent");
    expect(() => decodeAttestedPayload(attested(voter, BigInt(nowSeconds() + 3600), "0x"))).toThrow("attestation");
    expect(parsePreparedBallot(JSON.stringify({ ...ballot(), attestedPayload: unattested(voter) }), scope)).toBeNull();
  });
});

describe("Prepared ballot expiry", () => {
  test("is the earlier of the commitment deadline and the attestation expiry", () => {
    expect(preparedExpiry(1_000n, 2_000n)).toBe(1_000_000);
    expect(preparedExpiry(2_000n, 1_000n)).toBe(1_000_000);
    expect(preparedExpiry(1_000n, 1_000n)).toBe(1_000_000);
  });

  test("is exclusive: sendable one millisecond before it and not at it", () => {
    const expiry = 5_000_000_000_000;
    const payload = attested(voter, BigInt(expiry / 1000));
    const deadline = BigInt(expiry / 1000 + 600);
    const at = (now: number) => buildPreparedBallot({ scope, voter, program, attestedPayload: payload, commitmentDeadline: deadline, now });
    expect(at(expiry - 1).expiresAt).toBe(expiry);
    expect(() => at(expiry)).toThrow("no time left");

    const built = at(expiry - 2000);
    expect(parsePreparedBallot(JSON.stringify(built), scope, expiry - 1)).not.toBeNull();
    expect(parsePreparedBallot(JSON.stringify(built), scope, expiry)).toBeNull();
    expect(preparedSenderError(built, sender, 1, expiry - 1)).toBeUndefined();
    expect(preparedSenderError(built, sender, 1, expiry)).toContain("closed");
  });

  test("the deadline wins over a longer attestation", () => {
    const deadline = BigInt(nowSeconds() + 600);
    const built = buildPreparedBallot({
      scope,
      voter,
      program,
      attestedPayload: attested(voter, BigInt(nowSeconds() + 3600)),
      commitmentDeadline: deadline,
    });
    expect(built.expiresAt).toBe(Number(deadline) * 1000);
  });

  test("a stored expiry later than the attestation is rejected", () => {
    const built = ballot();
    const attestationMs = Number(decodeAttestedPayload(built.attestedPayload).attestationExpiresAt) * 1000;
    expect(parsePreparedBallot(JSON.stringify({ ...built, expiresAt: attestationMs }), scope)).not.toBeNull();
    expect(parsePreparedBallot(JSON.stringify({ ...built, expiresAt: attestationMs + 1 }), scope)).toBeNull();
  });

  test("cleans expired payloads and keeps an already-broadcast hash after voting closes", () => {
    const store = storage();
    const expired = { ...ballot(), createdAt: 1, expiresAt: 2 };
    store.setItem(preparedBallotKey(scope), JSON.stringify(expired));
    expect(readPreparedBallot(store, scope)).toBeNull();
    expect(store.getItem(preparedBallotKey(scope))).toBeNull();
    expect(parsePreparedBallot(JSON.stringify({ ...expired, transactionHash: hash }), scope)?.transactionHash).toBe(
      hash
    );
  });
});

describe("Prepared encrypted ballot", () => {
  test("survives reload and strips unrecognised clear-text fields", () => {
    const store = storage();
    const original = ballot();
    savePreparedBallot(store, { ...original, choice: "Yes", signature: "raw signature" } as PreparedBallot);
    const raw = store.getItem(preparedBallotKey(scope))!;
    expect(raw).not.toContain("choice");
    expect(raw).not.toContain("signature");
    expect(readPreparedBallot(store, scope)).toEqual(original);
  });

  test("never loads another chain, plugin or round", () => {
    const raw = JSON.stringify(ballot());
    for (const override of [{ chainId: 2 }, { plugin: sender }, { roundId: "2" }])
      expect(parsePreparedBallot(raw, { ...scope, ...override })).toBeNull();
  });

  test("the storage key has no demo namespace", () => {
    expect(preparedBallotKey(scope)).toBe(
      `interfold:prepared-ballot:v1:1:${program.toLowerCase()}:999999999999999999999999999999999999999`
    );
  });

  test("rejects malformed ballots", () => {
    for (const raw of [
      "not json",
      "null",
      JSON.stringify({}),
      JSON.stringify({ ...ballot(), attestedPayload: "0xzz" }),
      JSON.stringify({ ...ballot(), encodedProof: undefined, attestedPayload: undefined }),
      JSON.stringify({ ...ballot(), transactionHash: "0x12" }),
    ])
      expect(parsePreparedBallot(raw, scope)).toBeNull();
  });

  test("refuses disconnected, same-wallet, wrong-network and expired sends", () => {
    expect(preparedSenderError(ballot(), undefined, 1)).toContain("Connect");
    expect(preparedSenderError(ballot(), voter, 1)).toContain("different wallet");
    expect(preparedSenderError(ballot(), sender, 2)).toContain("network");
    expect(preparedSenderError({ ...ballot(), expiresAt: 1 }, sender, 1)).toContain("closed");
    expect(preparedSenderError(ballot(), sender, 1)).toBeUndefined();
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
  test("uses wallet B as sender, preserves A's exact attested payload, and saves the hash before confirmation", async () => {
    const original = ballot();
    const events: string[] = [];
    let saved: PreparedBallot | undefined;
    const result = await sendPreparedBallot({
      ballot: original,
      sender,
      chainId: 1,
      publish: async (payload, options) => {
        expect(payload).toBe(original.attestedPayload);
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

  test("a rejected send retains the ballot for retry", async () => {
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

  test("the signing wallet cannot send its own prepared ballot", async () => {
    let sends = 0;
    await expect(
      sendPreparedBallot({
        ballot: ballot(),
        sender: voter,
        chainId: 1,
        publish: async () => {
          sends++;
          return hash;
        },
        receipt: async () => ({ status: "success" }),
        save: () => {},
        remove: () => {},
      })
    ).rejects.toThrow("different wallet");
    expect(sends).toBe(0);
  });

  test("confirmation timeout persists the hash and a reload checks it without resending", async () => {
    const original = ballot();
    let saved = original;
    let sends = 0;
    let removed = false;
    const deps = {
      ballot: original,
      sender,
      chainId: 1,
      publish: async (_payload: Hex, options: { onSubmitted: (hash: Hex) => void }) => {
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
    let saved: PreparedBallot | undefined;
    let removed = false;
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
});
