import type { Address, Hex } from "viem";
import { preparedSenderError, type PreparedBallot } from "./preparedBallot";

/** The author/slot and attested payload are immutable. The transaction sender is the only new input. */
export async function sendPreparedBallot({
  ballot,
  sender,
  chainId,
  publish,
  receipt,
  save,
  remove,
}: {
  ballot: PreparedBallot;
  sender?: Address;
  chainId?: number;
  publish: (
    attestedPayload: Hex,
    options: { account: Address; expectedProgram: Address; onSubmitted: (hash: Hex) => void }
  ) => Promise<Hex>;
  receipt: (hash: Hex) => Promise<{ status: "success" | "reverted" }>;
  save: (ballot: PreparedBallot) => void;
  remove: (ballot: PreparedBallot) => void;
}) {
  const blocked = preparedSenderError(ballot, sender, chainId);
  if (blocked) throw new Error(blocked);
  let hash = ballot.transactionHash ?? null;
  if (hash) {
    const result = await receipt(hash);
    if (result.status !== "success") {
      if (ballot.expiresAt > Date.now()) save({ ...ballot, transactionHash: undefined });
      else remove(ballot);
      throw new Error("The transaction reverted. Prepare a new ballot if retrying fails.");
    }
  } else {
    hash = await publish(ballot.attestedPayload, {
      account: sender!,
      expectedProgram: ballot.program,
      onSubmitted: (transactionHash) => save({ ...ballot, transactionHash }),
    });
  }
  // Wallet rejection, preflight failure and confirmation timeouts all leave the ballot available.
  remove(ballot);
  return hash;
}
