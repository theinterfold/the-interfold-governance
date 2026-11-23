import { hexToBigInt, parseAbi, type Address, type Hex } from "viem";
import { PUB_AZTEC_CONTRACT_ADDRESS } from "@/constants";
import { publicClient } from "../client";
import { getAztecNode } from "./session";
import { interfoldViewsAbi } from "../../artifacts/interfoldViews";

const programAbi = parseAbi([
  "function interfold() view returns (address)",
  "function l2Program() view returns (bytes32)",
]);

export type AztecDeployment = { interfold: Address; contract: Hex };

const deployments = new Map<string, Promise<AztecDeployment>>();

/**
 * The votes contract a round's program is wired to, and the Interfold that namespaces its e3Ids. The program is the
 * round's own `e3Program`. `NEXT_PUBLIC_AZTEC_CONTRACT_ADDRESS` may name the contract, but it must be the one the program
 * reports: a different address would send ballots to a contract the program never opened a round on.
 */
export function loadAztecDeployment(program: Address): Promise<AztecDeployment> {
  const key = program.toLowerCase();
  let deployment = deployments.get(key);
  if (!deployment) {
    deployment = (async () => {
      const [interfold, l2Program] = await Promise.all([
        publicClient.readContract({ address: program, abi: programAbi, functionName: "interfold" }),
        publicClient.readContract({ address: program, abi: programAbi, functionName: "l2Program" }),
      ]);
      if (hexToBigInt(l2Program) === 0n) throw new Error("The CRISP votes program is not wired to an Aztec contract yet.");
      if (PUB_AZTEC_CONTRACT_ADDRESS && hexToBigInt(PUB_AZTEC_CONTRACT_ADDRESS) !== hexToBigInt(l2Program)) {
        throw new Error("NEXT_PUBLIC_AZTEC_CONTRACT_ADDRESS is not the Aztec contract the votes program is wired to.");
      }
      return { interfold, contract: l2Program };
    })();
    deployments.set(key, deployment);
    deployment.catch(() => deployments.delete(key));
  }
  return deployment;
}

/** What the votes contract has logged for one round, read from a node with no wallet. `inputs` is newest first. */
export async function readAztecRound(program: Address, e3Id: bigint) {
  const [{ readLogs }, { AztecAddress }, node, { interfold, contract }] = await Promise.all([
    import("@crisp-e3/aztec"),
    import("@aztec-labs/aztec.js/addresses"),
    getAztecNode(),
    loadAztecDeployment(program),
  ]);
  const address = AztecAddress.fromStringUnsafe(contract);
  const [opened, keyPublished, closed, inputs] = await Promise.all([
    readLogs(node, address, "RoundOpened", interfold, { e3Id }),
    readLogs(node, address, "KeyPublished", interfold, { e3Id }),
    readLogs(node, address, "RoundClosed", interfold, { e3Id }),
    readLogs(node, address, "InputCommitted", interfold, { e3Id }),
  ]);
  return {
    opened: opened.length > 0,
    keyPublished: keyPublished.length > 0,
    closed: closed.length > 0,
    inputs: inputs
      .map((log) => ({ index: log.index, txHash: log.origin.txHash, blockNumber: log.origin.blockNumber }))
      .sort((a, b) => b.index - a.index),
  };
}

/** Why the round takes no ballot on Aztec right now (mirrors what `open_round`, `publish_key` and `cast` enforce), if so. */
export const aztecRoundBlocker = (round: {
  opened: boolean;
  keyPublished: boolean;
  closed: boolean;
  /** Unix seconds. */
  now: number;
  inputStart: number;
  inputEnd: number;
}): string | undefined => {
  if (!round.opened) return "This round has not reached Aztec yet. Try again in a few minutes.";
  if (!round.keyPublished) return "The committee key has not reached Aztec yet, so the round is not accepting ballots.";
  if (round.closed) return "This round is closed on Aztec.";
  if (round.now < round.inputStart) return "The voting window has not opened yet.";
  if (round.now >= round.inputEnd) return "The voting window has closed.";
};

/** Throws, with the reason, unless the round accepts a ballot on Aztec right now. Reads only logs, so it needs no wallet session. */
export async function assertAztecRoundOpen(program: Address, e3Id: bigint): Promise<void> {
  const { interfold } = await loadAztecDeployment(program);
  const [round, e3] = await Promise.all([
    readAztecRound(program, e3Id),
    publicClient.readContract({ address: interfold, abi: interfoldViewsAbi, functionName: "getE3", args: [e3Id] }),
  ]);
  const blocker = aztecRoundBlocker({
    opened: round.opened,
    keyPublished: round.keyPublished,
    closed: round.closed,
    now: Math.floor(Date.now() / 1000),
    inputStart: Number(e3.inputWindow[0]),
    inputEnd: Number(e3.inputWindow[1]),
  });
  if (blocker) throw new Error(blocker);
}
