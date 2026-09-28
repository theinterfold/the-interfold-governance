import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  isAddress,
  parseEther,
  zeroAddress,
  type Address,
} from "viem";
import { createConfig } from "wagmi";
import { connect, writeContract } from "@wagmi/core";
import { PUB_CHAIN, PUB_TOKEN_ADDRESS, PUB_VE_LOCKER_ADDRESS, PUB_TOKEN_VOTING_PLUGIN_ADDRESS } from "../constants";
import { DEMO_WALLET, DESIGN_PREVIEW, DEMO_MESSAGE } from "../dev/previewMode";
import { demoConnector } from "../dev/demoConnector";
import { demoTransport, demoIndexer, demoSdk } from "../dev/fixtures";
import { DEMO_SENDING_WALLET } from "../dev/demoWalletSession";
import { iVotesAbi } from "../plugins/crispVoting/artifacts/iVotes";
import {
  DEMO_ADAPTER,
  DEMO_LOCK_NFT,
  demoState,
  demoLockVotes,
  getDemoRequest,
  resetDemoState,
  restoreDemoState,
  resolveDemoRequest,
  sendDemoTransaction,
  signDemoMessage,
  type DemoOutcome,
} from "../dev/simulation";
import { votingEscrowAbi } from "../plugins/velocker/artifacts/votingEscrow";
import { escrowAdapterAbi } from "../plugins/velocker/artifacts/escrowAdapter";
import { lockNftAbi } from "../plugins/velocker/artifacts/lockNft";
import { TokenVotingAbi } from "../plugins/tokenVoting/artifacts/TokenVoting.sol";
import { awaitSuccessfulReceipt } from "../plugins/crispVoting/utils/awaitReceipt";

const client = createPublicClient({ chain: PUB_CHAIN, transport: demoTransport(), pollingInterval: 100 });
const request = (to: Address, data: `0x${string}`) => ({ from: DEMO_WALLET, to, data });
async function settle(promise: Promise<`0x${string}`>, outcome: DemoOutcome = "confirm") {
  const pending = getDemoRequest();
  expect(pending).not.toBeNull();
  resolveDemoRequest(pending!.id, outcome);
  return promise;
}
async function approve() {
  const tx = sendDemoTransaction(
    request(
      PUB_TOKEN_ADDRESS,
      encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [PUB_VE_LOCKER_ADDRESS, parseEther("1000")] })
    )
  );
  await awaitSuccessfulReceipt(client, await settle(tx), "Approval");
}

describe.skipIf(!DESIGN_PREVIEW)("Local wallet simulation", () => {
  beforeEach(() => resetDemoState());
  afterEach(() => {
    const pending = getDemoRequest();
    if (pending) resolveDemoRequest(pending.id, "reject");
  });

  test("the expanded eligible set stays consistent with demo voting power and excludes the sending wallet", async () => {
    const voters = await demoSdk().getEligibleAddresses(1n);
    expect(voters).toHaveLength(181);
    const addresses = voters.map((voter) => voter.address.toLowerCase());
    expect(new Set(addresses).size).toBe(voters.length);
    expect(addresses).toContain(DEMO_WALLET.toLowerCase());
    expect(addresses).not.toContain(DEMO_SENDING_WALLET.toLowerCase());
    const powers = await Promise.all(
      voters.map(async (voter) => {
        expect(isAddress(voter.address)).toBe(true);
        const rawPower = await client.readContract({
          address: PUB_TOKEN_ADDRESS,
          abi: iVotesAbi,
          functionName: "getPastVotes",
          args: [voter.address as Address, 1n],
        });
        expect(BigInt(voter.balance) * 10n ** 17n).toBe(rawPower);
        return rawPower;
      })
    );
    expect(new Set(voters.map((voter) => String(voter.balance))).size).toBeGreaterThan(10);
    expect(powers.reduce((sum, value) => sum + value, 0n)).toBeLessThanOrEqual(parseEther("1000000"));
  });

  test("upgrading the example address preserves saved locks, balances and choices", () => {
    const previousWallet = "0x000000000000000000000000000000000000De01" as Address;
    const externalWallet = "0x8a30C34E8Ac6e72E6B7aAa59Fb43c935F51D4266" as Address;
    const saved = {
      ...demoState(),
      balance: parseEther("124900"),
      delegate: previousWallet,
      locks: [
        ...demoState().locks.map((lock) => ({ ...lock, owner: previousWallet })),
        { id: 5n, amount: parseEther("100"), owner: externalWallet, start: 12345 },
      ],
      allowances: { approved: parseEther("100") },
      votes: { "public:1": 2 },
    };
    const serialize = (value: unknown) =>
      JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? { demoBigInt: String(item) } : item));
    const restored = restoreDemoState(serialize(saved));
    expect(restored).toEqual({
      ...saved,
      delegate: DEMO_WALLET,
      locks: saved.locks.map((lock) => ({ ...lock, owner: lock.id === 5n ? externalWallet : DEMO_WALLET })),
    });
    expect(restoreDemoState(serialize(restored))).toEqual(restored);
    expect(restoreDemoState(serialize({ ...saved, delegate: externalWallet })).delegate).toBe(externalWallet);
  });

  test("confirming an approval then a lock updates balance, ownership and voting power", async () => {
    await approve();
    const promise = sendDemoTransaction(
      request(
        PUB_VE_LOCKER_ADDRESS,
        encodeFunctionData({ abi: votingEscrowAbi, functionName: "createLock", args: [parseEther("1000")] })
      )
    );
    const hash = await settle(promise);
    expect(demoState().locks).toHaveLength(4); // Still pending.
    await awaitSuccessfulReceipt(client, hash, "Lock");
    expect(demoState().locks).toHaveLength(5);
    expect(demoState().balance).toBe(parseEther("124000"));
    expect(demoLockVotes(DEMO_WALLET)).toBe(parseEther("26000"));
  });

  test("a reverted receipt is an error and leaves the lock and funds unchanged", async () => {
    await approve();
    const promise = sendDemoTransaction(
      request(
        PUB_VE_LOCKER_ADDRESS,
        encodeFunctionData({ abi: votingEscrowAbi, functionName: "createLock", args: [parseEther("1000")] })
      )
    );
    await expect(awaitSuccessfulReceipt(client, await settle(promise, "revert"), "Lock")).rejects.toThrow("reverted");
    expect(demoState().locks).toHaveLength(4);
    expect(demoState().balance).toBe(parseEther("125000"));
  });

  test("rejecting or losing connection does not alter delegation", async () => {
    for (const outcome of ["reject", "network"] as const) {
      const promise = sendDemoTransaction(
        request(
          DEMO_ADAPTER,
          encodeFunctionData({
            abi: escrowAdapterAbi,
            functionName: "delegate",
            args: ["0x000000000000000000000000000000000000de02"],
          })
        )
      );
      await expect(settle(promise, outcome)).rejects.toThrow(
        outcome === "reject" ? "User rejected" : "connection failure"
      );
      expect(demoState().delegate).toBe(DEMO_WALLET);
    }
  });

  test("removing delegation preserves funds and ownership, applies to new locks, and can be reversed", async () => {
    const originalLocks = structuredClone(demoState().locks);
    const originalBalance = demoState().balance;
    const setDelegate = async (target: Address, outcome: DemoOutcome = "confirm") => {
      const tx = sendDemoTransaction(
        request(
          DEMO_ADAPTER,
          encodeFunctionData({
            abi: escrowAdapterAbi,
            functionName: "delegate",
            args: [target],
          })
        )
      );
      await awaitSuccessfulReceipt(client, await settle(tx, outcome), "Voting choice");
    };
    await expect(setDelegate(zeroAddress, "reject")).rejects.toThrow("User rejected");
    expect(demoState().delegate).toBe(DEMO_WALLET);
    await setDelegate(zeroAddress);
    expect(demoState().delegate).toBe(zeroAddress);
    expect(demoLockVotes(DEMO_WALLET)).toBe(0n);
    expect(demoLockVotes(zeroAddress)).toBe(0n);
    expect(demoState().locks).toEqual(originalLocks);
    expect(demoState().balance).toBe(originalBalance);

    await approve();
    const lock = sendDemoTransaction(
      request(
        PUB_VE_LOCKER_ADDRESS,
        encodeFunctionData({
          abi: votingEscrowAbi,
          functionName: "createLock",
          args: [parseEther("1000")],
        })
      )
    );
    await awaitSuccessfulReceipt(client, await settle(lock), "Lock without delegate");
    expect(demoState().locks.at(-1)?.owner).toBe(DEMO_WALLET);
    expect(demoState().delegate).toBe(zeroAddress);
    expect(demoLockVotes(DEMO_WALLET)).toBe(0n);
    expect(demoLockVotes(zeroAddress)).toBe(0n);

    await setDelegate(DEMO_WALLET);
    expect(demoLockVotes(DEMO_WALLET)).toBe(parseEther("26000"));
    expect(demoState().locks).toHaveLength(originalLocks.length + 1);
  }, 15000);

  test("locking for someone else debits the payer without adding their voting power", async () => {
    await approve();
    const other = "0x000000000000000000000000000000000000de02";
    const promise = sendDemoTransaction(
      request(
        PUB_VE_LOCKER_ADDRESS,
        encodeFunctionData({ abi: votingEscrowAbi, functionName: "createLockFor", args: [parseEther("1000"), other] })
      )
    );
    await awaitSuccessfulReceipt(client, await settle(promise), "Lock");
    expect(demoState().locks.at(-1)?.owner.toLowerCase()).toBe(other);
    expect(demoLockVotes(DEMO_WALLET)).toBe(parseEther("25000"));
    expect(demoState().delegate).toBe(DEMO_WALLET);
  });

  test("the normal wagmi action reaches the local wallet without a write preflight", async () => {
    const config = createConfig({
      chains: [PUB_CHAIN],
      transports: { [PUB_CHAIN.id]: demoTransport() },
      connectors: [demoConnector()],
      multiInjectedProviderDiscovery: false,
    });
    await connect(config, { connector: config.connectors[0] });
    const promise = writeContract(config, {
      account: DEMO_WALLET,
      chainId: PUB_CHAIN.id,
      address: DEMO_ADAPTER,
      abi: escrowAdapterAbi,
      functionName: "delegate",
      args: ["0x000000000000000000000000000000000000de02"],
    });
    for (let i = 0; i < 50 && !getDemoRequest(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
    await awaitSuccessfulReceipt(client, await settle(promise), "Delegation");
    expect(demoLockVotes(DEMO_WALLET)).toBe(0n);
  });

  test("simulated signatures need approval and cannot sign as another account", async () => {
    const promise = signDemoMessage("personal_sign", ["0x1234", DEMO_WALLET]);
    const signature = await settle(promise);
    expect(signature).toBe(`0x${"00".repeat(65)}`);
    await expect(
      signDemoMessage("personal_sign", ["0x1234", "0x000000000000000000000000000000000000de02"])
    ).rejects.toThrow(DEMO_MESSAGE);
  });

  test("withdrawal removes voting power, cancellation restores it, and a ready claim returns funds", async () => {
    const approval = sendDemoTransaction(
      request(
        DEMO_LOCK_NFT,
        encodeFunctionData({ abi: lockNftAbi, functionName: "approve", args: [PUB_VE_LOCKER_ADDRESS, 1n] })
      )
    );
    await awaitSuccessfulReceipt(client, await settle(approval), "NFT approval");
    const begin = sendDemoTransaction(
      request(
        PUB_VE_LOCKER_ADDRESS,
        encodeFunctionData({ abi: votingEscrowAbi, functionName: "beginWithdrawal", args: [1n] })
      )
    );
    await awaitSuccessfulReceipt(client, await settle(begin), "Withdrawal request");
    expect(demoLockVotes(DEMO_WALLET)).toBe(parseEther("10000"));
    const cancel = sendDemoTransaction(
      request(
        PUB_VE_LOCKER_ADDRESS,
        encodeFunctionData({ abi: votingEscrowAbi, functionName: "cancelWithdrawalRequest", args: [1n] })
      )
    );
    await awaitSuccessfulReceipt(client, await settle(cancel), "Cancellation");
    expect(demoLockVotes(DEMO_WALLET)).toBe(parseEther("25000"));
    const withdraw = sendDemoTransaction(
      request(PUB_VE_LOCKER_ADDRESS, encodeFunctionData({ abi: votingEscrowAbi, functionName: "withdraw", args: [4n] }))
    );
    await awaitSuccessfulReceipt(client, await settle(withdraw), "Claim");
    expect(demoState().balance).toBe(parseEther("127500"));
    expect(demoState().locks.some((lock) => lock.id === 4n)).toBe(false);
  }, 10000);

  test("a mature withdrawal can be kept locked without returning FOLD to the wallet", async () => {
    const balance = demoState().balance;
    const cancel = sendDemoTransaction(
      request(
        PUB_VE_LOCKER_ADDRESS,
        encodeFunctionData({ abi: votingEscrowAbi, functionName: "cancelWithdrawalRequest", args: [4n] })
      )
    );
    await awaitSuccessfulReceipt(client, await settle(cancel), "Keep locked");
    const lock = demoState().locks.find((item) => item.id === 4n);
    expect(lock?.exitDate).toBeUndefined();
    expect(lock?.amount).toBe(parseEther("2500"));
    expect(demoState().balance).toBe(balance);
  }, 10000);

  test("a confirmed public vote appears in the normal reads and voter list", async () => {
    const vote = sendDemoTransaction(
      request(
        PUB_TOKEN_VOTING_PLUGIN_ADDRESS,
        encodeFunctionData({ abi: TokenVotingAbi, functionName: "vote", args: [1n, 2, false] })
      )
    );
    await awaitSuccessfulReceipt(client, await settle(vote), "Vote");
    expect(
      await client.readContract({
        address: PUB_TOKEN_VOTING_PLUGIN_ADDRESS,
        abi: TokenVotingAbi,
        functionName: "getVoteOption",
        args: [1n, DEMO_WALLET],
      })
    ).toBe(2);
    const response = demoIndexer("proposals/votes", { proposal_id: "1" }) as {
      votes: { voter: string; vote_option: number }[];
    };
    expect(response.votes.find((vote) => vote.voter === DEMO_WALLET)?.vote_option).toBe(2);
  });

  test("real contract addresses and another sender are refused before a wallet prompt", async () => {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [PUB_VE_LOCKER_ADDRESS, 1n] });
    await expect(sendDemoTransaction(request("0xE172e9B6cfBeeB5593bDcE3f077356FDb33af904", data))).rejects.toThrow(
      DEMO_MESSAGE
    );
    await expect(
      sendDemoTransaction({ ...request(PUB_TOKEN_ADDRESS, data), from: "0x000000000000000000000000000000000000de02" })
    ).rejects.toThrow(DEMO_MESSAGE);
    expect(getDemoRequest()).toBeNull();
  });
});
