import { createPublicClient, custom, TransactionReceiptNotFoundError, type Hash, type PublicClient } from "viem";

/** How many times the wait starts again while the RPC returns the block of a transaction but not its receipt. */
const RECEIPT_LAG_RETRIES = 5;

/**
 * Waits for a transaction and fails if it reverted.
 *
 * `waitForTransactionReceipt` RESOLVES for reverted transactions — it only rejects on timeout or
 * transport failure — so awaiting it bare treats a revert as success. That is how a failed approval
 * would be followed by a deposit that cannot possibly work, and how a reverted deposit would report
 * "Fee credit deposited" and refetch an unchanged balance.
 *
 * It also rejects a mined transaction when the RPC nodes behind the transport disagree. Its
 * replacement check finds the transaction in a block from one node, then reads the receipt from a
 * node that does not have it yet, and throws `TransactionReceiptNotFoundError`. The transaction is
 * mined, so that error starts the wait again after one polling interval.
 *
 * The wait runs on a client of its own. viem keeps one receipt watch per client and transaction,
 * and every wait for that pair joins it. `useTransactionManager` waits for the same transaction
 * through wagmi, on the client of the hooks and with no timeout. A wait that joins a watch stays
 * registered after the watch ends, so on a shared client a rejected watch leaves later waits for
 * the transaction joined to a watch that no longer polls: neither the restart below nor the retry
 * of the wagmi query would ever see the receipt.
 *
 * @param client The public client whose transport the wait reads through.
 * @param hash The transaction to wait for.
 * @param action Human-readable operation name, used in the thrown message.
 */
export async function awaitSuccessfulReceipt(client: PublicClient, hash: Hash, action: string) {
  const receipt = await waitForReceipt(ownClient(client), hash);

  if (receipt.status !== "success") {
    throw new Error(`${action} reverted on-chain`);
  }

  return receipt;
}

/** A client with receipt watches of its own, on the transport of `client`. */
function ownClient(client: PublicClient): PublicClient {
  return createPublicClient({
    chain: client.chain,
    pollingInterval: client.pollingInterval,
    // `client.request` retries already.
    transport: custom({ request: client.request }, { retryCount: 0 }),
  });
}

async function waitForReceipt(client: PublicClient, hash: Hash) {
  for (let retry = 0; ; retry++) {
    try {
      return await client.waitForTransactionReceipt({ hash });
    } catch (error) {
      if (!(error instanceof TransactionReceiptNotFoundError) || retry === RECEIPT_LAG_RETRIES) throw error;
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, client.pollingInterval);
      await promise;
    }
  }
}
