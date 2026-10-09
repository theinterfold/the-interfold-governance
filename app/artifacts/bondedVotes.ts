import { parseAbi, parseAbiItem } from "viem";

/**
 * `BondedVotes`: the voting-power source of the DAO (`PUB_BONDED_VOTES_ADDRESS`), as far as the
 * app reads it beyond IVotes.
 *
 * Bonded delegation: an owner gives its bonded weight — bonded FOLD and, when the votes source is
 * the escrow, vesting FOLD — to one delegate. `delegateBonded` asks and moves nothing, the delegate
 * takes the weight on with `acceptBonded`, and either side ends it at once (`delegateBonded` with
 * zero or self, `dropBonded`). A delegate represents at most `MAX_BONDED_OWNERS` owners.
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
  "function acceptBonded(address owner)",
  "function dropBonded(address owner)",
]);

/** `owner` asked `delegatee` to represent its bonded weight; zero `delegatee` withdraws the request. */
export const bondedDelegationRequestedEvent = parseAbiItem(
  "event BondedDelegationRequested(address indexed owner, address indexed delegatee)"
);

/** `BondedCheckpoints`, the bonded-total history behind `BondedVotes.checkpoints()`. */
export const bondedCheckpointsAbi = parseAbi(["function bonded(address account) view returns (uint256)"]);
