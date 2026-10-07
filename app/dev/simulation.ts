import {
  decodeFunctionData,
  erc20Abi,
  formatUnits,
  fromHex,
  isAddress,
  keccak256,
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
  PUB_SPP_PUBLIC_ADDRESS,
  PUB_SPP_PRIVATE_ADDRESS,
  PUB_TOKEN_VOTING_PLUGIN_ADDRESS,
  PUB_CRISP_VOTING_PLUGIN_ADDRESS,
} from "@/constants";
import { votingEscrowAbi } from "@/plugins/velocker/artifacts/votingEscrow";
import { lockNftAbi } from "@/plugins/velocker/artifacts/lockNft";
import { escrowAdapterAbi } from "@/plugins/velocker/artifacts/escrowAdapter";
import { TokenVotingAbi } from "@/plugins/tokenVoting/artifacts/TokenVoting.sol";
import { CrispVotingAbi } from "@/plugins/crispVoting/artifacts/CrispVoting";
import { StagedProposalProcessorAbi } from "@/plugins/spp/artifacts/StagedProposalProcessor";
import { DEMO_WALLET, DEMO_MESSAGE, previewAddress, requireLocalPreview } from "./previewMode";
import { isDemoWalletDisconnected } from "./demoWalletSession";

export const DEMO_ADAPTER = previewAddress(0xd101);
export const DEMO_LOCK_NFT = previewAddress(0xd103);
const unit = 10n ** 18n;
const day = 86400n;
const timestamp = () => BigInt(Math.floor(Date.now() / 1000));
const storageKey = "interfold-demo-simulation-v1";
export const sameAddress = (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase();
type DemoLock = { id: bigint; amount: bigint; owner: Address; start: number; exitDate?: bigint; approved?: Address };
type DemoProposal = { id: bigint; plugin: Address; uri: string; start: bigint; end: bigint };
type DemoState = {
  balance: bigint;
  feeBalance: bigint;
  feeCredits: bigint;
  delegate: Address;
  locks: DemoLock[];
  allowances: Record<string, bigint>;
  votes: Record<string, number>;
  privateVoters: Record<string, string[]>;
  metadata: Record<string, unknown>;
  proposals: DemoProposal[];
};
function initialState(): DemoState {
  const now = timestamp();
  return {
    balance: 125000n * unit,
    feeBalance: 50000000n,
    feeCredits: 10000000n,
    delegate: DEMO_WALLET,
    allowances: {},
    votes: {},
    privateVoters: {},
    metadata: {},
    proposals: [],
    locks: [
      { id: 1n, amount: 15000n * unit, owner: DEMO_WALLET, start: Number(now - 45n * day) },
      { id: 2n, amount: 10000n * unit, owner: DEMO_WALLET, start: Number(now - 45n * day) },
      { id: 3n, amount: 2500n * unit, owner: DEMO_WALLET, start: Number(now - 45n * day), exitDate: now + 12n * day },
      { id: 4n, amount: 2500n * unit, owner: DEMO_WALLET, start: Number(now - 45n * day), exitDate: now - day },
    ],
  };
}
let state: DemoState | undefined;
/** Keep existing local balances, locks and choices when upgrading the example address. */
export function restoreDemoState(snapshot: string): DemoState {
  const restored: DemoState = JSON.parse(snapshot, (_key, value) =>
    value && typeof value === "object" && "demoBigInt" in value ? BigInt(value.demoBigInt) : value
  );
  const previousWallet = "0x000000000000000000000000000000000000de01";
  if (sameAddress(restored.delegate, previousWallet)) restored.delegate = DEMO_WALLET;
  restored.locks = restored.locks.map((lock) =>
    sameAddress(lock.owner, previousWallet) ? { ...lock, owner: DEMO_WALLET } : lock
  );
  restored.privateVoters ??= {};
  return restored;
}
export function demoState() {
  requireLocalPreview();
  if (!state) {
    try {
      const saved = typeof window !== "undefined" ? sessionStorage.getItem(storageKey) : null;
      if (saved) state = restoreDemoState(saved);
    } catch {
      /* An expired or invalid preview snapshot starts fresh. */
    }
    state ??= initialState();
  }
  return state;
}
const dataListeners = new Set<() => void>();
export function subscribeDemoData(listener: () => void) {
  dataListeners.add(listener);
  return () => {
    dataListeners.delete(listener);
  };
}
function persist() {
  if (typeof window !== "undefined")
    sessionStorage.setItem(
      storageKey,
      JSON.stringify(state, (_key, value) => (typeof value === "bigint" ? { demoBigInt: String(value) } : value))
    );
  dataListeners.forEach((listener) => listener());
}
export function resetDemoState() {
  requireLocalPreview();
  if (pending || mining.size) throw new Error("Finish the pending simulation before resetting.");
  state = initialState();
  receipts.clear();
  transactions.clear();
  persist();
}
export function demoLockVotes(account: unknown) {
  if (sameAddress(account, zeroAddress)) return 0n;
  const s = demoState();
  return s.locks
    .filter(
      (lock) => !lock.exitDate && sameAddress(sameAddress(lock.owner, DEMO_WALLET) ? s.delegate : lock.owner, account)
    )
    .reduce((sum, lock) => sum + lock.amount, 0n);
}
export function saveDemoMetadata(body: string) {
  requireLocalPreview();
  const uri = `demo://metadata/${Date.now()}-${Object.keys(demoState().metadata).length}`;
  demoState().metadata[uri] = JSON.parse(body);
  persist();
  return uri;
}

export type DemoOutcome = "confirm" | "reject" | "revert" | "network";
export type DemoRequest = { id: number; title: string; detail: string; kind: "transaction" | "signature" | "ballot" };
let sequence = 0;
let pending: DemoRequest | null = null;
let settle: ((outcome: DemoOutcome) => void) | undefined;
const listeners = new Set<() => void>();
export function subscribeDemoRequest(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const getDemoRequest = () => pending;
export const getServerDemoRequest = () => null;
export function resolveDemoRequest(id: number, outcome: DemoOutcome) {
  requireLocalPreview();
  if (pending?.id !== id || !settle) return;
  const resolve = settle;
  settle = undefined;
  pending = null;
  listeners.forEach((listener) => listener());
  resolve(outcome);
}
function demoError(message: string, code: number) {
  return Object.assign(new Error(message), { code, shortMessage: message });
}
async function requestOutcome(request: Omit<DemoRequest, "id">) {
  requireLocalPreview();
  if (pending) throw demoError("Another demo wallet request is waiting.", -32002);
  const outcome = await new Promise<DemoOutcome>((resolve) => {
    pending = { ...request, id: ++sequence };
    settle = resolve;
    listeners.forEach((listener) => listener());
  });
  if (outcome === "reject") throw demoError("User rejected the request.", 4001);
  if (outcome === "network") throw demoError("Simulated connection failure. Try again.", 4900);
  return outcome;
}

const abis = new Map<string, Abi>([
  [PUB_TOKEN_ADDRESS.toLowerCase(), erc20Abi],
  [PUB_INTERFOLD_FEE_TOKEN_ADDRESS.toLowerCase(), erc20Abi],
  [PUB_VE_LOCKER_ADDRESS.toLowerCase(), votingEscrowAbi],
  [DEMO_LOCK_NFT.toLowerCase(), lockNftAbi],
  [DEMO_ADAPTER.toLowerCase(), escrowAdapterAbi],
  [PUB_TOKEN_VOTING_PLUGIN_ADDRESS.toLowerCase(), TokenVotingAbi],
  [PUB_CRISP_VOTING_PLUGIN_ADDRESS.toLowerCase(), CrispVotingAbi],
  [PUB_SPP_PUBLIC_ADDRESS.toLowerCase(), StagedProposalProcessorAbi],
  [PUB_SPP_PRIVATE_ADDRESS.toLowerCase(), StagedProposalProcessorAbi],
]);
type TransactionInput = { from: Address; to: Address; data: Hex; value?: Hex; chainId?: Hex };
function operation(tx: TransactionInput) {
  requireLocalPreview();
  if (
    !sameAddress(tx.from, DEMO_WALLET) ||
    (tx.chainId && BigInt(tx.chainId) !== BigInt(PUB_CHAIN_ID)) ||
    BigInt(tx.value ?? 0) !== 0n
  )
    throw new Error(DEMO_MESSAGE);
  const abi = abis.get(tx.to?.toLowerCase());
  if (!abi) throw new Error(DEMO_MESSAGE);
  const decoded = decodeFunctionData({ abi, data: tx.data });
  const args = decoded.args ?? [];
  const s = demoState();
  const amount = (args[0] ?? 0n) as bigint;
  const lock = s.locks.find((item) => item.id === amount);
  const owned = () => {
    if (!lock || !sameAddress(lock.owner, DEMO_WALLET)) throw new Error("This demo wallet does not own the lock.");
    return lock;
  };
  const fold = (value: bigint) => `${formatUnits(value, 18)} FOLD`;
  const key = `${tx.to.toLowerCase()}:${String(args[0]).toLowerCase()}`;
  if (decoded.functionName === "approve") {
    if (![PUB_VE_LOCKER_ADDRESS, PUB_CRISP_VOTING_PLUGIN_ADDRESS].some((address) => sameAddress(address, args[0])))
      throw new Error(DEMO_MESSAGE);
    return {
      title: sameAddress(tx.to, DEMO_LOCK_NFT) ? "Approve lock withdrawal" : "Approve token spending",
      detail: sameAddress(tx.to, DEMO_LOCK_NFT)
        ? `Lock #${String(args[1])}`
        : `${formatUnits(args[1] as bigint, sameAddress(tx.to, PUB_TOKEN_ADDRESS) ? 18 : 6)} ${sameAddress(tx.to, PUB_TOKEN_ADDRESS) ? "FOLD" : "USDC"}`,
      apply: () => {
        if (sameAddress(tx.to, DEMO_LOCK_NFT)) {
          const item = s.locks.find((item) => item.id === args[1] && sameAddress(item.owner, DEMO_WALLET));
          if (!item) throw new Error("Unknown demo lock.");
          item.approved = args[0] as Address;
        } else s.allowances[key] = args[1] as bigint;
      },
    };
  }
  if (sameAddress(tx.to, PUB_VE_LOCKER_ADDRESS)) {
    if (decoded.functionName === "createLock" || decoded.functionName === "createLockFor") {
      const owner = (args[1] ?? DEMO_WALLET) as Address;
      const approvalKey = `${PUB_TOKEN_ADDRESS.toLowerCase()}:${PUB_VE_LOCKER_ADDRESS.toLowerCase()}`;
      if (
        amount < 100n * unit ||
        amount > s.balance ||
        !isAddress(owner) ||
        sameAddress(owner, zeroAddress) ||
        (s.allowances[approvalKey] ?? 0n) < amount
      )
        throw new Error("Check the demo balance, amount and approval.");
      return {
        title: "Create lock",
        detail: `${fold(amount)} · ${sameAddress(owner, DEMO_WALLET) ? "Your wallet" : owner}`,
        apply: () => {
          s.balance -= amount;
          s.allowances[approvalKey] -= amount;
          s.locks.push({
            id: s.locks.reduce((max, item) => (item.id > max ? item.id : max), 4n) + 1n,
            amount,
            owner,
            start: Number(timestamp()),
          });
        },
      };
    }
    if (decoded.functionName === "beginWithdrawal") {
      const item = owned();
      if (item.exitDate || !sameAddress(item.approved, PUB_VE_LOCKER_ADDRESS))
        throw new Error("This lock cannot start withdrawal yet.");
      return {
        title: "Start withdrawal",
        detail: `${fold(item.amount)} · 30-day cooldown`,
        apply: () => {
          item.exitDate = timestamp() + 30n * day;
        },
      };
    }
    if (decoded.functionName === "cancelWithdrawalRequest") {
      const item = owned();
      if (!item.exitDate) throw new Error("No withdrawal to cancel.");
      return {
        title: "Cancel withdrawal",
        detail: fold(item.amount),
        apply: () => {
          delete item.exitDate;
        },
      };
    }
    if (decoded.functionName === "withdraw") {
      const item = owned();
      if (!item.exitDate || item.exitDate > timestamp()) throw new Error("The demo cooldown has not ended.");
      return {
        title: "Withdraw FOLD",
        detail: fold(item.amount),
        apply: () => {
          s.balance += item.amount;
          s.locks = s.locks.filter((entry) => entry !== item);
        },
      };
    }
  }
  if (sameAddress(tx.to, DEMO_ADAPTER) && decoded.functionName === "delegate") {
    const target = args[0] as Address;
    if (!isAddress(target)) throw new Error("Choose a valid delegate.");
    return {
      title: sameAddress(target, zeroAddress) ? "Remove voting delegate" : "Delegate voting power",
      detail: sameAddress(target, zeroAddress) ? "All your locks will have no voting power." : target,
      apply: () => {
        s.delegate = target;
      },
    };
  }
  if (sameAddress(tx.to, PUB_TOKEN_VOTING_PLUGIN_ADDRESS) && decoded.functionName === "vote") {
    const option = Number(args[1]);
    if (![1, 2, 3].includes(option) || amount === 2n) throw new Error("This demo proposal cannot accept that vote.");
    return {
      title: "Submit vote",
      detail: `${["", "Abstain", "Yes", "No"][option]} · Proposal #${amount}`,
      apply: () => {
        s.votes[`public:${amount}`] = option;
      },
    };
  }
  if (
    [PUB_SPP_PUBLIC_ADDRESS, PUB_SPP_PRIVATE_ADDRESS].some((address) => sameAddress(address, tx.to)) &&
    decoded.functionName === "createProposal"
  ) {
    const uri = fromHex(args[0] as Hex, "string");
    if (!s.metadata[uri]) throw new Error("Save the demo proposal details first.");
    return {
      title: "Create proposal",
      detail: String((s.metadata[uri] as { title?: string }).title ?? "New proposal"),
      apply: () => {
        const id = BigInt(3 + s.proposals.length);
        const start = timestamp();
        s.proposals.push({ id, plugin: tx.to, uri, start, end: start + 5n * day });
      },
    };
  }
  if (sameAddress(tx.to, PUB_CRISP_VOTING_PLUGIN_ADDRESS) && ["deposit", "withdraw"].includes(decoded.functionName)) {
    const deposit = decoded.functionName === "deposit";
    if (amount <= 0n || amount > (deposit ? s.feeBalance : s.feeCredits))
      throw new Error("Insufficient demo fee balance.");
    return {
      title: deposit ? "Deposit fee credit" : "Withdraw fee credit",
      detail: `${formatUnits(amount, 6)} USDC`,
      apply: () => {
        s.feeBalance += deposit ? -amount : amount;
        s.feeCredits += deposit ? amount : -amount;
      },
    };
  }
  throw new Error("This action is not available in the local simulator yet.");
}
let block = 26000000n;
const blockHash = (n: bigint) => toHex(n, { size: 32 });
const receipts = new Map<Hex, Record<string, unknown>>();
const transactions = new Map<Hex, Record<string, unknown>>();
const mining = new Set<Hex>();
export async function sendDemoTransaction(tx: TransactionInput) {
  const op = operation(tx);
  const outcome = await requestOutcome({ title: op.title, detail: op.detail, kind: "transaction" });
  const hash = keccak256(toHex(`interfold-local-${Date.now()}-${++sequence}`));
  mining.add(hash);
  transactions.set(hash, {
    ...tx,
    hash,
    input: tx.data,
    nonce: toHex(sequence),
    value: "0x0",
    gas: "0x2dc6c0",
    gasPrice: "0x1",
    blockHash: null,
    blockNumber: null,
    transactionIndex: null,
    type: "0x0",
    v: "0x1b",
    r: blockHash(1n),
    s: blockHash(1n),
  });
  setTimeout(() => {
    let success = outcome === "confirm";
    if (success) {
      try {
        op.apply();
        persist();
      } catch {
        success = false;
      }
    }
    block += 1n;
    const common = { blockHash: blockHash(block), blockNumber: toHex(block), transactionIndex: "0x0" };
    transactions.set(hash, { ...transactions.get(hash), ...common });
    receipts.set(hash, {
      ...common,
      transactionHash: hash,
      from: tx.from,
      to: tx.to,
      contractAddress: null,
      cumulativeGasUsed: "0x5208",
      gasUsed: "0x5208",
      effectiveGasPrice: "0x1",
      logs: [],
      logsBloom: `0x${"00".repeat(256)}`,
      status: success ? "0x1" : "0x0",
      type: "0x0",
    });
    mining.delete(hash);
  }, 900);
  return hash;
}
export function demoTransactionRead(method: string, params?: unknown) {
  requireLocalPreview();
  const hash = (params as Hex[] | undefined)?.[0];
  if (method === "eth_blockNumber") return toHex(block);
  if (method === "eth_getBlockByNumber" || method === "eth_getBlockByHash") {
    const number = method === "eth_getBlockByNumber" && hash && hash !== ("latest" as Hex) ? BigInt(hash) : block;
    return {
      number: toHex(number),
      hash: blockHash(number),
      parentHash: blockHash(number - 1n),
      timestamp: toHex(timestamp()),
      nonce: "0x0000000000000000",
      difficulty: "0x0",
      totalDifficulty: "0x0",
      size: "0x1",
      gasLimit: "0x1c9c380",
      gasUsed: "0x5208",
      baseFeePerGas: "0x1",
      extraData: "0x",
      miner: zeroAddress,
      uncles: [],
      transactions: [...transactions.values()].filter((tx) => tx.blockNumber === toHex(number)),
    };
  }
  if (method === "eth_getTransactionReceipt") return hash ? (receipts.get(hash) ?? null) : null;
  if (method === "eth_getTransactionByHash") return hash ? (transactions.get(hash) ?? null) : null;
  if (method === "eth_getTransactionCount") return toHex(sequence);
  throw new Error(DEMO_MESSAGE);
}
export async function signDemoMessage(method: string, params: unknown) {
  requireLocalPreview();
  const values = Array.isArray(params) ? params : [];
  if (!values.some((value) => typeof value === "string" && sameAddress(value, DEMO_WALLET)))
    throw new Error(DEMO_MESSAGE);
  const outcome = await requestOutcome({
    title: "Sign message",
    detail: method.includes("TypedData") ? "Typed data · local simulation" : "Message · local simulation",
    kind: "signature",
  });
  if (outcome === "revert") throw new Error("The simulated signature failed. Try again.");
  // Deliberately not a valid cryptographic signature. No key is generated or accessed.
  return `0x${"00".repeat(65)}` as Hex;
}
/** Private participation is attributed to the signer, never the wallet sending a mask or ballot. */
export function demoPrivateVoteStatus(id: bigint, voter: string): "confirmed" | "not-voted" | "unknown" {
  const s = demoState();
  const voters = s.privateVoters[String(id)];
  if (voters?.some((account) => sameAddress(account, voter))) return "confirmed";
  // Older preview snapshots did not record a voter, so cannot establish participation per wallet.
  if (voters?.includes("unattributed") || (!voters && s.votes[`private:${id}`] !== undefined)) return "unknown";
  return "not-voted";
}

function recordDemoPrivateVote(id: bigint, option: bigint, voter: string) {
  const s = demoState();
  const voters = s.privateVoters[String(id)] ?? (s.votes[`private:${id}`] === undefined ? [] : ["unattributed"]);
  s.privateVoters[String(id)] = [...new Set([...voters, voter.toLowerCase()])];
  s.votes[`private:${id}`] = Number(option);
}

function requireConnectedDemoWallet() {
  if (isDemoWalletDisconnected()) throw new Error("Connect your wallet before continuing.");
}

export async function simulateDemoBallot(
  id: bigint,
  option: bigint,
  mask: boolean,
  target?: string,
  voter = DEMO_WALLET as string
) {
  requireLocalPreview();
  requireConnectedDemoWallet();
  const outcome = await requestOutcome({
    title: mask ? "Submit masking vote" : "Sign secret ballot",
    detail: `Proposal #${id} · ${mask ? `Mask · ${target ?? "Random eligible voter"}` : (["Yes", "No", "Abstain"][Number(option)] ?? "Vote")}`,
    kind: "ballot",
  });
  await new Promise((resolve) => setTimeout(resolve, 900));
  requireConnectedDemoWallet();
  if (outcome === "revert") throw new Error("The simulated ballot could not be submitted. Try again.");
  if (!mask) recordDemoPrivateVote(id, option, voter);
  persist();
}

export async function prepareDemoBallot(id: bigint, option: bigint) {
  requireLocalPreview();
  requireConnectedDemoWallet();
  const outcome = await requestOutcome({
    title: "Sign secret ballot",
    detail: `Proposal #${id} · ${["Yes", "No", "Abstain"][Number(option)] ?? "Vote"} · send later with another wallet`,
    kind: "signature",
  });
  requireConnectedDemoWallet();
  if (outcome === "revert") throw new Error("The simulated signature failed. Try again.");
}

export async function sendPreparedDemoBallot(id: bigint, option: bigint, voter: Address, sender: Address) {
  requireLocalPreview();
  requireConnectedDemoWallet();
  if (sameAddress(voter, sender)) throw new Error("Switch to a different wallet to send this vote.");
  const outcome = await requestOutcome({
    title: "Send signed ballot",
    detail: `Sending from ${sender}. The vote counts for ${voter}.`,
    kind: "transaction",
  });
  requireConnectedDemoWallet();
  if (outcome === "revert") throw new Error("The simulated transaction reverted. Your signed ballot is saved.");
  recordDemoPrivateVote(id, option, voter);
  persist();
}
