import { describe, expect, test } from "bun:test";
import type { AbiFunction } from "viem";
import { functionBelongsToAbi, preparedActionMatchesTarget } from "../components/input/contractActionState";

const contractA = "0x1111111111111111111111111111111111111111" as const;
const contractB = "0x2222222222222222222222222222222222222222";
const transfer: AbiFunction = {
  type: "function",
  name: "transfer",
  stateMutability: "nonpayable",
  inputs: [
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  outputs: [],
};
const approve: AbiFunction = {
  type: "function",
  name: "approve",
  stateMutability: "nonpayable",
  inputs: [
    { name: "spender", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  outputs: [],
};

describe("prepared contract action validity", () => {
  test("blocks an action prepared for the previous address during the next ABI load", () => {
    const prepared = { to: contractA, value: 0n, data: "0x12345678" as const };
    expect(preparedActionMatchesTarget(prepared, contractA)).toBe(true);
    expect(preparedActionMatchesTarget(prepared, contractB)).toBe(false);
    expect(preparedActionMatchesTarget(prepared, "not an address")).toBe(false);
    expect(preparedActionMatchesTarget(undefined, contractA)).toBe(false);
  });

  test("requires the selected function signature in the newly loaded ABI", () => {
    expect(functionBelongsToAbi(transfer, [transfer])).toBe(true);
    expect(functionBelongsToAbi(transfer, [approve])).toBe(false);
    expect(functionBelongsToAbi(undefined, [transfer])).toBe(false);
  });
});
