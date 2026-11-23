import { hexToBigInt, parseAbi, type Address, type Hex } from "viem";
import { PUB_AZTEC_CONTRACT_ADDRESS } from "@/constants";
import { publicClient } from "../client";
import { getAztecNode } from "./session";
import { interfoldViewsAbi } from "../../artifacts/interfoldViews";
import { aztecRoundGate, checkAztecCommitteeKey, toActivityEntries } from "./status";

const programAbi = parseAbi([
  "function interfold() view returns (address)",
  "function l2Program() view returns (bytes32)",
]);

export type AztecDeployment = { program: Address; interfold: Address; contract: Hex };

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
      return { program, interfold, contract: l2Program };
    })();
    deployments.set(key, deployment);
    deployment.catch(() => deployments.delete(key));
  }
  return deployment;
}

/** What the votes contract has logged for one round, read from a node with no wallet. */
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
    keyPublished: keyPublished[0]?.committeePublicKey as Hex | undefined,
    closed: closed.length > 0,
    inputs: toActivityEntries(inputs),
  };
}

/**
 * Throws, with the reason, unless the round accepts a ballot on Aztec right now: opened, key published and equal to the
 * commitment Interfold published, not closed, inside the input window. Reads only logs, so it needs no wallet session.
 */
export async function assertAztecRoundOpen(program: Address, e3Id: bigint): Promise<void> {
  const { interfold } = await loadAztecDeployment(program);
  const [round, e3] = await Promise.all([
    readAztecRound(program, e3Id),
    publicClient.readContract({ address: interfold, abi: interfoldViewsAbi, functionName: "getE3", args: [e3Id] }),
  ]);
  const gate = aztecRoundGate({
    opened: round.opened,
    keyPublished: round.keyPublished !== undefined,
    closed: round.closed,
    now: Math.floor(Date.now() / 1000),
    inputStart: Number(e3.inputWindow[0]),
    inputEnd: Number(e3.inputWindow[1]),
  });
  if (!gate.open) throw new Error(gate.reason);
  const key = checkAztecCommitteeKey(round.keyPublished, e3.committeePublicKey);
  if (!key.ok) throw new Error(key.reason);
}
