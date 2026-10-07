import { describe, expect, test } from "bun:test";
import { createPublicClient, parseAbi } from "viem";
import {
  PUB_CHAIN,
  PUB_CRISP_VOTING_PLUGIN_ADDRESS,
  PUB_SPP_PRIVATE_ADDRESS,
  PUB_SPP_PUBLIC_ADDRESS,
  PUB_TOKEN_ADDRESS,
} from "../constants";
import { DESIGN_PREVIEW, previewAddress } from "../dev/previewMode";
import { demoIndexer, demoSdk, demoTransport } from "../dev/fixtures";
import constitutionProposal from "../dev/snapshots/constitution-proposal.json";
import { CrispVotingAbi } from "../plugins/crispVoting/artifacts/CrispVoting";
import { StagedProposalProcessorAbi } from "../plugins/spp/artifacts/StagedProposalProcessor";

const client = createPublicClient({ chain: PUB_CHAIN, transport: demoTransport() });
const e3Abi = parseAbi([
  "struct E3 { uint256 seed; uint8 committeeSize; uint256 requestBlock; uint256[2] inputWindow; bytes32 encryptionSchemeId; address e3Program; uint8 paramSet; bytes customParams; address decryptionVerifier; address pkVerifier; bytes32 committeePublicKey; bytes32 ciphertextOutput; bytes plaintextOutput; address requester; bool proofAggregationEnabled; }",
  "function getE3(uint256 e3Id) view returns (E3)",
]);

describe.skipIf(!DESIGN_PREVIEW)("Constitution proposal design fixture", () => {
  test("E3 records for existing demo rounds still encode with the current ABI", async () => {
    for (const id of [1n, 2n]) {
      const e3 = await client.readContract({
        address: previewAddress(0xd104),
        abi: e3Abi,
        functionName: "getE3",
        args: [id],
      });
      expect(e3.proofAggregationEnabled).toBe(false);
      expect(e3.inputWindow).toHaveLength(2);
    }
  });

  test("real E3 record encodes and its eligible-voter census is explicitly unavailable", async () => {
    const e3Id = BigInt(constitutionProposal.proposal.e3Id);
    const e3 = await client.readContract({
      address: previewAddress(0xd104),
      abi: e3Abi,
      functionName: "getE3",
      args: [e3Id],
    });
    expect(e3.proofAggregationEnabled).toBe(false);
    expect(e3.inputWindow).toEqual([
      BigInt(constitutionProposal.e3.inputWindow[0]),
      BigInt(constitutionProposal.e3.inputWindow[1]),
    ]);
    await expect(demoSdk().getEligibleAddresses(e3Id)).rejects.toThrow(
      "Eligible-voter verification is not included in this demo snapshot."
    );
  });

  test("SPP links to the real body, voting dates and quorum stay exact, and no tally is published", async () => {
    const proposalId = BigInt(constitutionProposal.proposal.sppId);
    const bodyId = BigInt(constitutionProposal.proposal.bodyProposalId);
    const spp = await client.readContract({
      address: PUB_SPP_PRIVATE_ADDRESS,
      abi: StagedProposalProcessorAbi,
      functionName: "getProposal",
      args: [proposalId],
    });
    expect(spp.currentStage).toBe(0);
    expect(spp.stageConfigIndex).toBe(1);

    const linkedBodyId = await client.readContract({
      address: PUB_SPP_PRIVATE_ADDRESS,
      abi: StagedProposalProcessorAbi,
      functionName: "getBodyProposalId",
      args: [proposalId, 0, PUB_CRISP_VOTING_PLUGIN_ADDRESS],
    });
    expect(linkedBodyId).toBe(bodyId);

    const body = await client.readContract({
      address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
      abi: CrispVotingAbi,
      functionName: "getProposal",
      args: [bodyId],
    });
    expect(body.parameters.startDate).toBe(BigInt(constitutionProposal.voting.startDate));
    expect(body.parameters.endDate).toBe(BigInt(constitutionProposal.voting.endDate));
    expect(body.parameters.snapshotBlock).toBe(BigInt(constitutionProposal.voting.snapshotTimepoint));
    expect(body.tally.counts).toEqual([]);

    const supply = await client.readContract({
      address: PUB_TOKEN_ADDRESS,
      abi: parseAbi(["function getPastTotalSupply(uint256 timepoint) view returns (uint256)"]),
      functionName: "getPastTotalSupply",
      args: [BigInt(constitutionProposal.voting.snapshotTimepoint)],
    });
    expect(supply).toBe(BigInt(constitutionProposal.voting.totalVotingPower));
    expect((supply * BigInt(constitutionProposal.voting.minParticipation)) / 100n).toBe(
      BigInt(constitutionProposal.voting.requiredParticipation)
    );
  });

  test("indexer preserves both original demo routes alongside the live private proposal", () => {
    const privateRows = demoIndexer("proposals", { plugin: PUB_SPP_PRIVATE_ADDRESS }) as {
      proposals: { proposal_id: string }[];
    };
    const publicRows = demoIndexer("proposals", { plugin: PUB_SPP_PUBLIC_ADDRESS }) as {
      proposals: { proposal_id: string }[];
    };
    const privateIds = new Set(privateRows.proposals.map(({ proposal_id }) => proposal_id));
    const publicIds = new Set(publicRows.proposals.map(({ proposal_id }) => proposal_id));
    expect(privateIds).toEqual(new Set(["1", "2", constitutionProposal.proposal.sppId]));
    expect(publicIds).toEqual(new Set(["1", "2"]));
  });

  test("real round activity retains the 68 indexed encrypted inputs", () => {
    const data = demoIndexer("rounds/inputs", {
      round_id: constitutionProposal.proposal.e3Id,
      from_block: constitutionProposal.activity.scannedFrom,
    }) as { inputs: unknown[] };
    expect(data.inputs).toHaveLength(68);
  });
});
