import { describe, expect, test } from "bun:test";
import type { Address } from "viem";
import { slotsNeeded, slotsToEnroll } from "../plugins/crispVoting/utils/aztec/enrollmentPlan";

const own = "0x00000000000000000000000000000000000000A1" as Address;
const target = "0x00000000000000000000000000000000000000B2" as Address;

describe("which slots an Aztec ballot needs enrolled", () => {
  test("a vote needs only the voter's own slot", () => {
    expect(slotsNeeded({ kind: "vote", own })).toEqual([own]);
  });

  test("a mask needs its target and the masker's own slot, own first", () => {
    expect(slotsNeeded({ kind: "mask", own, target })).toEqual([own, target]);
  });

  test("a mask of the voter's own slot needs it once, whatever the address casing", () => {
    expect(slotsNeeded({ kind: "mask", own, target: own.toLowerCase() as Address })).toEqual([own]);
  });

  test("a vote asks for nothing once the own slot is enrolled", () => {
    expect(slotsToEnroll({ kind: "vote", own }, [own])).toEqual([]);
  });

  test("a vote asks for the own slot when it is not enrolled, even if other slots are", () => {
    expect(slotsToEnroll({ kind: "vote", own }, [target])).toEqual([own]);
  });

  test("a mask asks only for the slot that is missing", () => {
    expect(slotsToEnroll({ kind: "mask", own, target }, [own])).toEqual([target]);
    expect(slotsToEnroll({ kind: "mask", own, target }, [target])).toEqual([own]);
  });

  test("enrolled slots match case-insensitively", () => {
    expect(slotsToEnroll({ kind: "mask", own, target }, [own.toLowerCase() as Address, target.toLowerCase() as Address])).toEqual([]);
  });

  test("a mask asks for both slots when neither is enrolled", () => {
    expect(slotsToEnroll({ kind: "mask", own, target }, [])).toEqual([own, target]);
  });
});
