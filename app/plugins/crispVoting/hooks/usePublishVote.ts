import { usePublicClient, useReadContract } from "wagmi";
import { parseAbi, type Address, type Hex } from "viem";
import { PUB_CHAIN } from "@/constants";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { awaitSuccessfulReceipt } from "../utils/awaitReceipt";
import { E3Stage } from "./useE3Status";
import { usePrivatePair } from "./usePrivatePair";
import { isVotingOpenAt } from "../utils/votingSchedule";

const pluginAbi = parseAbi(["function interfold() view returns (address)"]);

const interfoldAbi = parseAbi([
  "function getE3Stage(uint256 e3Id) view returns (uint8)",
  "struct E3 { uint256 seed; uint8 committeeSize; uint256 requestBlock; uint256[2] inputWindow; bytes32 encryptionSchemeId; address e3Program; uint8 paramSet; bytes customParams; address decryptionVerifier; address pkVerifier; bytes32 committeePublicKey; bytes32 ciphertextOutput; bytes plaintextOutput; address requester; bytes32 ciphertextCommitment; }",
  "function getE3(uint256 e3Id) view returns (E3)",
]);

const crispProgramAbi = parseAbi([
  "function publishInput(uint256 e3Id, bytes data)",
  "function inputCommitmentDeadline(uint256 e3Id) view returns (uint256)",
  "function getRoundData(uint256 e3Id) view returns (uint256 merkleRoot, bytes32 paramsHash, uint256 numOptions, uint8 creditMode, uint256 inputRoot, uint40 numberOfVotes)",
  "function censusModeOf(uint256 e3Id) view returns (uint8)",
]);

/// Mirrors `CRISPProgram.CensusMode`.
const CENSUS_MODE_ONCHAIN = 2;

/** Sends a ballot another wallet prepared. Without options, `publish` sends from the connected wallet as before. */
export type PublishOptions = {
  /** The wallet that sends and pays gas. It need not be the wallet that signed the ballot. */
  account?: Address;
  /** The CRISP program the ballot was prepared for. A round that moved to another program refuses it. */
  expectedProgram?: Address;
  /** Called with the hash as soon as the wallet broadcasts, before the receipt is awaited. */
  onSubmitted?: (hash: Hex) => void;
};

export type PublishVote = {
  /** Every precondition `publishInput` enforces is satisfied right now. */
  canPublish: boolean;
  /** Why an on-chain vote would be rejected, when it would be. */
  blockedReason?: string;
  /** Still resolving the reads needed to answer that. */
  isLoading: boolean;
  /** The program refuses a new input at this Unix time (seconds). Undefined until it is read. */
  commitmentDeadline: bigint | undefined;
  /** Submits an already-built vote payload directly to the CRISP program. */
  publish: (attestedPayload: Hex, options?: PublishOptions) => Promise<Hex>;
};

/**
 * Submits a vote straight to the CRISP program instead of handing it to the CRISP server.
 *
 * The client encrypts the ballot and generates the Noir proof locally, and the CRISP server stages
 * it (`/voting/broadcast`) and signs the availability attestation. The payload sent here is that
 * ATTESTED `InputCommitmentEnvelope` — never the client's own `encodeSolidityProof` output, which
 * lacks the attestation. The server's only other role in the existing flow is to relay that
 * payload in a transaction, so bypassing it costs the voter gas and removes a liveness dependency
 * without changing the ballot in any way.
 *
 * `publishInput` verifies the Noir proof on-chain against `e3.committeePublicKey`, so a vote that
 * reaches the tally this way cannot have been encrypted under a key the committee does not hold.
 * (It does NOT protect ballot secrecy — a ballot encrypted to the wrong key is broadcast publicly
 * before it is rejected — but it does mean a relayer cannot substitute or drop a valid vote.)
 *
 * The transaction sender is irrelevant to the program: it authenticates the ballot's signature and
 * the server's attestation, and the ballot counts for the slot it names. `options.account` therefore
 * lets a different wallet from the signer send it.
 */
export function usePublishVote(e3Id: bigint | undefined): PublishVote {
  const client = usePublicClient();
  const { body } = usePrivatePair();
  const enabled = e3Id !== undefined;

  const { data: interfold } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: body,
    abi: pluginAbi,
    functionName: "interfold",
    query: { enabled },
  });

  const interfoldAddress = interfold as Address | undefined;

  const { data: e3 } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: interfoldAddress,
    abi: interfoldAbi,
    functionName: "getE3",
    args: [e3Id ?? 0n],
    query: { enabled: enabled && !!interfoldAddress },
  });

  const { data: stageRaw } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: interfoldAddress,
    abi: interfoldAbi,
    functionName: "getE3Stage",
    args: [e3Id ?? 0n],
    query: { enabled: enabled && !!interfoldAddress },
  });

  // The CRISP program address comes from the E3 itself rather than configuration: the plugin
  // stores `crispProgramAddress` privately with no getter, and the E3 is the authority on which
  // program a round actually runs.
  const programAddress = (e3 as { e3Program?: Address } | undefined)?.e3Program;
  const inputWindow = (e3 as { inputWindow?: readonly [bigint, bigint] } | undefined)?.inputWindow;

  const { data: roundData } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: programAddress,
    abi: crispProgramAbi,
    functionName: "getRoundData",
    args: [e3Id ?? 0n],
    query: { enabled: enabled && !!programAddress },
  });

  const merkleRoot = (roundData as readonly [bigint, ...unknown[]] | undefined)?.[0];

  const { data: censusModeRaw } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: programAddress,
    abi: crispProgramAbi,
    functionName: "censusModeOf",
    args: [e3Id ?? 0n],
    query: { enabled: enabled && !!programAddress },
  });

  const { data: commitmentDeadline } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: programAddress,
    abi: crispProgramAbi,
    functionName: "inputCommitmentDeadline",
    args: [e3Id ?? 0n],
    query: { enabled: enabled && !!programAddress },
  });

  // An on-chain census never posts a root: `_eligibility` reads power from the token per input and
  // never consults `merkleRoot`. Requiring one would block publishing forever on exactly the mode
  // that removes the census, and report a missing root the round is never going to have.
  const requiresMerkleRoot = censusModeRaw !== undefined && Number(censusModeRaw) !== CENSUS_MODE_ONCHAIN;

  const isLoading =
    enabled &&
    (stageRaw === undefined ||
      e3 === undefined ||
      (!!programAddress &&
        (roundData === undefined || censusModeRaw === undefined || commitmentDeadline === undefined)));

  /**
   * Mirrors every guard in `publishInput` so the UI can refuse before spending gas on a revert,
   * and can say which one is the problem rather than surfacing a bare rejection.
   */
  const blockedReason = (() => {
    if (isLoading || !enabled) return undefined;
    if (!programAddress) return "The round's CRISP program could not be resolved.";
    if (stageRaw !== undefined && Number(stageRaw) !== E3Stage.KeyPublished) {
      return "The committee key has not been published yet, so the round is not accepting votes.";
    }
    if (requiresMerkleRoot && merkleRoot === 0n) {
      return "The census merkle root has not been set for this round yet.";
    }
    if (inputWindow && commitmentDeadline !== undefined) {
      const now = BigInt(Math.floor(Date.now() / 1000));
      if (now < inputWindow[0]) return "The voting window has not opened yet.";
      if (!isVotingOpenAt(now, inputWindow[0], commitmentDeadline)) return "The voting window has closed.";
    }
    return undefined;
  })();

  const { writeContractAsync } = useTransactionManager({
    onSuccessMessage: "Vote published on-chain",
    onErrorMessage: "Could not publish the vote on-chain",
  });

  const publish = async (attestedPayload: Hex, options?: PublishOptions) => {
    if (e3Id === undefined) throw new Error("No round selected");
    if (!client) throw new Error("No RPC client available");
    if (!programAddress) throw new Error("The round's CRISP program could not be resolved");
    if (blockedReason) throw new Error(blockedReason);

    // A prepared ballot can be sent long after it was staged. Check the live round again: cached
    // reads are only UI hints, and the round must still run the program that verified the ballot.
    let program = programAddress;
    if (options?.expectedProgram) {
      const live = await client.readContract({
        address: interfoldAddress!,
        abi: interfoldAbi,
        functionName: "getE3",
        args: [e3Id],
      });
      if (live.e3Program.toLowerCase() !== options.expectedProgram.toLowerCase()) {
        throw new Error(
          "The prepared ballot belongs to a different voting program. Discard it and prepare a new vote."
        );
      }
      program = live.e3Program;
    }

    const request = {
      ...(options?.account ? { account: options.account } : {}),
      chainId: PUB_CHAIN.id,
      abi: crispProgramAbi,
      address: program,
      functionName: "publishInput" as const,
      args: [e3Id, attestedPayload] as const,
    };

    // A stale slot head, an expired attestation or a closed round must fail before the sending
    // wallet is asked to pay gas.
    if (options) await client.simulateContract(request);

    const hash = await writeContractAsync(request);

    options?.onSubmitted?.(hash);
    await awaitSuccessfulReceipt(client, hash, "The vote");

    return hash;
  };

  return {
    canPublish: !isLoading && !blockedReason && !!programAddress,
    blockedReason,
    isLoading: Boolean(isLoading),
    commitmentDeadline,
    publish,
  };
}
