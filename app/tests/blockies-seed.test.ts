import { expect, test, describe } from "bun:test";

/**
 * react-blockies (dist/main.js) seeds a xorshift PRNG straight from `seed.charCodeAt(i)` and
 * never normalises the string — there is no `toLowerCase` anywhere in the package. So the
 * CHECKSUMMED address viem returns from `getLogs` and the lowercase form Etherscan and the ODS
 * member avatars use generate DIFFERENT icons for the same account.
 *
 * The incident: the votes list rendered `seed={veto.voter}` with viem's checksummed value, so a
 * voter's icon in our UI never matched the one Etherscan showed for the same address.
 *
 * This reproduces the library's generator exactly rather than importing it, because the real
 * component renders to a canvas that jsdom does not implement.
 */
function blockiesRand(seed: string): () => number {
  const randseed = new Array(4).fill(0);
  for (let i = 0; i < seed.length; i++) {
    randseed[i % 4] = (randseed[i % 4] << 5) - randseed[i % 4] + seed.charCodeAt(i);
  }
  return function rand() {
    const t = randseed[0] ^ (randseed[0] << 11);
    randseed[0] = randseed[1];
    randseed[1] = randseed[2];
    randseed[2] = randseed[3];
    randseed[3] = randseed[3] ^ (randseed[3] >> 19) ^ t ^ (t >> 8);
    return (randseed[3] >>> 0) / ((1 << 31) >>> 0);
  };
}

/** The first draws characterise both the colour palette and the pixel pattern. */
const fingerprint = (seed: string) => {
  const rand = blockiesRand(seed);
  return Array.from({ length: 16 }, () => rand().toFixed(9)).join(",");
};

/** What the component must do with an address before handing it to react-blockies. */
const toSeed = (address: string | undefined) => (address ?? "").toLowerCase();

const CHECKSUMMED = "0x8837e47c4Bb520ADE83AAB761C3B60679443af1B";
const LOWERCASE = "0x8837e47c4bb520ade83aab761c3b60679443af1b";

describe("blockies seeding (INV: our voter icons must match every explorer's)", () => {
  test("the library's seed is case-sensitive — this is the bug being guarded", () => {
    // If this ever becomes equal, react-blockies started normalising and the guard is moot.
    expect(fingerprint(CHECKSUMMED)).not.toEqual(fingerprint(LOWERCASE));
  });

  test("a checksummed address is normalised to the same seed as its lowercase form", () => {
    expect(toSeed(CHECKSUMMED)).toEqual(LOWERCASE);
    expect(fingerprint(toSeed(CHECKSUMMED))).toEqual(fingerprint(LOWERCASE));
  });

  test("normalisation is idempotent — an already-lowercase address is untouched", () => {
    expect(toSeed(LOWERCASE)).toEqual(LOWERCASE);
    expect(fingerprint(toSeed(LOWERCASE))).toEqual(fingerprint(toSeed(CHECKSUMMED)));
  });

  test("a missing voter does not throw and yields a stable empty seed", () => {
    expect(toSeed(undefined)).toEqual("");
  });

  test("different accounts still produce different icons", () => {
    const other = "0x652a31c669f9ab37f6040f279139a75d04f2679e";
    expect(fingerprint(toSeed(other))).not.toEqual(fingerprint(toSeed(CHECKSUMMED)));
  });
});
