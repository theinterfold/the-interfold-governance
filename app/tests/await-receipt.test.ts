import { describe, expect, test } from "bun:test";
import { createPublicClient, custom } from "viem";
import { sepolia } from "viem/chains";
import { awaitSuccessfulReceipt } from "@/plugins/crispVoting/utils/awaitReceipt";

const HASH = `0x${"42".repeat(32)}` as const;
const BLOCK_HASH = `0x${"b1".repeat(32)}` as const;
const FROM = "0x4f1f3a157073a35515c4fc4a8af2f1af088f0676";
const TO = "0xe2e534f7cb95777ed870cdcacb80b1e9e2ad555b";
const BLOCK = "0x10";

const minedTx = {
  type: "0x2",
  chainId: "0xaa36a7",
  hash: HASH,
  blockHash: BLOCK_HASH,
  blockNumber: BLOCK,
  transactionIndex: "0x0",
  from: FROM,
  to: TO,
  nonce: "0xdf2",
  value: "0x0",
  gas: "0x780d",
  maxFeePerGas: "0x59682f1a",
  maxPriorityFeePerGas: "0x59682f00",
  input: "0x095ea7b3",
  accessList: [],
  v: "0x1",
  yParity: "0x1",
  r: `0x${"11".repeat(32)}`,
  s: `0x${"22".repeat(32)}`,
};

const receipt = {
  type: "0x2",
  status: "0x1",
  transactionHash: HASH,
  blockHash: BLOCK_HASH,
  blockNumber: BLOCK,
  transactionIndex: "0x0",
  from: FROM,
  to: TO,
  contractAddress: null,
  cumulativeGasUsed: "0x5208",
  gasUsed: "0x5208",
  effectiveGasPrice: "0x59682f00",
  logs: [],
  logsBloom: `0x${"00".repeat(256)}`,
};

/**
 * An RPC whose nodes disagree, as a load-balanced provider does for a moment after each block: the
 * transaction and its block are already served, but the node that answers receipt requests returns
 * null for the first `laggingReceiptReads` of them.
 */
function laggingRpcClient(laggingReceiptReads: number) {
  let receiptReads = 0;
  return createPublicClient({
    chain: sepolia,
    pollingInterval: 10,
    transport: custom({
      async request({ method }: { method: string }) {
        switch (method) {
          case "eth_chainId":
            return "0xaa36a7";
          case "eth_blockNumber":
            return BLOCK;
          case "eth_getTransactionByHash":
            return minedTx;
          case "eth_getBlockByNumber":
            return {
              number: BLOCK,
              hash: BLOCK_HASH,
              parentHash: `0x${"a0".repeat(32)}`,
              timestamp: "0x6ac61e50",
              gasLimit: "0x2255100",
              gasUsed: "0x5208",
              baseFeePerGas: "0x1a",
              transactions: [minedTx],
            };
          case "eth_getTransactionReceipt":
            receiptReads += 1;
            return receiptReads > laggingReceiptReads ? receipt : null;
          default:
            throw new Error(`unexpected RPC method ${method}`);
        }
      },
    }),
  });
}

describe("awaitSuccessfulReceipt", () => {
  // viem's replacement check finds the transaction in its block, asks for the receipt once more,
  // and rejects with TransactionReceiptNotFoundError when that read still lags. The transaction
  // succeeded, so the flow must continue (a fee-credit approval was reported as failed this way).
  // In the app, useTransactionManager waits for the same transaction through wagmi, on the same
  // client and with no timeout. Neither wait may stall the other (the fee-credit deposit was never
  // sent after its approval was mined, and the button kept spinning).
  test("resolves a mined transaction whose receipt lags behind its block", async () => {
    const client = laggingRpcClient(3);
    const mined = awaitSuccessfulReceipt(client, HASH, "The fee-token approval");
    const wagmiWait = () => client.waitForTransactionReceipt({ hash: HASH, timeout: 0 });
    const firstWagmiWait = wagmiWait().catch(() => undefined);

    // TanStack retries a failed wagmi wait. Only a wait that ends runs the success callback of
    // useTransactionManager.
    const wagmiReceipt = (await firstWagmiWait) ?? (await wagmiWait());
    expect(wagmiReceipt.transactionHash).toBe(HASH);
    expect((await mined).status).toBe("success");
    expect((await mined).transactionHash).toBe(HASH);
  });
});
