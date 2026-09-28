// SPDX-License-Identifier: LGPL-3.0-only
//
// This file is provided WITHOUT ANY WARRANTY;
// without even the implied warranty of MERCHANTABILITY
// or FITNESS FOR A PARTICULAR PURPOSE.

import type { EligibleVoter } from "./types";
import { isAddress } from "viem";

export function selectVoterToMask(voters: EligibleVoter[], target?: string): EligibleVoter {
  if (target === undefined) return getRandomVoterToMask(voters);
  if (!isAddress(target)) throw new Error("Enter a valid wallet address.");
  const voter = voters.find((voter) => voter.address.toLowerCase() === target.toLowerCase());
  if (!voter) throw new Error("This wallet is not eligible for masking in this proposal.");
  return voter;
}

/**
 * Get a random voter details from a list of eligible voters
 * @param addresses The list of eligible voters
 * @returns The randomly selected voter details
 */
export const getRandomVoterToMask = (voters: EligibleVoter[], excludeAddress?: string): EligibleVoter => {
  const candidates = voters.filter((voter) => voter.address.toLowerCase() !== excludeAddress?.toLowerCase());
  if (excludeAddress && candidates.length === 0) {
    throw new Error("No other eligible voters are available. Choose Your wallet or enter an eligible address.");
  }
  if (candidates.length === 0) {
    throw new Error("No eligible voters available to select from.");
  }

  const randomIndex = crypto.getRandomValues(new Uint32Array(1))[0] % candidates.length;

  return candidates[randomIndex];
};
