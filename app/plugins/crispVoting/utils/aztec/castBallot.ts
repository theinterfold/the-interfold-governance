import type { TypedDataSigner } from "@crisp-e3/aztec";
import type { Vote } from "@crisp-e3/sdk";
import type { Address, Hex } from "viem";
import { PUB_CRISP_SERVER_URL } from "@/constants";
import type { VotingStep } from "../types";
import { publicClient } from "../client";
import { loadAztecDeployment } from "./round";
import { getAztecVotes } from "./session";

type Sdk = typeof import("@crisp-e3/aztec");

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
  const [votes, config] = await Promise.all([
    loadAztecDeployment(program).then(({ contract }) => getAztecVotes(own, contract)),
    sdk.getRemoteInputConfig(server()),
  ]);
  if (config.kind !== "aztec-votes" || config.program.toLowerCase() !== program.toLowerCase()) {
    throw new Error(
      `The CRISP server at ${server()} serves the ${config.kind} program ${config.program}, not this round's Aztec votes program ${program}.`
    );
  }

  // 1. Enrollment: lazy, the first time a ballot needs a slot. A vote needs the voter's own slot (the staging pass proves
  // it in the census); a mask also needs its target (the proof reads the target's census leaf).
  onProgress("generating_proof", "Reading the census on Aztec…");
  const census = await sdk.ensureEnrolled({
    votes,
    // The SDK ships its own copy of viem, so its client type is a different (structurally equal) one.
    l1: publicClient as unknown as Parameters<Sdk["ensureEnrolled"]>[0]["l1"],
    program,
    e3Id,
    serverUrl: server(),
    slots: own.toLowerCase() === slot.toLowerCase() ? [own] : [own, slot],
    onEnrolling: (missing) =>
      onProgress(
        "generating_proof",
        `Enrolling ${missing.length} slot${missing.length === 1 ? "" : "s"} on Aztec. The CRISP server sends the Ethereum transaction and nothing is charged to you; this can take several minutes. Keep this tab open.`
      ),
  });

  // 2. The staging key: once per round, signed by the wallet; the secret stays in this browser.
  const storage = {
    get: (key: string) => window.localStorage.getItem(key),
    set: (key: string, value: string) => window.localStorage.setItem(key, value),
  };
  const { secret, stagingTree } = await votes.stagingKey({
    e3Id,
    slot: own,
    program,
    l1ChainId,
    storage,
    signer: async (typedData) => {
      const signature = await request.sign("staging-key", typedData);
      onProgress("broadcasting", "Binding your staging key on Aztec. This takes about a minute; keep this tab open.");
      return signature;
    },
  });

  // 3. The ballot.
  onProgress("generating_proof", `Encrypting and proving the ${noun}. This takes a few minutes; keep this tab open.`);
  const ciphertexts = sdk.ciphertextStore(storage);
  const head = await sdk.resolveSlotHead({ client: votes, e3Id, slot, cache: ciphertexts, serverUrl: server() });
  // The staging passes this wallet has used in the round: the server takes each one once, `staging_max_requests` in all.
  const counterKey = `interfold-governance:staging-counter:v1:${program.toLowerCase()}:${e3Id}:${own.toLowerCase()}`;
  let cast;
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
      staging: {
        secret,
        stagingTree,
        maxRequests: config.staging_max_requests,
        counter: Number(window.localStorage.getItem(counterKey) ?? 0),
      },
      onStagingWait: () =>
        onProgress("broadcasting", "Waiting for the CRISP server to see your staging key on Aztec. Keep this tab open."),
      onProgress: ({ stage, index, total }) =>
        onProgress("generating_proof", `Proving the ${noun}: ${stage} (${index + 1} of ${total})`),
    });
  } finally {
    await sdk.destroyVotesStagingPassProver();
  }
  window.localStorage.setItem(counterKey, String(cast.stagingCounter + 1));

  onProgress("broadcasting", `Sending the ${noun} to Aztec. Proving the transaction takes about a minute; keep this tab open.`);
  const sent = await votes.cast(cast);
  // From here the slot's head is this ciphertext, whatever happens next.
  await ciphertexts.set(e3Id, cast.encryptedVote);
  return sent.txHash;
}
