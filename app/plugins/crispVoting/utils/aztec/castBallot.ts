import type { TypedDataSigner } from "@crisp-e3/aztec";
import type { Vote } from "@crisp-e3/sdk";
import type { Address, Hex } from "viem";
import { PUB_CRISP_SERVER_URL } from "@/constants";
import type { VotingStep } from "../types";
import { publicClient } from "../client";
import { loadAztecDeployment } from "./round";
import { getAztecSession } from "./session";
import { isTagUsed, retryingStagingFetch } from "./stagingRetry";

type L1Client = Parameters<typeof import("@crisp-e3/aztec").isEnrolled>[0];

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
  /** The slot's weight in the round (`weightOf`): the credits of the ballot. */
  credits: bigint;
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
  const votes = await sdk.CrispAztecVotes.connect(session, deployment.contract);
  // The SDK ships its own copy of viem, so its client type is a different (structurally equal) one.
  const l1 = publicClient as unknown as L1Client;

  const config = await sdk.getRemoteInputConfig(server());
  if (config.kind !== "aztec-votes") {
    throw new Error(`The CRISP server at ${server()} runs rounds of kind "${config.kind}", not Aztec votes.`);
  }
  if (config.program.toLowerCase() !== program.toLowerCase()) {
    throw new Error(`The CRISP server serves program ${config.program}, not this round's program ${program}.`);
  }

  // 1. Enrollment: lazy, the first time a ballot needs a slot. A vote needs the voter's own slot (the staging pass proves
  // it in the census); a mask also needs its target (the proof reads the target's census leaf).
  onProgress("generating_proof", "Checking which slots are enrolled on Aztec…");
  const missing: Address[] = [];
  for (const candidate of own.toLowerCase() === slot.toLowerCase() ? [own] : [own, slot]) {
    if (!(await votes.isSlotEnrolled(e3Id, candidate))) missing.push(candidate);
  }
  if (missing.length > 0) {
    onProgress(
      "generating_proof",
      `Enrolling ${missing.length} slot${missing.length === 1 ? "" : "s"} on Aztec. The CRISP server sends the Ethereum transaction and nothing is charged to you; this can take several minutes. Keep this tab open.`
    );
    const { txHash, skipped } = await sdk.requestEnrollment(server(), e3Id, missing);
    // `enrolled` and `in_flight` mean the weight is already on its way to Aztec; only a slot without power is refused.
    const refused = skipped.find(({ reason }) => reason === "no_weight");
    if (refused) throw new Error(`${refused.slot} has no voting power in this round.`);
    await sdk.waitForEnrollment({ votes, l1, program, e3Id, slots: missing, l1TxHash: txHash });
  }

  // 2. The staging key: once per round, signed by the wallet; the secret stays in this browser.
  const storage = {
    get: (key: string) => window.localStorage.getItem(key),
    set: (key: string, value: string) => window.localStorage.setItem(key, value),
  };
  const secrets = sdk.stagingSecretStore(storage);
  const roundId = sdk.roundIdOf(e3Id);
  const known = await secrets.get(program, e3Id, own);
  let secret = known;
  const alreadyBound =
    known !== undefined &&
    (await votes.logs("StagingKeyBound", { e3Id })).some(
      (log) => log.slot.toLowerCase() === own.toLowerCase() && log.commitment === sdk.stagingCommitment(known, roundId)
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
  onProgress("generating_proof", `Reading the census for the ${noun}…`);
  const [census, stagingTree] = await Promise.all([votes.getCensus(e3Id), votes.getStagingTree(e3Id)]);
  const ciphertexts = sdk.ciphertextStore(storage);
  const head = await sdk.resolveSlotHead({ client: votes, e3Id, slot, cache: ciphertexts, serverUrl: server() });
  // Staging passes this wallet has used in the round: the server accepts `counter < staging_max_requests`, once per tag.
  const counterKey = `interfold-governance:staging-counter:v1:${program.toLowerCase()}:${e3Id}:${own.toLowerCase()}`;
  const spend = (counter: number) => window.localStorage.setItem(counterKey, String(counter + 1));
  // The server reads a fresh staging key from Aztec on its own schedule and refuses a pass whose root it has not seen yet,
  // before it takes the pass's tag: that staging is sent again, unchanged, instead of proving the ballot again.
  const stagingFetch = retryingStagingFetch(fetch, (retry, delayMs) =>
    onProgress(
      "broadcasting",
      `Waiting for the CRISP server to see your staging key on Aztec (try ${retry}, next in ${Math.round(delayMs / 1000)} s). Keep this tab open.`
    )
  );

  onProgress("generating_proof", `Encrypting and proving the ${noun}. This takes a few minutes; keep this tab open.`);
  let cast;
  try {
    for (let counter = Number(window.localStorage.getItem(counterKey) ?? 0); ; counter++) {
      if (counter >= config.staging_max_requests) {
        throw new Error(
          `This wallet has used all ${config.staging_max_requests} ballots and masks the CRISP server accepts from one voter in a round.`
        );
      }
      try {
        cast = await sdk.buildCast({
          serverUrl: server(),
          program,
          l1ChainId,
          e3Id,
          slot,
          credits: request.credits,
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
        spend(counter);
        break;
      } catch (error) {
        // A pass the server already holds is spent: count it and try the next one. Any other refusal leaves it unspent.
        if (!isTagUsed(error)) throw error;
        spend(counter);
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
