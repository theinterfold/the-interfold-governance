import { expect, test, describe } from "bun:test";
import { statusBucketOf, STATUS_BUCKETS } from "@/plugins/governance/utils/statusBucket";
import { getSppStatusOverride } from "@/plugins/spp/utils/status";
import { SppProposalState } from "@/plugins/spp/utils/types";

import type { SppProposal, SppStage } from "@/plugins/spp/utils/types";

// --- helpers ---------------------------------------------------------------

function proposal(over: Partial<SppProposal> = {}): SppProposal {
  return {
    allowFailureMap: 0n,
    lastStageTransition: 1n,
    currentStage: 1,
    stageConfigIndex: 0,
    executed: false,
    canceled: false,
    creator: "0x0000000000000000000000000000000000000001",
    actions: [{ to: "0x0000000000000000000000000000000000000002", value: 0n, data: "0x" }],
    targetConfig: { target: "0x0000000000000000000000000000000000000003", operation: 0 },
    ...over,
  } as SppProposal;
}

/** Stage-1 config. `vetoThreshold == 0` is what marks approval mode. */
function stage(mode: "veto" | "approval"): SppStage {
  return {
    bodies: [],
    maxAdvance: 100n,
    minAdvance: 0n,
    voteDuration: mode === "veto" ? 10n : 0n,
    approvalThreshold: mode === "approval" ? 1 : 0,
    vetoThreshold: mode === "veto" ? 1 : 0,
    cancelable: false,
    editable: false,
  } as SppStage;
}

const noTally = { approvals: 0n, vetoes: 0n };

// --- statusBucketOf --------------------------------------------------------

describe("statusBucketOf", () => {
  test("maps every label the SPP override can emit", () => {
    expect(statusBucketOf("Executed")).toBe("executed");
    expect(statusBucketOf("Executable")).toBe("accepted");
    expect(statusBucketOf("Accepted")).toBe("accepted");
    expect(statusBucketOf("Veto period")).toBe("active");
    expect(statusBucketOf("Approval period")).toBe("active");
    expect(statusBucketOf("Vetoed")).toBe("rejected");
    expect(statusBucketOf("Expired")).toBe("rejected");
    expect(statusBucketOf("Canceled")).toBe("rejected");
  });

  test("maps the body-level ProposalStatus labels", () => {
    expect(statusBucketOf("Pending")).toBe("pending");
    expect(statusBucketOf("Active")).toBe("active");
    expect(statusBucketOf("Rejected")).toBe("rejected");
  });

  test("is case- and whitespace-insensitive", () => {
    expect(statusBucketOf("  eXeCuTeD ")).toBe("executed");
  });

  test("returns undefined for unknown labels rather than guessing a bucket", () => {
    expect(statusBucketOf("Something new")).toBeUndefined();
    expect(statusBucketOf(undefined)).toBeUndefined();
    expect(statusBucketOf("")).toBeUndefined();
  });

  test("every declared bucket is reachable from some label", () => {
    const reachable = new Set(["Pending", "Active", "Accepted", "Executed", "Rejected"].map((l) => statusBucketOf(l)));
    for (const b of STATUS_BUCKETS) expect(reachable.has(b.value)).toBe(true);
  });
});

// --- getSppStatusOverride --------------------------------------------------

describe("getSppStatusOverride", () => {
  test("returns undefined while stage 0 is undecided so the body status wins", () => {
    expect(getSppStatusOverride(proposal({ currentStage: 0 }), SppProposalState.Active, noTally, stage("veto"))).toBe(
      undefined
    );
  });

  test("executed and canceled short-circuit everything", () => {
    expect(getSppStatusOverride(proposal({ executed: true }), undefined, noTally, stage("veto"))?.label).toBe(
      "Executed"
    );
    expect(getSppStatusOverride(proposal({ canceled: true }), undefined, noTally, stage("veto"))?.label).toBe(
      "Canceled"
    );
  });

  test("veto mode: a met veto threshold reads as Vetoed", () => {
    const res = getSppStatusOverride(proposal(), SppProposalState.Active, { approvals: 0n, vetoes: 1n }, stage("veto"));
    expect(res?.label).toBe("Vetoed");
    expect(statusBucketOf(res?.label)).toBe("rejected");
  });

  test("approval mode never reports Vetoed — silence is the rejection", () => {
    const res = getSppStatusOverride(
      proposal(),
      SppProposalState.Active,
      { approvals: 0n, vetoes: 5n },
      stage("approval")
    );
    expect(res?.label).toBe("Approval period");
  });

  test("labels the open window per stage-1 mode", () => {
    expect(getSppStatusOverride(proposal(), SppProposalState.Active, noTally, stage("veto"))?.label).toBe(
      "Veto period"
    );
    expect(getSppStatusOverride(proposal(), SppProposalState.Active, noTally, stage("approval"))?.label).toBe(
      "Approval period"
    );
  });

  describe("zero-action (signaling) proposals", () => {
    const signaling = () => proposal({ actions: [] });

    test("advanceable reads as Accepted, not Executable", () => {
      const res = getSppStatusOverride(signaling(), SppProposalState.Advanceable, noTally, stage("veto"));
      expect(res?.label).toBe("Accepted");
      expect(statusBucketOf(res?.label)).toBe("accepted");
    });

    test("a lapsed veto-mode window still reads as Accepted", () => {
      // Silence = consent, and there is nothing to execute, so expiry costs a poll nothing.
      const res = getSppStatusOverride(signaling(), SppProposalState.Expired, noTally, stage("veto"));
      expect(res?.label).toBe("Accepted");
    });

    test("a lapsed approval-mode window still reads as Expired", () => {
      // Here the lapse IS the rejection: the foundation never approved.
      const res = getSppStatusOverride(signaling(), SppProposalState.Expired, noTally, stage("approval"));
      expect(res?.label).toBe("Expired");
      expect(statusBucketOf(res?.label)).toBe("rejected");
    });
  });

  describe("proposals with actions", () => {
    test("advanceable reads as Executable", () => {
      expect(getSppStatusOverride(proposal(), SppProposalState.Advanceable, noTally, stage("veto"))?.label).toBe(
        "Executable"
      );
    });

    test("expired reads as Expired in both modes", () => {
      expect(getSppStatusOverride(proposal(), SppProposalState.Expired, noTally, stage("veto"))?.label).toBe("Expired");
      expect(getSppStatusOverride(proposal(), SppProposalState.Expired, noTally, stage("approval"))?.label).toBe(
        "Expired"
      );
    });
  });
});
