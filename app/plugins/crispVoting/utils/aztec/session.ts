import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client";
import type { CrispAztecVotes } from "@crisp-e3/aztec";
import type { Address, Hex } from "viem";
import { PUB_AZTEC_NODE_URL } from "@/constants";

/*
 * Everything that talks to Aztec lives under this folder and is imported with `import()` from event handlers and
 * query functions only. The Aztec stack (PXE, wallet, prover, the contract artifact) is tens of MB of JavaScript and
 * wasm and needs `window`, OPFS and workers, so it must never load on the server or with the first page.
 */

const nodeUrl = (): string => {
  if (!PUB_AZTEC_NODE_URL) throw new Error("NEXT_PUBLIC_AZTEC_NODE_URL is not set.");
  return PUB_AZTEC_NODE_URL;
};

let nodePromise: Promise<AztecNode> | undefined;

/** A read-only node client: enough for logs and round status, no wallet. */
export function getAztecNode(): Promise<AztecNode> {
  nodePromise ??= import("@aztec-labs/aztec.js/node").then(({ createAztecNodeClient }) => createAztecNodeClient(nodeUrl()));
  nodePromise.catch(() => (nodePromise = undefined));
  return nodePromise;
}

let connection: { key: string; votes: Promise<CrispAztecVotes> } | undefined;

/**
 * The votes contract as the connected EVM wallet's embedded Aztec account uses it. The account's keys persist in
 * localStorage per wallet, so a voter keeps one Aztec address across visits. The account is initializerless (nothing is
 * deployed) and the SponsoredFPC pays every fee, so the voter holds no Aztec funds. Transactions are proved in the
 * browser: a public network rejects unproven ones. One connection at a time, kept for every ballot of the page; connecting
 * another wallet stops the previous one.
 */
export function getAztecVotes(wallet: Address, contract: Hex): Promise<CrispAztecVotes> {
  const key = `${wallet}:${contract}`.toLowerCase();
  if (connection?.key === key) return connection.votes;
  void connection?.votes.then((previous) => previous.session.stop()).catch(() => undefined);

  const votes = connect(wallet, contract);
  connection = { key, votes };
  votes.catch(() => {
    if (connection?.votes === votes) connection = undefined;
  });
  return votes;
}

async function connect(wallet: Address, contract: Hex): Promise<CrispAztecVotes> {
  const [{ connectAztec, CrispAztecVotes }, { Fq, Fr }, { openTmpStore }] = await Promise.all([
    import("@crisp-e3/aztec"),
    import("@aztec-labs/foundation/curves/bn254"),
    import("@aztec-labs/kv-store/sqlite-opfs"),
  ]);
  const storageKey = `interfold-governance:aztec-account:v1:${wallet.toLowerCase()}`;
  const raw = window.localStorage.getItem(storageKey);
  const stored: Record<"secret" | "salt" | "signingKey", Hex> = raw
    ? JSON.parse(raw)
    : {
        secret: Fr.random().toString() as Hex,
        salt: Fr.random().toString() as Hex,
        signingKey: Fq.random().toString() as Hex,
      };
  if (!raw) window.localStorage.setItem(storageKey, JSON.stringify(stored));

  const session = await connectAztec(nodeUrl(), {
    account: {
      secret: Fr.fromHexString(stored.secret),
      salt: Fr.fromHexString(stored.salt),
      signingKey: Fq.fromHexString(stored.signingKey),
    },
    // The wallet's own PXE store is the origin's persistent OPFS store, which one tab at a time may hold, so a second tab
    // could not vote. An in-memory store per page keeps every tab usable.
    pxeStore: await openTmpStore(true),
  });
  try {
    return await CrispAztecVotes.connect(session, contract);
  } catch (error) {
    await session.stop();
    throw error;
  }
}
