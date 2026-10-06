import type { Address, Hash } from "viem";
import { waitForTransactionReceipt } from "viem/actions";
import type { Config } from "wagmi";
import { getAccount, getConnectorClient } from "wagmi/actions";

/** How long a send waits for the wallet's node to return the previous transaction's receipt. */
const WALLET_SYNC_TIMEOUT_MS = 60_000;

/** Per account, the last transaction sent through the app whose receipt the wallet's node has not returned yet. */
const unsyncedTxByAccount = new Map<Address, Hash>();

/** Records a transaction that the connected account just sent. */
export function rememberSentTx(config: Config, hash: Hash) {
  const { address } = getAccount(config);
  if (address) unsyncedTxByAccount.set(address, hash);
}

/**
 * Waits until the wallet's node returns the receipt of the connected account's previous transaction.
 *
 * The wallet sets the nonce from its own node, and that node can be behind the node that the app
 * reads. When the app sends the next transaction as soon as its own node has the previous receipt,
 * the wallet can sign with the nonce that is already used ("nonce too low"). An account with an
 * EIP-7702 delegation also gets "in-flight transaction limit reached" while its previous transaction
 * is pending. A receipt read through MetaMask also moves MetaMask to the block that contains it,
 * and MetaMask reads the nonce at that block.
 *
 * @param config The wagmi config of the connected wallet.
 * @param chainId The chain that the app sends on.
 */
export async function waitForWalletSync(config: Config, chainId: number) {
  const { address, chainId: walletChainId } = getAccount(config);
  const hash = address ? unsyncedTxByAccount.get(address) : undefined;
  // A wallet on another chain reads that chain, so it can never return the receipt. The send
  // itself fails on the chain mismatch, and the next send on this chain waits for the receipt.
  if (!address || !hash || walletChainId !== chainId) return;

  try {
    const wallet = await getConnectorClient(config, { chainId });
    await waitForTransactionReceipt(wallet, { hash, timeout: WALLET_SYNC_TIMEOUT_MS });
  } catch {
    // The wallet disconnected, or its node did not return the receipt in time. Send anyway: if
    // the nonce is wrong, the wallet reports the error.
  } finally {
    if (unsyncedTxByAccount.get(address) === hash) unsyncedTxByAccount.delete(address);
  }
}
