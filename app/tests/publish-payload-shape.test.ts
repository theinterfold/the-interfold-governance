import { expect, test, describe } from "bun:test";
import { encodeAbiParameters, parseAbiParameters, decodeAbiParameters } from "viem";

/**
 * INV: the two CRISP input envelopes are DIFFERENT structs and must not be confused.
 *
 * There are two payloads in the vote flow, and `encodeSolidityProof` builds the first one:
 *
 *   1. `InputEnvelope` — six fields, `... uint40 parentIndexPlusOne, bytes availabilityProof`.
 *      This is what the client POSTs to `/voting/broadcast`. `encodeSolidityProof` is CORRECT
 *      for this and needs no change.
 *
 *   2. `InputCommitmentEnvelope` — seven fields, `... uint40 parentIndexPlusOne,
 *      uint64 availabilityAttestationExpiresAt, bytes availabilityAttestation`. This is what
 *      `CRISPProgram.publishInput` decodes. The last two fields are minted SERVER-side: the
 *      expiry, and an ECDSA signature over it from `inputAvailabilitySigner`. A client cannot
 *      produce either.
 *
 * So direct submission works — the voter sends the transaction from their own wallet — but the
 * payload must be the server's `encoded_proof`, returned by `/voting/broadcast` once the input is
 * staged. Re-encoding locally and submitting that is the bug this file guards against.
 *
 * Both structs are declared in `server/src/server/data_availability.rs` (`sol!` block, ~:173).
 */

/** `InputEnvelope` — the POST body. What `encodeSolidityProof` emits. */
const SERVER_INPUT_TUPLE = "bytes, address, bytes32, bytes32, uint40, bytes";

/** `InputCommitmentEnvelope` — what `publishInput` decodes. */
const ONCHAIN_COMMITMENT_TUPLE = "bytes, address, bytes32, bytes32, uint40, uint64, bytes";

const PROOF = "0xdeadbeef" as const;
const SLOT = "0x8837e47c4Bb520ADE83AAB761C3B60679443af1B" as const;
const COMMITMENT = `0x${"11".repeat(32)}` as const;
const VOTE_HASH = `0x${"22".repeat(32)}` as const;
const PARENT_INDEX = 1;
const AVAILABILITY_PROOF = "0xabcdef" as const;
/** Measured from the live Sepolia round: `availabilityFinalizationWindow()` is 10800s. */
const EXPIRES_AT = 1789144320n;
/** 65-byte ECDSA signature, the shape `inputAvailabilitySigner` returns. */
const ATTESTATION = `0x${"33".repeat(65)}` as const;

const encodeServerInput = () =>
  encodeAbiParameters(parseAbiParameters(SERVER_INPUT_TUPLE), [
    PROOF,
    SLOT,
    COMMITMENT,
    VOTE_HASH,
    PARENT_INDEX,
    AVAILABILITY_PROOF,
  ]);

const encodeOnchainCommitment = () =>
  encodeAbiParameters(parseAbiParameters(ONCHAIN_COMMITMENT_TUPLE), [
    PROOF,
    SLOT,
    COMMITMENT,
    VOTE_HASH,
    PARENT_INDEX,
    EXPIRES_AT,
    ATTESTATION,
  ]);

describe("CRISP input envelopes (INV: POST body and publishInput payload are different structs)", () => {
  test("the server input envelope has six fields, the on-chain commitment seven", () => {
    expect(SERVER_INPUT_TUPLE.split(",").length).toBe(6);
    expect(ONCHAIN_COMMITMENT_TUPLE.split(",").length).toBe(7);
  });

  /**
   * The regression: passing the POST body to `publishInput`. It is NOT interchangeable, and the
   * failure is silent at the ABI layer because both structs end in a dynamic `bytes`.
   */
  test("the server input envelope is not a valid publishInput payload", () => {
    expect(encodeServerInput()).not.toEqual(encodeOnchainCommitment());

    let recoveredTheRealExpiry: boolean;
    try {
      const decoded = decodeAbiParameters(parseAbiParameters(ONCHAIN_COMMITMENT_TUPLE), encodeServerInput());
      recoveredTheRealExpiry = decoded[5] === EXPIRES_AT;
    } catch {
      recoveredTheRealExpiry = false;
    }
    // Either it throws, or it decodes to something that is not the attested expiry. Never correct.
    expect(recoveredTheRealExpiry).toBe(false);
  });

  test("the attested commitment round-trips with both server-minted fields intact", () => {
    const decoded = decodeAbiParameters(parseAbiParameters(ONCHAIN_COMMITMENT_TUPLE), encodeOnchainCommitment());
    expect(decoded[4]).toBe(PARENT_INDEX);
    expect(decoded[5]).toBe(EXPIRES_AT);
    expect(decoded[6]).toBe(ATTESTATION);
  });

  /**
   * The attestation is a signature, so it cannot be derived, defaulted, or zero-filled. A client
   * that "completes" the six-field envelope itself produces a payload that fails
   * `_verifyInputAvailabilityAttestation` on-chain.
   */
  test("a client-completed envelope with a zero attestation is still not the server's payload", () => {
    const forged = encodeAbiParameters(parseAbiParameters(ONCHAIN_COMMITMENT_TUPLE), [
      PROOF,
      SLOT,
      COMMITMENT,
      VOTE_HASH,
      PARENT_INDEX,
      EXPIRES_AT,
      `0x${"00".repeat(65)}`,
    ]);
    expect(forged).not.toEqual(encodeOnchainCommitment());
  });

  /**
   * Direct submission is the mainnet route, so the distinguishing field must stay present. If the
   * SDK ever grows a seven-field encoder these names are what to check it against.
   */
  test("only the on-chain commitment carries the attestation expiry", () => {
    expect(SERVER_INPUT_TUPLE).not.toContain("uint64");
    expect(ONCHAIN_COMMITMENT_TUPLE).toContain("uint64");
  });
});
