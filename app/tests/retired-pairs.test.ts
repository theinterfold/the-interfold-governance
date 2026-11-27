import { describe, expect, test } from "bun:test";
import { parseRetiredPairs } from "../utils/retiredPairs";

// The two pairs that mainnet retires: the v0.18 pair (CRISP build 2) and the v0.19 pair (build 3).
const SPP_A = "0x364686f83d7cCEdf88B881B23d4437D1652A8FfB";
const BODY_A = "0x197be4E09614285Abb4b74b672377c404FD44d54";
const SPP_B = "0xc19635aD8De0a0D6430025fC5ed212CA8216bab3";
const BODY_B = "0xf101fB197E38f6b3Ca110D619D845634CD88098c";

// A wrong pairing reads one body's proposals through another's SPP, and a silently dropped pair
// hides proposals the DAO still has. Both must fail loudly instead.
describe("retired private pairs", () => {
  test("pairs each SPP with the body at the same position; one value or none still works", () => {
    expect(parseRetiredPairs("", "")).toEqual([]);
    expect(parseRetiredPairs(SPP_A, BODY_A)).toEqual([{ spp: SPP_A, body: BODY_A }]);
    expect(parseRetiredPairs(`${SPP_A}, ${SPP_B}`, `${BODY_A}, ${BODY_B}`)).toEqual([
      { spp: SPP_A, body: BODY_A },
      { spp: SPP_B, body: BODY_B },
    ]);
  });

  test("refuses a configuration that would drop or misread a pair", () => {
    const flipped = SPP_B.replace("aD8De", "AD8De"); // breaks the EIP-55 checksum
    for (const [spps, bodies] of [
      [`${SPP_A},${SPP_B}`, BODY_A], // lists of different length
      [SPP_A, ""], // one variable without the other
      [`${SPP_A},${flipped}`, `${BODY_A},${BODY_B}`], // a mistyped address
      [`${SPP_A},`, `${BODY_A},`], // a stray comma
    ]) {
      expect(() => parseRetiredPairs(spps, bodies)).toThrow();
    }
  });
});
