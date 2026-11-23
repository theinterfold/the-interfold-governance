import type { TypedDataSigner } from "@crisp-e3/aztec";
import type { Vote } from "@crisp-e3/sdk";
import type { Address, Hex } from "viem";
import { PUB_CRISP_SERVER_URL } from "@/constants";
import type { VotingStep } from "../types";
import { publicClient } from "../client";
import { slotsToEnroll, type BallotNeed } from "./enrollmentPlan";
import { loadAztecDeployment } from "./round";
import { localStorageAdapter, outOfStagingPasses, stagingCounter, stagingCounterKey } from "./secrets";
import { getAztecSession, getAztecVotes } from "./session";
import { classifyStagingError, retryingStagingFetch } from "./stagingRetry";

type L1Client = Parameters<typeof import("@crisp-e3/aztec").weightOf>[0];

/** What the wallet signs during a cast: the one-off staging key of the round, and the ballot itself. */
export type SignKind = "staging-key" | "ballot";

export type AztecBallotRequest = {
  program: Address;
  e3Id: bigint;
  /** The Ethereum chain the EIP-712 domain names (the program's chain). */
  l1ChainId: number;
  /** The connected wallet: its slot holds the staging key, for a vote and a mask alike. */
  own: Address;
  /** The slot written: `own` for a vote, the masked slot for a mask. */
  slot: Address;
  /** Omit for a mask. */
  vote?: Vote;
  numOptions: number;
  /** The committee key, already checked against the round's on-chain commitment. */
  committeePublicKey: Uint8Array;
  /** Signs EIP-712 typed data with the wallet; the caller puts the wallet on the voting chain and prompts the voter. */
  sign: (kind: SignKind, typedData: Parameters<TypedDataSigner>[0]) => Promise<Hex>;
  onProgress: (step: VotingStep, message: string) => void;
};

const server = () => PUB_CRISP_SERVER_URL.replace(/\/$/, "");

/**
 * Casts one ballot (a vote or a mask) on Aztec from the voter's embedded account:
 * enrolls the slots it needs, binds the wallet's staging key once per round, builds the ballot and its three base proofs
 * in the browser, has the CRISP server stage the ciphertext, and sends `cast` (the SponsoredFPC pays).
 *
 * @returns The Aztec transaction hash.
 */
export async function castAztecBallot(request: AztecBallotRequest): Promise<string> {
  const { program, e3Id, l1ChainId, own, slot, onProgress } = request;
  const noun = request.vote ? "ballot" : "mask";
  const sdk = await import("@crisp-e3/aztec");

  onProgress("generating_proof", "Connecting to Aztec…");
  const deployment = await loadAztecDeployment(program);
  const session = await getAztecSession(own);
  const votes = await getAztecVotes(session, deployment.contract);
  // The SDK ships its own copy of viem, so its client type is a different (structurally equal) one.
  const l1 = publicClient as unknown as L1Client;

  const config = await sdk.getRemoteInputConfig(server());
  if (config.kind !== "aztec-votes") {
    throw new Error(`The CRISP server at ${server()} runs rounds of kind "${config.kind}", not Aztec votes.`);
  }
  if (config.program.toLowerCase() !== program.toLowerCase()) {
    throw new Error(`The CRISP server serves program ${config.program}, not this round's program ${program}.`);
  }

  // 1. Enrollment: lazy, the first time a ballot needs a slot.
  const need: BallotNeed = request.vote ? { kind: "vote", own } : { kind: "mask", own, target: slot };
  onProgress("generating_proof", "Checking which slots are enrolled on Aztec…");
  const enrolled: Address[] = [];
  for (const candidate of [own, slot]) {
    if (await votes.isSlotEnrolled(e3Id, candidate)) enrolled.push(candidate);
  }
  const missing = slotsToEnroll(need, enrolled);
  if (missing.length > 0) {
    for (const candidate of missing) {
      if ((await sdk.weightOf(l1, program, e3Id, candidate)) === 0n) {
        throw new Error(
          candidate.toLowerCase() === own.toLowerCase()
            ? `Your wallet holds no voting power in this round, so it cannot be enrolled to ${noun === "mask" ? "send masks" : "vote"}.`
            : `${candidate} holds no voting power in this round, so it cannot be masked.`
        );
      }
    }
    onProgress(
      "generating_proof",
      `Enrolling ${missing.length === 1 ? "1 slot" : `${missing.length} slots`} on Aztec. The CRISP server sends the Ethereum transaction and nothing is charged to you; this can take several minutes. Keep this tab open.`
    );
    const { txHash, skipped } = await sdk.requestEnrollment(server(), e3Id, missing);
    for (const { slot: refused, reason } of skipped) {
      // Skipped because someone enrolled it first is fine: its weight is already on its way to Aztec.
      if (!(await sdk.isEnrolled(l1, program, e3Id, refused))) {
        throw new Error(`The CRISP server did not enroll ${refused}: ${reason}.`);
      }
    }
    await sdk.waitForEnrollment({ votes, l1, program, e3Id, slots: missing, l1TxHash: txHash });
  }

  // 2. The staging key: once per round, signed by the wallet; the secret stays in this browser.
  const storage = localStorageAdapter(window.localStorage);
  const secrets = sdk.stagingSecretStore(storage);
  const roundId = sdk.roundIdOf(e3Id);
  let secret = await secrets.get(program, e3Id, own);
  const boundLogs = await votes.logs("StagingKeyBound", { e3Id });
  const alreadyBound =
    secret !== undefined &&
    boundLogs.some(
      (log) => log.slot.toLowerCase() === own.toLowerCase() && log.commitment === sdk.stagingCommitment(secret!, roundId)
    );
  if (!alreadyBound) {
    onProgress("signing", "Creating this round's private staging key. Your wallet signs once; it costs no gas.");
    const bound = await votes.bindStagingKey({
      e3Id,
      slot: own,
      signer: (typedData) => request.sign("staging-key", typedData),
      program,
      l1ChainId,
    });
    secret = bound.secret;
    await secrets.set(program, e3Id, own, secret);
  }

  // 3. The ballot.
  onProgress("generating_proof", `Reading the census and your voting power for the ${noun}…`);
  const [census, stagingTree, credits] = await Promise.all([
    votes.getCensus(e3Id),
    votes.getStagingTree(e3Id),
    sdk.weightOf(l1, program, e3Id, slot),
  ]);
  const ciphertexts = sdk.ciphertextStore(storage);
  const head = await sdk.resolveSlotHead({ client: votes, e3Id, slot, cache: ciphertexts, serverUrl: server() });
  const counters = stagingCounter(window.localStorage);
  const counterKey = stagingCounterKey(program, e3Id, own);
  // The server reads a fresh staging key from Aztec on its own schedule and refuses a pass whose root it has not seen yet,
  // before it takes the pass's tag: that staging is sent again, unchanged, instead of proving the ballot again.
  const stagingFetch = retryingStagingFetch(fetch, {
    onWait: (retry, delayMs) =>
      onProgress(
        "broadcasting",
        `Waiting for the CRISP server to see your staging key on Aztec (try ${retry}, next in ${Math.round(delayMs / 1000)} s). Keep this tab open.`
      ),
  });

  onProgress("generating_proof", `Encrypting and proving the ${noun}. This takes a few minutes; keep this tab open.`);
  let cast;
  try {
    for (let counter = counters.next(counterKey); ; counter++) {
      if (counter >= config.staging_max_requests) throw outOfStagingPasses(config.staging_max_requests);
      try {
        cast = await sdk.buildCast({
          serverUrl: server(),
          program,
          l1ChainId,
          e3Id,
          slot,
          credits,
          numOptions: request.numOptions,
          census,
          committeePublicKey: request.committeePublicKey,
          availabilitySigner: config.signer,
          head,
          ballot: request.vote ? { vote: request.vote, sign: (typedData) => request.sign("ballot", typedData) } : undefined,
          staging: { secret: secret!, stagingTree, maxRequests: config.staging_max_requests, counter },
          fetchImpl: stagingFetch,
          onProgress: ({ stage, index, total }) =>
            onProgress("generating_proof", `Proving the ${noun}: ${stage} (${index + 1} of ${total})`),
        });
        counters.spend(counterKey, counter);
        break;
      } catch (error) {
        // A pass the server already holds is spent: count it and try the next one. Any other refusal leaves it unspent.
        if (classifyStagingError(error) !== "tag-used") throw error;
        counters.spend(counterKey, counter);
      }
    }
  } finally {
    await sdk.destroyVotesStagingPassProver();
  }

  onProgress("broadcasting", `Sending the ${noun} to Aztec. Proving the transaction takes about a minute; keep this tab open.`);
  const sent = await votes.cast(cast);
  // From here the slot's head is this ciphertext, whatever happens next.
  await ciphertexts.set(e3Id, cast.encryptedVote);
  return sent.txHash;
}
