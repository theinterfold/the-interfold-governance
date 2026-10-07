import { describe, expect, test } from "bun:test";
import { decodeFunctionData, encodeFunctionData, zeroAddress, type Address } from "viem";
import { lockCreationRequest } from "../plugins/velocker/utils/lockRequest";
import { votingEscrowAbi } from "../plugins/velocker/artifacts/votingEscrow";

const payer = "0x000000000000000000000000000000000000de01" as const;
const recipient = "0x000000000000000000000000000000000000de02" as const;
const amount = 20_000n * 10n ** 18n;

describe("Lock ownership", () => {
  test("another wallet is encoded as the lock owner, alongside the exact amount", () => {
    const data = encodeFunctionData({ abi: votingEscrowAbi, ...lockCreationRequest(amount, payer, recipient) });
    expect(decodeFunctionData({ abi: votingEscrowAbi, data })).toEqual({
      functionName: "createLockFor",
      args: [amount, recipient],
    });
  });

  test("your wallet keeps the existing self-lock call, regardless of address casing", () => {
    const request = lockCreationRequest(amount, payer, "0x000000000000000000000000000000000000De01");
    expect(request).toEqual({ functionName: "createLock", args: [amount] });
  });

  test("invalid owners and zero amounts fail before an approval can be requested", () => {
    for (const owner of [zeroAddress, "0x1234", "not-a-wallet"]) {
      expect(() => lockCreationRequest(amount, payer, owner as Address)).toThrow("valid lock owner");
    }
    expect(() => lockCreationRequest(0n, payer, recipient)).toThrow("greater than zero");
  });
});
