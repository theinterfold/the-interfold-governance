import { decodeAbiParameters, parseAbiParameters, isAddress, isHex, size, type Address, type Hex } from "viem";

export type BallotScope = { chainId: number; plugin: Address; roundId: string };

/**
 * A ballot that one wallet signed and the CRISP server staged and attested, saved for a different
 * wallet to send. Only the attested `publishInput` payload survives reloads. Never persist the
 * clear vote or the raw signature.
 */
export type PreparedBallot = BallotScope & {
  version: 1;
  /** The wallet that signed the ballot, and the slot it counts for. */
  voter: Address;
  /** The CRISP program that verifies the ballot. */
  program: Address;
  /** `InputCommitmentEnvelope`, exactly as the server returned it. Never re-encode it. */
  attestedPayload: Hex;
  createdAt: number;
  /**
   * Milliseconds. The ballot can no longer be sent at this time: the earlier of the input
   * commitment deadline and the attestation expiry. `publishInput` rejects both at or after their
   * timestamp, so the boundary is exclusive.
   */
  expiresAt: number;
  transactionHash?: Hex;
};
export type BallotStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const preparedBallotKey = (scope: BallotScope) =>
  `interfold:prepared-ballot:v1:${scope.chainId}:${scope.plugin.toLowerCase()}:${scope.roundId}`;

/**
 * `InputCommitmentEnvelope`: the seven fields `CRISPProgram.publishInput` decodes. This is NOT the
 * six-field `InputEnvelope` that `encodeSolidityProof` builds and `/voting/broadcast` accepts.
 */
const ATTESTED_ENVELOPE = parseAbiParameters(
  "bytes proof, address slot, bytes32 commitment, bytes32 contentHash, uint40 parentIndexPlusOne, uint64 availabilityAttestationExpiresAt, bytes availabilityAttestation"
);

export type AttestedEnvelope = {
  slot: Address;
  /** Unix seconds. `publishInput` reverts at or after this time. */
  attestationExpiresAt: bigint;
};

/** Reads the signing slot and the attestation expiry. Throws if `payload` is not an attested envelope. */
export function decodeAttestedPayload(payload: Hex): AttestedEnvelope {
  const [, slot, , , , attestationExpiresAt, attestation] = decodeAbiParameters(ATTESTED_ENVELOPE, payload);
  // A relayed six-field envelope has no attestation; the program would revert on it.
  if (size(attestation) === 0) throw new Error("The ballot carries no availability attestation.");
  return { slot, attestationExpiresAt };
}

/**
 * When a prepared ballot stops being sendable, in milliseconds: the earlier of the program's input
 * commitment deadline and the attestation expiry (both Unix seconds, both exclusive).
 */
export function preparedExpiry(attestationExpiresAt: bigint, commitmentDeadline: bigint): number {
  const seconds = attestationExpiresAt < commitmentDeadline ? attestationExpiresAt : commitmentDeadline;
  return Number(seconds * 1000n);
}

/**
 * Checks the payload that the server attested against the wallet that signed, and stamps the
 * expiry. Throws a message fit for the voter.
 */
export function buildPreparedBallot({
  scope,
  voter,
  program,
  attestedPayload,
  commitmentDeadline,
  now = Date.now(),
}: {
  scope: BallotScope;
  voter: Address;
  program: Address;
  attestedPayload: Hex;
  commitmentDeadline: bigint;
  now?: number;
}): PreparedBallot {
  let envelope: AttestedEnvelope;
  try {
    envelope = decodeAttestedPayload(attestedPayload);
  } catch {
    throw new Error("The server returned a ballot that cannot be sent. Prepare it again.");
  }
  // The slot is the wallet whose power the ballot spends. A payload for any other slot is not this voter's.
  if (envelope.slot.toLowerCase() !== voter.toLowerCase()) {
    throw new Error("The server returned a ballot for a different wallet. Prepare it again.");
  }
  const expiresAt = preparedExpiry(envelope.attestationExpiresAt, commitmentDeadline);
  if (expiresAt <= now) throw new Error("There is no time left to send this ballot. Prepare it again.");
  return {
    version: 1,
    chainId: scope.chainId,
    plugin: scope.plugin,
    roundId: scope.roundId,
    voter,
    program,
    attestedPayload,
    createdAt: now,
    expiresAt,
  };
}

export function parsePreparedBallot(raw: string | null, scope: BallotScope, now = Date.now()): PreparedBallot | null {
  if (!raw || raw.length > 4_000_000) return null;
  try {
    const value = JSON.parse(raw) as PreparedBallot;
    if (
      value.version !== 1 ||
      value.chainId !== scope.chainId ||
      value.plugin?.toLowerCase() !== scope.plugin.toLowerCase() ||
      value.roundId !== scope.roundId ||
      !isAddress(value.voter) ||
      !isAddress(value.program) ||
      !isHex(value.attestedPayload, { strict: true }) ||
      value.attestedPayload.length < 4 ||
      value.attestedPayload.length % 2 !== 0 ||
      !Number.isSafeInteger(value.createdAt) ||
      !Number.isSafeInteger(value.expiresAt) ||
      value.createdAt > now ||
      value.expiresAt <= value.createdAt ||
      (value.transactionHash !== undefined && !/^0x[0-9a-fA-F]{64}$/.test(value.transactionHash)) ||
      // Keep a submitted transaction after expiry so it can be checked, never sent a second time.
      (!value.transactionHash && value.expiresAt <= now)
    )
      return null;
    // The signer is whoever the envelope names as its slot, and nobody else may be recorded as the voter.
    const { slot, attestationExpiresAt } = decodeAttestedPayload(value.attestedPayload);
    if (slot.toLowerCase() !== value.voter.toLowerCase()) return null;
    // A stored expiry can only be earlier than the attestation's, never later.
    if (BigInt(value.expiresAt) > attestationExpiresAt * 1000n) return null;
    // Explicit fields only: unrecognised fields (including clear votes/signatures) never propagate.
    return {
      version: 1,
      chainId: scope.chainId,
      plugin: scope.plugin,
      roundId: scope.roundId,
      voter: value.voter,
      program: value.program,
      attestedPayload: value.attestedPayload,
      createdAt: value.createdAt,
      expiresAt: value.expiresAt,
      ...(value.transactionHash ? { transactionHash: value.transactionHash } : {}),
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
