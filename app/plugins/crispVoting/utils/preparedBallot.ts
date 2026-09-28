import { decodeAbiParameters, parseAbiParameters, isAddress, isHex, type Address, type Hex } from "viem";

export type BallotScope = { chainId: number; plugin: Address; roundId: string; demo: boolean };
/** Only the final encrypted proof survives reloads. Never persist the clear vote or raw signature. */
export type PreparedBallot = BallotScope & {
  version: 1;
  voter: Address;
  program: Address;
  encodedProof: Hex;
  createdAt: number;
  expiresAt: number;
  transactionHash?: Hex;
  /** Only local, fictitious ballots need a choice for the simulator. Rejected in live mode. */
  demoOption?: number;
};
export type BallotStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const preparedBallotKey = (scope: BallotScope) =>
  `interfold:prepared-ballot:v1:${scope.demo ? "demo" : "live"}:${scope.chainId}:${scope.plugin.toLowerCase()}:${scope.roundId}`;

export function parsePreparedBallot(raw: string | null, scope: BallotScope, now = Date.now()): PreparedBallot | null {
  if (!raw || raw.length > 4_000_000) return null;
  try {
    const value = JSON.parse(raw) as PreparedBallot;
    if (
      value.version !== 1 ||
      value.chainId !== scope.chainId ||
      value.demo !== scope.demo ||
      value.plugin?.toLowerCase() !== scope.plugin.toLowerCase() ||
      value.roundId !== scope.roundId ||
      !isAddress(value.voter) ||
      !isAddress(value.program) ||
      !isHex(value.encodedProof, { strict: true }) ||
      value.encodedProof.length < 4 ||
      value.encodedProof.length % 2 !== 0 ||
      !Number.isSafeInteger(value.createdAt) ||
      !Number.isSafeInteger(value.expiresAt) ||
      value.createdAt > now ||
      value.expiresAt <= value.createdAt ||
      (value.transactionHash !== undefined && !/^0x[0-9a-fA-F]{64}$/.test(value.transactionHash)) ||
      // Keep a submitted transaction after expiry so it can be checked, never sent a second time.
      (!value.transactionHash && value.expiresAt <= now) ||
      (scope.demo ? !Number.isInteger(value.demoOption) || value.demoOption! < 0 : value.demoOption !== undefined)
    )
      return null;
    if (!scope.demo) {
      // Match SDK 0.18's publishInput tuple; do not label another slot as the signing wallet.
      const [, slot] = decodeAbiParameters(
        parseAbiParameters("bytes, address, bytes32, bytes, uint40"),
        value.encodedProof
      );
      if (slot.toLowerCase() !== value.voter.toLowerCase()) return null;
    }
    // Explicit fields only: unrecognised fields (including clear votes/signatures) never propagate.
    return {
      version: 1,
      chainId: scope.chainId,
      plugin: scope.plugin,
      roundId: scope.roundId,
      demo: scope.demo,
      voter: value.voter,
      program: value.program,
      encodedProof: value.encodedProof,
      createdAt: value.createdAt,
      expiresAt: value.expiresAt,
      ...(value.transactionHash ? { transactionHash: value.transactionHash } : {}),
      ...(scope.demo ? { demoOption: value.demoOption } : {}),
    };
  } catch {
    return null;
  }
}

export function readPreparedBallot(storage: BallotStorage, scope: BallotScope, now = Date.now()) {
  const key = preparedBallotKey(scope);
  const raw = storage.getItem(key);
  const ballot = parsePreparedBallot(raw, scope, now);
  if (raw && !ballot) storage.removeItem(key);
  return ballot;
}

export function savePreparedBallot(storage: BallotStorage, ballot: PreparedBallot) {
  const checked = parsePreparedBallot(JSON.stringify(ballot), ballot);
  if (!checked) throw new Error("The prepared ballot is invalid or has expired. Prepare it again.");
  try {
    storage.setItem(preparedBallotKey(ballot), JSON.stringify(checked));
  } catch {
    throw new Error(
      "Your browser could not save the encrypted ballot. Enable browser storage before changing wallets."
    );
  }
}

export function preparedSenderError(ballot: PreparedBallot, account?: string, chainId?: number, now = Date.now()) {
  if (ballot.transactionHash) return undefined;
  if (ballot.expiresAt <= now) return "Voting has closed. Discard this ballot.";
  if (!account) return "Connect the wallet you want to send from.";
  if (chainId !== ballot.chainId) return "Switch the sending wallet to the voting network.";
  if (account.toLowerCase() === ballot.voter.toLowerCase()) return "Switch to a different wallet to send this vote.";
  return undefined;
}
