import { parseAbi, type AbiFunction } from "viem";
import { previewAddress, requireLocalPreview } from "./previewMode";

/** Fictional addresses and ABIs for the local proposal composer only. */
export const DEMO_CONTRACT_A = previewAddress(0xca01);
export const DEMO_CONTRACT_B = previewAddress(0xca02);

const contracts = new Map<string, AbiFunction[]>([
  [
    DEMO_CONTRACT_A.toLowerCase(),
    Array.from(
      parseAbi([
        "function setThreshold(uint256 newThreshold)",
        "function pause()",
        "function threshold() view returns (uint256)",
      ])
    ),
  ],
  [
    DEMO_CONTRACT_B.toLowerCase(),
    Array.from(
      parseAbi([
        "function changeRecipient(address nextRecipient)",
        "function resume()",
        "function recipient() view returns (address)",
      ])
    ),
  ],
]);

export function previewContractAbi(address: string): AbiFunction[] {
  requireLocalPreview();
  return contracts.get(address.toLowerCase()) ?? [];
}
