import { expect, test, describe } from "bun:test";
import { createImageData, parseOptions } from "blockies-ts";
import { getAddress } from "viem";

/**
 * INV: a voter's icon in the CRISP votes list must match the icon the rest of this app renders
 * for the same account.
 *
 * Everything else in the app uses ODS `MemberAvatar`, which generates its fallback with
 * `blockies.create({ seed: getChecksum(address), scale: 8, size: 8 })` — the CHECKSUMMED address
 * at size 8. The votes list uses `react-blockies` instead, a different package.
 *
 * The two packages share a byte-identical xorshift PRNG and `createImageData`, and consume
 * randomness in the same order (color, bgcolor, spotcolor, then the pixel grid). Neither
 * normalises the seed. So the rendered icon is a pure function of (seed string, size), and BOTH
 * have to match ODS:
 *
 *   - seed: `getAddress()` output, not lowercase. Lowercasing was the original mistake — it makes
 *     the icon differ from every other avatar in this app.
 *   - size: 8, not 9. `size` is the grid dimension, not a display scale, so changing it changes
 *     how much randomness `createImageData` draws and produces a different pattern.
 *
 * This drives the real `blockies-ts` (the exact library ODS depends on) rather than a
 * reimplementation, so the test fails if that dependency ever changes its algorithm.
 */

/** The pixel grid ODS/blockies-ts produces, seeding exactly as `MemberAvatar` does. */
function pattern(seed: string, size: number): number[] {
  // Re-seeds the shared PRNG and burns the three colour draws, matching ODS's call order.
  parseOptions({ seed, size, scale: 8 });
  return createImageData(size);
}

/** What `votes-section.tsx` must hand to react-blockies. */
const toSeed = (address: string | undefined) => (address && /^0x[0-9a-fA-F]{40}$/.test(address) ? getAddress(address) : "");

const ODS_SIZE = 8;

const CHECKSUMMED = "0x8837e47c4Bb520ADE83AAB761C3B60679443af1B";
const LOWERCASE = "0x8837e47c4bb520ade83aab761c3b60679443af1b";

/** The ODS `MemberAvatar` reference icon for CHECKSUMMED. */
const odsReference = () => pattern(getAddress(CHECKSUMMED), ODS_SIZE);

describe("blockies seeding (INV: voter icons must match the app's other avatars)", () => {
  test("our seed + size reproduce the ODS MemberAvatar icon exactly", () => {
    expect(pattern(toSeed(CHECKSUMMED), ODS_SIZE)).toEqual(odsReference());
  });

  test("a lowercase input still yields the ODS icon — getAddress re-checksums it", () => {
    expect(toSeed(LOWERCASE)).toEqual(CHECKSUMMED);
    expect(pattern(toSeed(LOWERCASE), ODS_SIZE)).toEqual(odsReference());
  });

  /** The original bug: lowercasing the seed. Guards against reintroducing it. */
  test("lowercasing the seed does NOT match ODS", () => {
    expect(pattern(LOWERCASE, ODS_SIZE)).not.toEqual(odsReference());
  });

  /**
   * The second half of the bug, and the easier one to miss: `size` is the grid dimension, so
   * size 9 draws a different amount of randomness and yields a different pattern — it is not a
   * cosmetic scaling knob.
   */
  test("size 9 does NOT match ODS, even with the correct checksummed seed", () => {
    expect(pattern(getAddress(CHECKSUMMED), 9)).not.toEqual(odsReference());
  });

  test("the library is case-sensitive — if this ever fails, it started normalising", () => {
    expect(pattern(CHECKSUMMED, ODS_SIZE)).not.toEqual(pattern(LOWERCASE, ODS_SIZE));
  });

  test("a missing or malformed voter yields an empty seed instead of throwing", () => {
    // getAddress throws on malformed input, so the component must guard before calling it.
    expect(() => toSeed(undefined)).not.toThrow();
    expect(toSeed(undefined)).toEqual("");
    expect(toSeed("")).toEqual("");
    expect(toSeed("0x")).toEqual("");
    expect(toSeed("0x8837e47c4Bb520ADE83AAB761C3B60679443af")).toEqual("");
    expect(toSeed("not-an-address")).toEqual("");
  });

  test("different accounts still produce different icons", () => {
    const other = "0x652a31c669f9AB37f6040f279139a75D04F2679e";
    expect(pattern(toSeed(other), ODS_SIZE)).not.toEqual(odsReference());
  });
});
