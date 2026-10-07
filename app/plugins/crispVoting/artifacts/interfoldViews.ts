import { parseAbi } from "viem";

/** Read-only views shared by round activity and lifecycle status. */
export const interfoldViewsAbi = parseAbi([
  "struct E3 { uint256 seed; uint8 committeeSize; uint256 requestBlock; uint256[2] inputWindow; bytes32 encryptionSchemeId; address e3Program; uint8 paramSet; bytes customParams; address decryptionVerifier; address pkVerifier; bytes32 committeePublicKey; bytes32 ciphertextOutput; bytes plaintextOutput; address requester; bool proofAggregationEnabled; }",
  "function getE3(uint256 e3Id) view returns (E3 memory e3)",
  "function getE3Stage(uint256 e3Id) view returns (uint8)",
  "function getFailureReason(uint256 e3Id) view returns (uint8)",
  "function checkFailureCondition(uint256 e3Id) view returns (bool canFail, uint8 reason)",
]);
