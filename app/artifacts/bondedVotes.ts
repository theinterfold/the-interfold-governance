import { parseAbi } from "viem";

/**
 * `BondedVotes`: the voting-power source of the DAO (`PUB_BONDED_VOTES_ADDRESS`), as far as the
 * app reads it beyond IVotes.
 *
 * Bonded delegation: an owner can hand its bonded weight — bonded FOLD and, when the votes source
 * is the escrow, vesting FOLD — to a delegate. The app only takes that weight back: `delegateBonded`
 * with zero withdraws a pending request or ends the current delegation, and the weight counts for
 * the owner again. `bondedOwners` lists the owners that an account represents.
 *
 * Adapters deployed before bonded delegation have none of these functions, so a read of
 * `MAX_BONDED_OWNERS` doubles as the capability probe.
 *
 * The custom errors are left out on purpose: without them viem reports the raw selector, which
 * `explainContractError` turns into the same text for the toast and for the inline error.
 */
export const bondedVotesAbi = parseAbi([
  "function checkpoints() view returns (address)",
  "function escrow() view returns (address)",
  "function MAX_BONDED_OWNERS() view returns (uint256)",
  "function pendingBondedDelegate(address owner) view returns (address)",
  "function bondedDelegate(address owner) view returns (address)",
  "function bondedOwners(address delegatee) view returns (address[])",
  "function delegateBonded(address delegatee)",
]);

/** `BondedCheckpoints`, the bonded-total history behind `BondedVotes.checkpoints()`. */
export const bondedCheckpointsAbi = parseAbi(["function bonded(address account) view returns (uint256)"]);
