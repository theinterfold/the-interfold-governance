// SPDX-License-Identifier: LGPL-3.0-only
//
// This file is provided WITHOUT ANY WARRANTY;
// without even the implied warranty of MERCHANTABILITY
// or FITNESS FOR A PARTICULAR PURPOSE.

import type { EligibleVoter } from "./types";

/**
 * Get a random voter details from a list of eligible voters
 * @param addresses The list of eligible voters
 * @returns The randomly selected voter details
 */
export const getRandomVoterToMask = (voters: EligibleVoter[]): EligibleVoter => {
  if (voters.length === 0) {
    throw new Error("No eligible voters available to select from.");
  }

  const randomIndex = crypto.getRandomValues(new Uint32Array(1))[0] % voters.length;

  return voters[randomIndex];
};

/**
 * The recipients of a list of masks. A chosen wallet is kept as it is. Each `undefined` entry
 * gets a random eligible voter that no other mask in the list covers, so a list of random masks
 * spreads its cover. When the census has fewer voters than masks, the remaining random masks draw
 * from every voter again.
 * @param chosen One entry for each mask: a wallet, or `undefined` for a random voter.
 * @param voters The round's eligible voters.
 */
export const pickMaskRecipients = (chosen: (string | undefined)[], voters: EligibleVoter[]): string[] => {
  const used = new Set(chosen.filter((address) => address !== undefined).map((address) => address.toLowerCase()));
  return chosen.map((address) => {
    if (address !== undefined) return address;
    const unused = voters.filter((voter) => !used.has(voter.address.toLowerCase()));
    const voter = getRandomVoterToMask(unused.length ? unused : voters);
    used.add(voter.address.toLowerCase());
    return voter.address;
  });
};
