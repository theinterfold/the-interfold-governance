import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client";
import type { AztecSession, CrispAztecVotes } from "@crisp-e3/aztec";
import type { Address, Hex } from "viem";
import { PUB_AZTEC_NODE_URL } from "@/constants";
import { aztecAccountStorageKey, parseStoredAccount, type StoredAccount } from "./secrets";

/*
 * Everything that talks to Aztec lives under this folder and is imported with `import()` from event handlers and
 * query functions only. The Aztec stack (PXE, wallet, prover, the contract artifact) is tens of MB of JavaScript and
 * wasm and needs `window`, OPFS and workers, so it must never load on the server or with the first page.
 */

let nodePromise: Promise<AztecNode> | undefined;

/** A read-only node client: enough for logs and round status, no wallet. */
export function getAztecNode(): Promise<AztecNode> {
  if (!PUB_AZTEC_NODE_URL) return Promise.reject(new Error("NEXT_PUBLIC_AZTEC_NODE_URL is not set."));
  nodePromise ??= import("@aztec-labs/aztec.js/node").then(({ createAztecNodeClient }) =>
    createAztecNodeClient(PUB_AZTEC_NODE_URL)
  );
  nodePromise.catch(() => (nodePromise = undefined));
  return nodePromise;
}

let sessionCache: { wallet: string; session: Promise<AztecSession> } | undefined;

/**
 * The embedded Aztec wallet of the connected EVM wallet: its account's keys persist in localStorage per wallet, so a
 * voter keeps one Aztec address across visits. The account is initializerless (nothing is deployed) and the
 * SponsoredFPC pays every fee, so the voter holds no Aztec funds. Transactions are proved in the browser: a public
 * network rejects unproven ones. One session at a time; connecting another wallet stops the previous one.
 */
export function getAztecSession(wallet: Address): Promise<AztecSession> {
  const key = wallet.toLowerCase();
  if (sessionCache?.wallet === key) return sessionCache.session;
  const previous = sessionCache?.session;
  void previous?.then((session) => session.stop()).catch(() => undefined);

  const session = createSession(wallet);
  sessionCache = { wallet: key, session };
  session.catch(() => {
    if (sessionCache?.session === session) sessionCache = undefined;
  });
  return session;
}

async function createSession(wallet: Address): Promise<AztecSession> {
  if (!PUB_AZTEC_NODE_URL) throw new Error("NEXT_PUBLIC_AZTEC_NODE_URL is not set.");
  const [
    { createAztecNodeClient },
    { SponsoredFeePaymentMethod },
    { getContractInstanceFromInstantiationParams },
    { Fq, Fr },
    { SPONSORED_FPC_SALT },
    { SponsoredFPCContract },
    { EmbeddedWallet },
    { openTmpStore },
  ] = await Promise.all([
    import("@aztec-labs/aztec.js/node"),
    import("@aztec-labs/aztec.js/fee"),
    import("@aztec-labs/aztec.js/contracts"),
    import("@aztec-labs/foundation/curves/bn254"),
    import("@aztec-labs/constants"),
    import("@aztec-labs/noir-contracts.js/SponsoredFPC"),
    import("@aztec-labs/wallets/embedded"),
    import("@aztec-labs/kv-store/sqlite-opfs"),
  ]);

  const node = createAztecNodeClient(PUB_AZTEC_NODE_URL);
  // `ephemeral` covers only the wallet DB: the PXE would still open the origin's persistent OPFS store, which one tab at
  // a time may hold, so a second tab could not vote. An in-memory PXE store per page keeps every tab usable.
  const embedded = await EmbeddedWallet.create(node, {
    ephemeral: true,
    pxe: { proverEnabled: true, store: await openTmpStore(true) },
  });
  try {
    const storageKey = aztecAccountStorageKey(wallet);
    let stored: StoredAccount | undefined = parseStoredAccount(window.localStorage.getItem(storageKey));
    if (!stored) {
      stored = {
        secret: Fr.random().toString() as Hex,
        salt: Fr.random().toString() as Hex,
        signingKey: Fq.random().toString() as Hex,
      };
      window.localStorage.setItem(storageKey, JSON.stringify(stored));
    }
    const account = await embedded.createSchnorrInitializerlessAccount(
      Fr.fromHexString(stored.secret),
      Fr.fromHexString(stored.salt),
      Fq.fromHexString(stored.signingKey)
    );
    const fpc = await getContractInstanceFromInstantiationParams(SponsoredFPCContract.artifact, {
      salt: new Fr(SPONSORED_FPC_SALT),
    });
    await embedded.registerContract(fpc, SponsoredFPCContract.artifact);

    return {
      node,
      wallet: embedded,
      address: account.address,
      fee: { paymentMethod: new SponsoredFeePaymentMethod(fpc.address) },
      rollupVersion: await node.getVersion(),
      l1ChainId: await node.getChainId(),
      stop: () => embedded.stop(),
    };
  } catch (error) {
    await embedded.stop();
    throw error;
  }
}

const votesClients = new WeakMap<AztecSession, Map<string, Promise<CrispAztecVotes>>>();

/** The `CrispAztecVotes` contract as this session's account calls it. */
export function getAztecVotes(session: AztecSession, contract: Hex): Promise<CrispAztecVotes> {
  const perSession = votesClients.get(session) ?? new Map<string, Promise<CrispAztecVotes>>();
  votesClients.set(session, perSession);
  let client = perSession.get(contract);
  if (!client) {
    client = import("@crisp-e3/aztec").then(({ CrispAztecVotes }) => CrispAztecVotes.connect(session, contract));
    perSession.set(contract, client);
    client.catch(() => perSession.delete(contract));
  }
  return client;
}
