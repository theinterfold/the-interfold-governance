import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DEMO_WALLET, DESIGN_PREVIEW } from "../dev/previewMode";
import { DEMO_SENDING_WALLET, setDemoWalletDisconnected } from "../dev/demoWalletSession";
import {
  demoPrivateVoteStatus,
  demoState,
  getDemoRequest,
  prepareDemoBallot,
  resetDemoState,
  resolveDemoRequest,
  sendPreparedDemoBallot,
  simulateDemoBallot,
  type DemoOutcome,
} from "../dev/simulation";

const otherVoter = "0x000000000000000000000000000000000000dE02" as const;
const maskTarget = "0x000000000000000000000000000000000000dE03" as const;

async function settle<T>(promise: Promise<T>, outcome: DemoOutcome = "confirm"): Promise<T> {
  const pending = getDemoRequest();
  expect(pending).not.toBeNull();
  resolveDemoRequest(pending!.id, outcome);
  return promise;
}

describe.skipIf(!DESIGN_PREVIEW)("private vote status in the local demo", () => {
  beforeEach(() => {
    setDemoWalletDisconnected(false);
    resetDemoState();
  });
  afterEach(() => {
    setDemoWalletDisconnected(false);
    const pending = getDemoRequest();
    if (pending) resolveDemoRequest(pending.id, "reject");
  });

  test("disconnected ballots, masks and prepared sends never open a request or mutate votes", async () => {
    const initial = structuredClone(demoState());
    setDemoWalletDisconnected(true);
    await expect(simulateDemoBallot(75n, 0n, false)).rejects.toThrow("Connect your wallet");
    await expect(simulateDemoBallot(75n, 0n, true)).rejects.toThrow("Connect your wallet");
    await expect(prepareDemoBallot(75n, 0n)).rejects.toThrow("Connect your wallet");
    await expect(sendPreparedDemoBallot(75n, 0n, DEMO_WALLET, DEMO_SENDING_WALLET)).rejects.toThrow(
      "Connect your wallet"
    );
    expect(getDemoRequest()).toBeNull();
    expect(demoState()).toEqual(initial);
  });

  test("a fresh round means no vote, and a successful Yes ballot confirms the signer", async () => {
    const roundId = 71n;
    expect(demoPrivateVoteStatus(roundId, DEMO_WALLET)).toBe("not-voted");

    await settle(simulateDemoBallot(roundId, 0n, false, undefined, DEMO_WALLET));
    expect(demoPrivateVoteStatus(roundId, DEMO_WALLET)).toBe("confirmed");
    expect(demoPrivateVoteStatus(roundId, DEMO_SENDING_WALLET)).toBe("not-voted");
  });

  test("sending a prepared ballot confirms the voter, not the different sender", async () => {
    const roundId = 72n;
    await settle(prepareDemoBallot(roundId, 2n));
    await settle(sendPreparedDemoBallot(roundId, 2n, DEMO_WALLET, DEMO_SENDING_WALLET));

    expect(demoPrivateVoteStatus(roundId, DEMO_WALLET)).toBe("confirmed");
    expect(demoPrivateVoteStatus(roundId, DEMO_SENDING_WALLET)).toBe("not-voted");
  });

  test("mask ballots and rejected or reverted actions never confirm participation", async () => {
    const roundId = 73n;
    await settle(simulateDemoBallot(roundId, 1n, true, maskTarget, DEMO_WALLET));
    expect(demoPrivateVoteStatus(roundId, DEMO_WALLET)).toBe("not-voted");
    expect(demoPrivateVoteStatus(roundId, maskTarget)).toBe("not-voted");

    await expect(settle(simulateDemoBallot(roundId, 1n, false, undefined, DEMO_WALLET), "reject")).rejects.toThrow(
      "User rejected"
    );
    await expect(settle(simulateDemoBallot(roundId, 1n, false, undefined, DEMO_WALLET), "revert")).rejects.toThrow(
      "could not be submitted"
    );
    await expect(settle(prepareDemoBallot(roundId, 1n), "reject")).rejects.toThrow("User rejected");
    await expect(
      settle(sendPreparedDemoBallot(roundId, 1n, DEMO_WALLET, DEMO_SENDING_WALLET), "revert")
    ).rejects.toThrow("transaction reverted");
    expect(demoPrivateVoteStatus(roundId, DEMO_WALLET)).toBe("not-voted");
  });

  test("legacy unattributed votes stay unknown when a different voter is recorded", async () => {
    const roundId = 74n;
    demoState().votes[`private:${roundId}`] = 2;
    expect(demoPrivateVoteStatus(roundId, DEMO_WALLET)).toBe("unknown");

    await settle(simulateDemoBallot(roundId, 0n, false, undefined, otherVoter));
    expect(demoPrivateVoteStatus(roundId, DEMO_WALLET)).toBe("unknown");
    expect(demoPrivateVoteStatus(roundId, otherVoter)).toBe("confirmed");
  });
});
