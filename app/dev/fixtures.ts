import { DEMO_SENDING_WALLET } from "./demoWalletSession";
import { DEMO_ADAPTER, DEMO_LOCK_NFT, demoState, demoLockVotes, demoTransactionRead } from "./simulation";
import { lockNftAbi } from "@/plugins/velocker/artifacts/lockNft";
import {
  custom,
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  multicall3Abi,
  parseAbi,
  toHex,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import {
  PUB_CHAIN_ID,
  PUB_TOKEN_ADDRESS,
  PUB_INTERFOLD_FEE_TOKEN_ADDRESS,
  PUB_VE_LOCKER_ADDRESS,
  PUB_VOTING_POWER_SOURCE,
  PUB_CRISP_VOTING_PLUGIN_ADDRESS,
  PUB_TOKEN_VOTING_PLUGIN_ADDRESS,
  PUB_SPP_PRIVATE_ADDRESS,
  PUB_SPP_PUBLIC_ADDRESS,
  PUB_CRISP_PROGRAM_ADDRESS,
} from "@/constants";
import { CrispVotingAbi } from "@/plugins/crispVoting/artifacts/CrispVoting";
import { TokenVotingAbi } from "@/plugins/tokenVoting/artifacts/TokenVoting.sol";
import { StagedProposalProcessorAbi } from "@/plugins/spp/artifacts/StagedProposalProcessor";
import { iVotesAbi } from "@/plugins/crispVoting/artifacts/iVotes";
import { votingEscrowAbi } from "@/plugins/velocker/artifacts/votingEscrow";
import { escrowAdapterAbi } from "@/plugins/velocker/artifacts/escrowAdapter";
import { exitQueueAbi } from "@/plugins/velocker/artifacts/exitQueue";
import { DEMO_MESSAGE, DEMO_WALLET, previewAddress, requireLocalPreview } from "./previewMode";
import delegateSnapshot from "./snapshots/delegates-mainnet.json";
import type { CrispSDK } from "@crisp-e3/sdk";
import type { RawAction } from "@/utils/types";

const unit = 10n ** 18n;
const now = BigInt(Math.floor(Date.now() / 1000));
const day = 86400n;
const adapter = DEMO_ADAPTER;
const queue = previewAddress(0xd102);
const lockNft = DEMO_LOCK_NFT;
const interfold = previewAddress(0xd104);
const checkpoints = previewAddress(0xd105);
const otherWallet = previewAddress(0xde02);
const thirdWallet = previewAddress(0xde03);
const zeroHash = `0x${"00".repeat(32)}` as Hex;

/** Executable content belongs to the parent SPP; body actions remain separate. */
export function demoProposalActions(id: bigint, privateVote: boolean): RawAction[] {
  if (id === 2n)
    return [
      { to: otherWallet, value: unit, data: "0x" },
      { to: thirdWallet, value: unit / 2n, data: "0x" },
    ];
  if (id === 1n && privateVote) return [{ to: otherWallet, value: unit / 4n, data: "0x" }];
  return [];
}

/** Synthetic chronology for previewing sorting, not dates from the public snapshot. */
export function demoDelegateFirstSeen() {
  requireLocalPreview();
  return new Map(
    delegateSnapshot.data.delegates.map((entry, index) => [
      entry.address.toLowerCase(),
      25800000n + BigInt((index * 7) % delegateSnapshot.data.delegates.length) * 1000n,
    ])
  );
}

const extraAbi = parseAbi([
  "function checkpoints() view returns (address)",
  "function bonded(address) view returns (uint256)",
  "function getPastTotalSupply(uint256) view returns (uint256)",
  "function getE3Stage(uint256) view returns (uint8)",
  "function getFailureReason(uint256) view returns (uint8)",
  "function checkFailureCondition(uint256) view returns (bool,uint8)",
  "struct E3 { uint256 seed; uint8 committeeSize; uint256 requestBlock; uint256[2] inputWindow; bytes32 encryptionSchemeId; address e3Program; uint8 paramSet; bytes customParams; address decryptionVerifier; address pkVerifier; bytes32 committeePublicKey; bytes32 ciphertextOutput; bytes plaintextOutput; address requester; bytes32 ciphertextCommitment; }",
  "function getE3(uint256) view returns (E3)",
  "function getRoundData(uint256) view returns (uint256,bytes32,uint256,uint8,uint256,uint40)",
  "function censusModeOf(uint256) view returns (uint8)",
]);

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const dates = (id: bigint) =>
  id === 2n ? { start: now - 10n * day, end: now - 5n * day } : { start: now - day, end: now + 4n * day };
const capturedDelegatePowers = new Map(
  delegateSnapshot.data.delegates.map((entry) => [entry.address.toLowerCase(), BigInt(entry.voting_power)])
);
const power = (address: unknown) =>
  same(String(address), DEMO_SENDING_WALLET)
    ? 0n
    : same(String(address), DEMO_WALLET)
      ? demoLockVotes(address) + 25000n * unit
      : (capturedDelegatePowers.get(String(address).toLowerCase()) ?? 25000n * unit);

function stages(isPrivate: boolean) {
  return [
    {
      bodies: [
        {
          addr: isPrivate ? PUB_CRISP_VOTING_PLUGIN_ADDRESS : PUB_TOKEN_VOTING_PLUGIN_ADDRESS,
          isManual: false,
          tryAdvance: false,
          resultType: 1,
        },
      ],
      maxAdvance: 12n * day,
      minAdvance: isPrivate ? 0n : 5n * day,
      voteDuration: 5n * day,
      approvalThreshold: 1,
      vetoThreshold: 0,
      cancelable: false,
      editable: false,
    },
    {
      bodies: [{ addr: otherWallet, isManual: true, tryAdvance: false, resultType: 2 }],
      maxAdvance: 7n * day,
      minAdvance: 0n,
      voteDuration: 2n * day,
      approvalThreshold: 0,
      vetoThreshold: 1,
      cancelable: false,
      editable: false,
    },
  ];
}

function valueFor(name: string, address: Address, args: readonly unknown[] = []): unknown {
  const id = typeof args[0] === "bigint" ? args[0] : 1n;
  const savedProposal = demoState().proposals.find((proposal) => proposal.id === id);
  const { start, end } = savedProposal ?? dates(id);
  const localLock = demoState().locks.find((lock) => lock.id === id);
  const finished = id === 2n;
  switch (name) {
    case "decimals":
      return same(address, PUB_INTERFOLD_FEE_TOKEN_ADDRESS) ? 6 : 18;
    case "symbol":
      return same(address, PUB_INTERFOLD_FEE_TOKEN_ADDRESS) ? "USDC" : "FOLD";
    case "name":
      return "Demo FOLD";
    case "balanceOf":
      return same(address, PUB_TOKEN_ADDRESS)
        ? // The saved demo balance is spendable; vesting FOLD is still held by the token wallet.
          demoState().balance + 15000n * unit
        : same(address, PUB_INTERFOLD_FEE_TOKEN_ADDRESS)
          ? demoState().feeBalance
          : power(args[0]);
    case "getVotes":
    case "getPastVotes":
      return same(address, adapter) ? demoLockVotes(args[0]) : power(args[0]);
    case "totalSupply":
    case "getPastTotalSupply":
      return 1000000n * unit;
    case "delegates":
      return demoState().delegate;
    case "getVotingToken":
      return PUB_VOTING_POWER_SOURCE;
    case "minProposerVotingPower":
      return 10000n * unit;
    case "minVoterVotingPower":
      return 1n * unit;
    case "lockNFT":
      return lockNft;
    case "queue":
      return args.length ? { holder: localLock?.owner ?? zeroAddress, exitDate: localLock?.exitDate ?? 0n } : queue;
    case "ivotesAdapter":
      return adapter;
    case "minDeposit":
      return 100n * unit;
    case "totalLocked":
      return 250000n * unit;
    case "cooldown":
      return 30n * day;
    case "ownedTokens":
      return demoState()
        .locks.filter((lock) =>
          same(String(args[0]), PUB_VE_LOCKER_ADDRESS)
            ? !!lock.exitDate
            : !lock.exitDate && same(lock.owner, String(args[0]))
        )
        .map((lock) => lock.id);
    case "locked":
      return { amount: localLock?.amount ?? 0n, start: localLock?.start ?? 0 };
    case "votingPower":
      return localLock && !localLock.exitDate ? localLock.amount : 0n;
    case "tokenIsDelegated":
      return !!localLock && !localLock.exitDate && demoState().delegate !== zeroAddress;
    case "ticketHolder":
      return localLock?.owner ?? zeroAddress;
    case "canExit":
      return !!localLock?.exitDate && localLock.exitDate <= BigInt(Math.floor(Date.now() / 1000));
    case "checkpoints":
      return checkpoints;
    case "bonded":
      return 10000n * unit;
    case "allowance":
      return demoState().allowances[`${address.toLowerCase()}:${String(args[1]).toLowerCase()}`] ?? 0n;
    case "getApproved":
      return localLock?.approved ?? zeroAddress;
    case "getCurrentConfigIndex":
      return 1n;
    case "getStages":
      return stages(same(address, PUB_SPP_PRIVATE_ADDRESS));
    case "getBodyProposalId":
      return id;
    case "getProposalTally":
      return [0n, 0n];
    case "state":
      return finished ? 2 : 0;
    case "quoteProposalFee":
      return 1500000n;
    case "feeCredits":
      return demoState().feeCredits;
    case "interfold":
      return interfold;
    case "canVote":
      return !finished;
    case "canExecute":
    case "canProposalAdvance":
    case "isMember":
      return false;
    case "isMinParticipationReached":
    case "isSupportThresholdReached":
      return true;
    case "hasVoted":
      return demoState().votes[`public:${id}`] !== undefined;
    case "getVoteOption":
      return demoState().votes[`public:${id}`] ?? 0;
    case "getTally":
      return { counts: finished ? [720000n, 180000n, 100000n] : [0n, 0n, 0n] };
    case "getE3Stage":
      return finished ? 5 : 3;
    case "getFailureReason":
      return 0;
    case "checkFailureCondition":
      return [false, 0];
    case "getE3":
      return {
        seed: 0n,
        committeeSize: 3,
        requestBlock: 26000000n,
        inputWindow: [start, end],
        encryptionSchemeId: zeroHash,
        e3Program: PUB_CRISP_PROGRAM_ADDRESS,
        paramSet: 0,
        customParams: "0x",
        decryptionVerifier: zeroAddress,
        pkVerifier: zeroAddress,
        committeePublicKey: zeroHash,
        ciphertextOutput: zeroHash,
        plaintextOutput: "0x",
        requester: DEMO_WALLET,
        ciphertextCommitment: zeroHash,
      };
    case "getRoundData":
      return [1n, zeroHash, 3n, 1, 0n, 12];
    case "censusModeOf":
      return 2;
    case "getProposal": {
      const targetConfig = { target: zeroAddress, operation: 0 };
      if (same(address, PUB_SPP_PRIVATE_ADDRESS) || same(address, PUB_SPP_PUBLIC_ADDRESS)) {
        return {
          allowFailureMap: 0n,
          lastStageTransition: start,
          currentStage: finished ? 1 : 0,
          stageConfigIndex: 1,
          executed: finished,
          canceled: false,
          creator: DEMO_WALLET,
          actions: demoProposalActions(id, same(address, PUB_SPP_PRIVATE_ADDRESS)),
          targetConfig,
        };
      }
      if (same(address, PUB_CRISP_VOTING_PLUGIN_ADDRESS))
        return {
          executed: finished,
          parameters: {
            numOptions: 3n,
            startDate: start,
            endDate: end,
            snapshotBlock: start - 1n,
            minVotingPower: unit,
            minParticipation: 1n,
            supportThreshold: 50n,
            creditMode: 1,
          },
          tally: { counts: [] },
          actions: [],
          allowFailureMap: 0n,
          targetConfig,
          e3Id: id,
        };
      return [
        !finished,
        finished,
        {
          votingMode: 0,
          supportThreshold: 500000,
          startDate: start,
          endDate: end,
          snapshotTimepoint: start - 1n,
          minVotingPower: 10000n * unit,
        },
        {
          abstain: 2000n * unit + (demoState().votes[`public:${id}`] === 1 ? power(DEMO_WALLET) : 0n),
          yes: 18000n * unit + (demoState().votes[`public:${id}`] === 2 ? power(DEMO_WALLET) : 0n),
          no: 5000n * unit + (demoState().votes[`public:${id}`] === 3 ? power(DEMO_WALLET) : 0n),
        },
        [],
        0n,
        targetConfig,
      ];
    }
    default:
      throw new Error(`No design fixture for ${name}`);
  }
}

/** Resolve against the target's ABI: getProposal has different outputs on each plugin. */
export function demoCall(address: Address, data: Hex): Hex {
  const primary =
    same(address, PUB_SPP_PRIVATE_ADDRESS) || same(address, PUB_SPP_PUBLIC_ADDRESS)
      ? StagedProposalProcessorAbi
      : same(address, PUB_CRISP_VOTING_PLUGIN_ADDRESS)
        ? CrispVotingAbi
        : same(address, PUB_TOKEN_VOTING_PLUGIN_ADDRESS)
          ? TokenVotingAbi
          : undefined;
  const candidates: Abi[] = primary
    ? [primary]
    : [multicall3Abi, votingEscrowAbi, lockNftAbi, exitQueueAbi, escrowAdapterAbi, iVotesAbi, erc20Abi, extraAbi];
  for (const abi of candidates) {
    let decoded;
    try {
      decoded = decodeFunctionData({ abi, data });
    } catch {
      continue;
    }
    const fn = abi.find((entry) => entry.type === "function" && entry.name === decoded.functionName);
    if (
      !fn ||
      fn.type !== "function" ||
      (!["view", "pure"].includes(fn.stateMutability) && decoded.functionName !== "aggregate3")
    ) {
      throw new Error(DEMO_MESSAGE);
    }
    let result;
    if (decoded.functionName === "aggregate3") {
      const calls = decoded.args?.[0] as { target: Address; callData: Hex; allowFailure: boolean }[];
      result = calls.map((call) => {
        try {
          return { success: true, returnData: demoCall(call.target, call.callData) };
        } catch (error) {
          if (!call.allowFailure) throw error;
          return { success: false, returnData: "0x" };
        }
      });
    } else result = valueFor(decoded.functionName, address, decoded.args);
    return encodeFunctionResult({ abi, functionName: decoded.functionName, result });
  }
  throw new Error(`Unknown design-preview call ${data.slice(0, 10)}`);
}

export const demoTransport = () =>
  custom(
    {
      async request({ method, params }: { method: string; params?: unknown }) {
        requireLocalPreview();
        if (method === "eth_chainId") return toHex(PUB_CHAIN_ID);
        if (
          [
            "eth_blockNumber",
            "eth_getTransactionReceipt",
            "eth_getTransactionByHash",
            "eth_getTransactionCount",
            "eth_getBlockByNumber",
            "eth_getBlockByHash",
          ].includes(method)
        )
          return demoTransactionRead(method, params);
        if (method === "eth_getBalance") return toHex(2n * unit);
        if (method === "eth_getCode") return "0x";
        if (method === "eth_getLogs") return [];
        if (method === "eth_call") {
          const [call] = params as [{ to: Address; data: Hex }];
          return demoCall(call.to, call.data);
        }
        throw new Error(DEMO_MESSAGE);
      },
    },
    { retryCount: 0 }
  );

export function demoMetadata(uri: string) {
  if (demoState().metadata[uri]) return demoState().metadata[uri];
  const privateVote = uri.includes("private");
  const finished = uri.endsWith("/2");
  return {
    title: finished
      ? "Community grants — first round"
      : privateVote
        ? "Ciphernode operator support programme"
        : "Governance participation guidelines",
    summary: finished
      ? "Fund an initial round of community-led tools and documentation."
      : "Review the proposed programme, share feedback and help shape the next phase of Interfold.",
    description: finished
      ? "<h2>Proposal</h2><p>Fund community-led tools and documentation through two grants: 1 ETH for tooling and 0.5 ETH for documentation.</p><h2>Next steps</h2><p>Publish milestones and share progress with the community.</p>"
      : privateVote
        ? "<h2>Proposal</h2><p>Allocate 0.25 ETH to support ciphernode operator onboarding, documentation and practical tooling.</p><h2>Next steps</h2><p>Collect operator feedback, agree on milestones and report progress to the community.</p>"
        : "<h2>Proposal</h2><p>Agree on guidelines for clear documentation, community feedback and participation.</p><h2>Next steps</h2><p>Collect feedback and publish the agreed guidelines. This proposal records community support without transferring funds.</p>",
    resources: [{ name: "Documentation", url: "https://docs.theinterfold.com/" }],
    options: ["Yes", "No", "Abstain"],
  };
}

export function demoIndexer(endpoint: string, input: unknown) {
  requireLocalPreview();
  const body = input as { plugin?: string; proposal_id?: string };
  if (endpoint === "proposals") {
    const kind =
      same(body.plugin ?? "", PUB_SPP_PRIVATE_ADDRESS) || same(body.plugin ?? "", PUB_CRISP_VOTING_PLUGIN_ADDRESS)
        ? "private"
        : "public";
    return {
      scanned_from: 0,
      proposals: [
        1n,
        2n,
        ...demoState()
          .proposals.filter((proposal) =>
            same(proposal.plugin, kind === "private" ? PUB_SPP_PRIVATE_ADDRESS : PUB_SPP_PUBLIC_ADDRESS)
          )
          .map((proposal) => proposal.id),
      ]
        .filter((id) => !body.proposal_id || String(id) === body.proposal_id)
        .map((id) => ({
          proposal_id: String(id),
          creator: DEMO_WALLET,
          start_date: Number(demoState().proposals.find((proposal) => proposal.id === id)?.start ?? dates(id).start),
          end_date: Number(demoState().proposals.find((proposal) => proposal.id === id)?.end ?? dates(id).end),
          metadata: toHex(demoState().proposals.find((proposal) => proposal.id === id)?.uri ?? `demo://${kind}/${id}`),
          block: id > 2n ? 26000000 + Number(id) : 25999000 - Number(id),
          transaction_hash: null,
          executed: id === 2n,
          refund_claimed: false,
        })),
    };
  }
  if (endpoint === "proposals/votes")
    return {
      scanned_from: 0,
      votes: [
        ...(demoState().votes[`public:${body.proposal_id}`] === undefined
          ? []
          : [
              {
                voter: DEMO_WALLET,
                vote_option: demoState().votes[`public:${body.proposal_id}`],
                voting_power: String(power(DEMO_WALLET)),
                block: 26000000,
                transaction_hash: null,
              },
            ]),
        {
          voter: otherWallet,
          vote_option: 2,
          voting_power: String(18000n * unit),
          block: 25999980,
          transaction_hash: null,
        },
        {
          voter: thirdWallet,
          vote_option: 3,
          voting_power: String(5000n * unit),
          block: 25999990,
          transaction_hash: null,
        },
      ],
    };
  if (endpoint === "members/delegates")
    return {
      // Public mainnet snapshot; the connected wallet and all signing remain local-only.
      ...delegateSnapshot.data,
      delegates: delegateSnapshot.data.delegates.map((entry) => ({ ...entry })),
    };
  if (endpoint === "rounds/inputs") return { scanned_from: 0, inputs: [] };
  throw new Error(`No design fixture for ${endpoint}`);
}

export function demoSdk(): CrispSDK {
  const methods: Record<string, (...args: any[]) => Promise<unknown>> = {
    async getRoundStateLite(id: bigint) {
      return {
        id: String(id),
        chain_id: String(PUB_CHAIN_ID),
        interfold_address: interfold,
        status: id === 2n ? "Finished" : "Active",
        vote_count: "12",
        start_time: String(dates(id).start),
        duration: String(5n * day),
        expiration: String(dates(id).end),
        committee_public_key: [1, 2, 3],
        emojis: ["🌿", "🌑"],
        token_address: PUB_TOKEN_ADDRESS,
        balance_threshold: "10",
        num_options: "3",
        credit_mode: 1,
        credits: null,
      };
    },
    async getEligibleAddresses() {
      return [DEMO_WALLET, otherWallet, thirdWallet].map((address) => ({
        address,
        balance: String(power(address) / 10n ** 17n),
      }));
    },
    async getTokenHolderHashes() {
      return [];
    },
    async getRoundTokenDetails(id: bigint) {
      return { tokenAddress: PUB_TOKEN_ADDRESS, snapshotBlock: dates(id).start - 1n, threshold: unit };
    },
    async getOnChainRoundData() {
      return { merkleRoot: 0n, numOptions: 3n, creditMode: 1 };
    },
  };
  return new Proxy({} as CrispSDK, {
    get(_target, key) {
      return async (...args: unknown[]) => {
        requireLocalPreview();
        if (typeof key === "string" && methods[key]) return methods[key](...args);
        throw new Error(DEMO_MESSAGE);
      };
    },
  });
}
