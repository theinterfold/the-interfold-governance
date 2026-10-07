import { describe, expect, it } from "bun:test";
import { toFunctionSignature } from "viem";
import { DESIGN_PREVIEW } from "@/dev/previewMode";
import { DEMO_CONTRACT_A, DEMO_CONTRACT_B, previewContractAbi } from "@/dev/contractActionFixtures";

describe("local contract action fixtures", () => {
  it.skipIf(DESIGN_PREVIEW)("rejects fixture access outside local design preview", () => {
    expect(() => previewContractAbi(DEMO_CONTRACT_A)).toThrow(
      "Design preview is only available in local development."
    );
  });

  it.skipIf(!DESIGN_PREVIEW)("has distinct callable ABIs for both examples and no ABI for unknown addresses", () => {
    const a = previewContractAbi(DEMO_CONTRACT_A);
    const b = previewContractAbi(DEMO_CONTRACT_B);

    expect(a.some((item) => item.stateMutability === "nonpayable")).toBe(true);
    expect(a.some((item) => item.stateMutability === "view")).toBe(true);
    expect(b.some((item) => item.stateMutability === "nonpayable")).toBe(true);
    expect(b.some((item) => item.stateMutability === "view")).toBe(true);
    expect(a.map(toFunctionSignature).some((signature) => b.map(toFunctionSignature).includes(signature))).toBe(false);
    expect(previewContractAbi("0x000000000000000000000000000000000000abcd")).toEqual([]);
  });
});
