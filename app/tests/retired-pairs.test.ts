import { describe, expect, test } from "bun:test";
import { parseRetiredPairs } from "../utils/retiredPairs";

// The two pairs that mainnet retires: the v0.18 pair (CRISP build 2) and the v0.19 pair (build 3).
const SPP_A = "0x364686f83d7cCEdf88B881B23d4437D1652A8FfB";
const BODY_A = "0x197be4E09614285Abb4b74b672377c404FD44d54";
const SPP_B = "0xc19635aD8De0a0D6430025fC5ed212CA8216bab3";
const BODY_B = "0xf101fB197E38f6b3Ca110D619D845634CD88098c";

/** Flips the case of the first letter of an address, which breaks its EIP-55 checksum. */
const breakChecksum = (address: string) => address.replace(/[a-f]/i, (letter) => (letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase()));

describe("retired private pairs", () => {
  test("no value gives no pair", () => {
    expect(parseRetiredPairs("", "")).toEqual([]);
    expect(parseRetiredPairs("  ", " ")).toEqual([]);
  });

  test("a single address in each variable gives one pair", () => {
    expect(parseRetiredPairs(SPP_A, BODY_A)).toEqual([{ spp: SPP_A, body: BODY_A }]);
  });

  test("a list gives the pairs in order, matched by position", () => {
    expect(parseRetiredPairs(`${SPP_A},${SPP_B}`, `${BODY_A},${BODY_B}`)).toEqual([
      { spp: SPP_A, body: BODY_A },
      { spp: SPP_B, body: BODY_B },
    ]);
  });

  test("whitespace around an address is ignored", () => {
    expect(parseRetiredPairs(` ${SPP_A} ,\n ${SPP_B}\t`, `${BODY_A} , ${BODY_B} `)).toEqual([
      { spp: SPP_A, body: BODY_A },
      { spp: SPP_B, body: BODY_B },
    ]);
  });

  test("a lowercase address is accepted and returned checksummed", () => {
    expect(parseRetiredPairs(SPP_A.toLowerCase(), BODY_A.toLowerCase())).toEqual([{ spp: SPP_A, body: BODY_A }]);
  });

  test("lists of different length are refused", () => {
    expect(() => parseRetiredPairs(`${SPP_A},${SPP_B}`, BODY_A)).toThrow("2 address(es)");
  });

  test("one variable set without the other is refused", () => {
    expect(() => parseRetiredPairs(SPP_A, "")).toThrow("Set both");
    expect(() => parseRetiredPairs("", BODY_A)).toThrow("Set both");
  });

  test("a wrong checksum is refused and names the entry", () => {
    expect(() => parseRetiredPairs(`${SPP_A},${breakChecksum(SPP_B)}`, `${BODY_A},${BODY_B}`)).toThrow(
      "NEXT_PUBLIC_RETIRED_SPP_PRIVATE_ADDRESS entry 2"
    );
    expect(() => parseRetiredPairs(SPP_A, breakChecksum(BODY_A))).toThrow(
      "NEXT_PUBLIC_RETIRED_CRISP_VOTING_PLUGIN_ADDRESS entry 1"
    );
  });

  test("something that is not an address is refused", () => {
    expect(() => parseRetiredPairs("0x1234", BODY_A)).toThrow("not a valid address");
  });

  test("an empty entry, such as a trailing comma, is refused", () => {
    expect(() => parseRetiredPairs(`${SPP_A},`, `${BODY_A},`)).toThrow("is empty");
    expect(() => parseRetiredPairs(`${SPP_A},,${SPP_B}`, `${BODY_A},${BODY_B},${BODY_B}`)).toThrow("is empty");
  });

  test("an address listed twice is refused", () => {
    expect(() => parseRetiredPairs(`${SPP_A},${SPP_A}`, `${BODY_A},${BODY_B}`)).toThrow("more than once");
    expect(() => parseRetiredPairs(`${SPP_A},${SPP_B}`, `${BODY_A},${BODY_A}`)).toThrow("more than once");
  });
});
