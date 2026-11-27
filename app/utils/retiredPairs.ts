import { getAddress, isAddress } from "viem";

import type { Address } from "viem";

/** One private process: the SPP that holds its proposals and the CRISP body that runs their vote. */
export interface PrivatePair {
  spp: Address;
  body: Address;
}

const SPP_VARIABLE = "NEXT_PUBLIC_RETIRED_SPP_PRIVATE_ADDRESS";
const BODY_VARIABLE = "NEXT_PUBLIC_RETIRED_CRISP_VOTING_PLUGIN_ADDRESS";

/**
 * Parses the retired private pairs from the two env values.
 *
 * Each value is one address or a comma-separated list. The lists have the same length and the same
 * order: pair `i` is `(spp[i], body[i])`. A misconfiguration throws instead of dropping a pair,
 * because a retired pair that silently disappears hides proposals the DAO still has: a wrong list
 * length, an entry that is not an address or has a bad EIP-55 checksum, an empty entry (a stray
 * comma), or an address that appears twice. An all-lowercase address has no checksum to check and
 * is accepted.
 *
 * @param sppList `NEXT_PUBLIC_RETIRED_SPP_PRIVATE_ADDRESS`.
 * @param bodyList `NEXT_PUBLIC_RETIRED_CRISP_VOTING_PLUGIN_ADDRESS`.
 * @returns The pairs, in the order of the lists, with checksummed addresses.
 */
export function parseRetiredPairs(sppList: string, bodyList: string): PrivatePair[] {
  // Whitespace around an entry is ignored; an empty value is an empty list.
  const spps = sppList.trim() === "" ? [] : sppList.split(",").map((item) => item.trim());
  const bodies = bodyList.trim() === "" ? [] : bodyList.split(",").map((item) => item.trim());

  if (spps.length !== bodies.length) {
    throw new Error(
      `${SPP_VARIABLE} lists ${spps.length} address(es) and ${BODY_VARIABLE} lists ${bodies.length}. Set both with the same number of comma-separated addresses, in the same order, or neither.`
    );
  }

  const checked = (variable: string, entries: string[]): Address[] => {
    const addresses = entries.map((entry, index) => {
      if (!isAddress(entry, { strict: true })) {
        throw new Error(
          `${variable} entry ${index + 1} is ${entry === "" ? "empty" : `not a valid address (check the EIP-55 checksum): ${entry}`}.`
        );
      }
      return getAddress(entry);
    });
    const duplicate = addresses.find((address, index) => addresses.indexOf(address) !== index);
    if (duplicate) throw new Error(`${variable} lists ${duplicate} more than once.`);
    return addresses;
  };

  const sppAddresses = checked(SPP_VARIABLE, spps);
  const bodyAddresses = checked(BODY_VARIABLE, bodies);

  return sppAddresses.map((spp, index) => ({ spp, body: bodyAddresses[index] }));
}
