import { describe, expect, test } from "bun:test";
import { ProposalStatus } from "@aragon/ods";
import { proposalPresentation } from "@/plugins/governance/utils/proposalPresentation";
import { derivePublicProposalStatus } from "@/plugins/tokenVoting/hooks/useProposalVariantStatus";
import { derivePrivateProposalStatus } from "@/plugins/crispVoting/hooks/useProposalStatus";

const base = { startMs: 100, endMs: 200, nowMs: 250 };

describe("proposal presentation", () => {
  test("a closed private vote has no outcome or tally while publication is pending", () => {
    const view = proposalPresentation({ ...base, isTallied: false, bodyStatus: ProposalStatus.PENDING });
    expect(view.label).toBe("Awaiting tally");
    expect(view.resultMessage).toBe("Voting closed. The result has not been published.");
    expect(view.showTally).toBe(false);
    expect(view.votingOpen).toBe(false);
  });

  test("a published tally with unresolved quorum does not claim passage", () => {
    expect(proposalPresentation({ ...base, bodyStatus: ProposalStatus.PENDING }).label).toBe("Confirming result");
  });

  test("a stage zero pass is distinct from DAO execution", () => {
    const view = proposalPresentation({ ...base, bodyStatus: ProposalStatus.EXECUTED });
    expect(view.label).toBe("Vote passed");
    expect(view.timing).toBe("Awaiting Foundation stage");
  });

  test("SPP terminal status takes precedence over a delayed body tally", () => {
    const view = proposalPresentation({
      ...base,
      sppOverride: { label: "Executed", className: "executed" },
      isTallied: false,
      bodyStatus: ProposalStatus.PENDING,
    });
    expect(view.label).toBe("Executed");
  });

  test("foundation approval and veto retain their distinct labels", () => {
    expect(
      proposalPresentation({ ...base, sppOverride: { label: "Foundation Approval", className: "foundation" } }).label
    ).toBe("Awaiting Foundation approval");
    expect(
      proposalPresentation({ ...base, sppOverride: { label: "Veto period", className: "foundation" } }).label
    ).toBe("Veto period");
  });

  test("stale body labels never close an open voting window", () => {
    expect(proposalPresentation({ ...base, nowMs: 150, bodyStatus: ProposalStatus.REJECTED }).votingOpen).toBe(true);
    expect(proposalPresentation({ ...base, nowMs: 150, bodyStatus: ProposalStatus.ACCEPTED }).votingOpen).toBe(true);
  });

  test("an early body execution closes stage 0 before the nominal end", () => {
    const view = proposalPresentation({ ...base, nowMs: 150, bodyStatus: ProposalStatus.EXECUTED });
    expect(view.label).toBe("Vote passed");
    expect(view.votingOpen).toBe(false);
  });

  test("the exact start and end boundaries switch the voting gate", () => {
    expect(proposalPresentation({ ...base, nowMs: 99, isTallied: false }).votingOpen).toBe(false);
    expect(proposalPresentation({ ...base, nowMs: 100, isTallied: false }).votingOpen).toBe(true);
    expect(proposalPresentation({ ...base, nowMs: 199, isTallied: false }).votingOpen).toBe(true);
    expect(proposalPresentation({ ...base, nowMs: 200, isTallied: false }).votingOpen).toBe(false);
  });

  test("pre-start and open windows are driven by their dates", () => {
    expect(proposalPresentation({ ...base, nowMs: 50, isTallied: false }).label).toBe("Pending");
    expect(proposalPresentation({ ...base, nowMs: 150, isTallied: false }).votingOpen).toBe(true);
  });
});

describe("vote status at time boundaries", () => {
  const publicProposal = {
    active: false,
    executed: false,
    parameters: { startDate: 0n, endDate: 1n, minVotingPower: 1n, supportThreshold: 500_000 },
    tally: { yes: 2n, no: 0n, abstain: 0n },
    actions: [{ to: "0x0000000000000000000000000000000000000001", value: 0n, data: "0x" }],
  } as unknown as NonNullable<Parameters<typeof derivePublicProposalStatus>[0]>;

  test("public vote moves pending → active → pending until a fresh closed read", () => {
    const proposal = { ...publicProposal, parameters: { ...publicProposal!.parameters, startDate: 1n, endDate: 2n } };
    expect(derivePublicProposalStatus(proposal, 999, 500)).toBe(ProposalStatus.PENDING);
    expect(derivePublicProposalStatus(proposal, 1_000, 500)).toBe(ProposalStatus.ACTIVE);
    expect(derivePublicProposalStatus(proposal, 2_000, 1_500)).toBe(ProposalStatus.PENDING);
    expect(derivePublicProposalStatus({ ...proposal, active: true }, 2_001, 2_001)).toBe(ProposalStatus.PENDING);
    expect(derivePublicProposalStatus(proposal, 2_001, 2_001)).toBe(ProposalStatus.EXECUTABLE);
  });

  const privateProposal = {
    active: true,
    executed: false,
    isTallied: false,
    parameters: { startDate: 1n, endDate: 2n, minParticipation: 10n, supportThreshold: 50n, creditMode: 0 },
    tally: [],
    actions: [],
  } as unknown as NonNullable<Parameters<typeof derivePrivateProposalStatus>[0]["proposal"]>;

  test("secret vote closes at its deadline even when cached active stays true", () => {
    expect(
      derivePrivateProposalStatus({ proposal: privateProposal, decimals: 18, totalVotingPower: 100n, nowMs: 999 })
    ).toBe(ProposalStatus.PENDING);
    expect(
      derivePrivateProposalStatus({ proposal: privateProposal, decimals: 18, totalVotingPower: 100n, nowMs: 1_000 })
    ).toBe(ProposalStatus.ACTIVE);
    expect(
      derivePrivateProposalStatus({ proposal: privateProposal, decimals: 18, totalVotingPower: 100n, nowMs: 2_000 })
    ).toBe(ProposalStatus.PENDING);
  });
});
