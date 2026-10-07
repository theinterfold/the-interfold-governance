import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as renderMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { createConfig, WagmiProvider } from "wagmi";
import { custom } from "viem";
import { mainnet } from "viem/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BallotEligibilityNotice } from "../components/proposalVoting/ballotEligibility";
import { ProposalVoting } from "../components/proposalVoting/proposalVoting";
import { VoteCard, type VoteCardProps } from "../plugins/crispVoting/components/vote/voteCard";
import type { ITransformedStage } from "../utils/types";
import { SubmittedVoteCard } from "../plugins/crispVoting/components/vote/submittedVoteCard";
import { MaskExploration } from "../dev/maskExploration";
import { DESIGN_PREVIEW } from "../dev/previewMode";

const config = createConfig({
  chains: [mainnet],
  transports: {
    [mainnet.id]: custom({
      request: async () => {
        throw new Error("No network in rendering tests");
      },
    }),
  },
  ssr: true,
});
function renderToStaticMarkup(node: ReactNode) {
  return renderMarkup(
    <WagmiProvider config={config}>
      <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
    </WagmiProvider>
  );
}

const notice = <BallotEligibilityNotice connected={true} canVote={false} votingPower={0n} />;
const now = Math.floor(Date.now() / 1000);
const privateProps: VoteCardProps = {
  options: ["Yes", "No", "Abstain"],
  getMaskRecipients: async () => [],
  getVoteWeight: async () => ({
    roundId: 1n,
    voter: "0x0000000000000000000000000000000000000001",
    available: 1000n,
    counted: 995n,
    randomize: true,
    decimals: 1,
  }),
  onPrepareVote: async () => ({ success: true, txHash: null }),
  getRandomMaskTarget: async () => "0x0000000000000000000000000000000000000001",
  onClickVote: async () => ({ success: true, txHash: null }),
  onClickMask: async () => ({ success: true, txHash: null }),
  voteStartDate: now - 60,
  voteEndDate: now + 3600,
  disabled: false,
  isLoading: false,
  proposalId: 1n,
  votingStep: "idle",
  lastActiveStep: null,
  stepMessage: "",
  isCommitteeReady: true,
  txHash: null,
  eligibilityNotice: notice,
};
const stage = { status: "active", variant: "majorityVoting", votes: [] } as unknown as ITransformedStage;

describe("Ballot eligibility rendering", () => {
  test.skipIf(!DESIGN_PREVIEW)(
    "the integrated disconnected ballot exposes connection instead of fixture voting power or mask controls",
    () => {
      const html = renderToStaticMarkup(
        <MaskExploration variant="paths" changingVote={false} inSite={true} canVote={false} />
      );
      expect(html).toContain("Connect wallet");
      expect(html).not.toContain('role="radiogroup"');
      expect(html).not.toContain("49,750");
      expect(html).not.toContain("50,000");
      expect(html).not.toContain("Review mask");
      expect(html).not.toContain("sending wallet has no voting power");
    }
  );
  test("a secret ballot without snapshot eligibility hides vote choices but preserves standalone masking", () => {
    const html = renderToStaticMarkup(<VoteCard {...privateProps} voteDisabled={true} canMask={true} />);
    expect(html).toContain("No voting power for this proposal");
    expect(html).not.toContain('role="radiogroup"');
    expect(html).not.toContain("Submit encrypted ballot");
    expect(html).not.toContain("Select an option");
    expect(html).toContain("Submit a mask");
    expect(html).toContain("Add cover for an eligible voter");
  });

  test("an unresolved secret ballot shows neither voting nor masking controls", () => {
    const html = renderToStaticMarkup(
      <VoteCard
        {...privateProps}
        voteDisabled={true}
        canMask={false}
        eligibilityNotice={<BallotEligibilityNotice connected={true} />}
      />
    );
    expect(html).toContain("Checking voting eligibility");
    expect(html).not.toContain('role="radiogroup"');
    expect(html).not.toContain("Submit a mask");
  });

  test("an eligible secret voter can add a mask independently of the voting choices", () => {
    const html = renderToStaticMarkup(<VoteCard {...privateProps} voteDisabled={false} />);
    for (const option of ["Yes", "No", "Abstain"]) expect(html).toContain(`aria-label="${option}"`);
    expect(html).not.toContain('value="mask"');
    expect(html).toContain("Send a mask");
    expect(html).toContain("Add cover for voters, with or without a vote.");
    expect(html).not.toContain("No voting power for this proposal");
  });

  test("a public ballot without eligibility has no voting form or irrelevant mask control", () => {
    const html = renderToStaticMarkup(
      <ProposalVoting
        stage={stage}
        proposalTitle="Proposal"
        canVote={false}
        eligibilityNotice={notice}
        canChangeVote={false}
        confirmed={false}
      />
    );
    expect(html).toContain("No voting power for this proposal");
    expect(html).not.toContain('role="radiogroup"');
    expect(html).not.toContain("Select an option");
    expect(html).not.toContain("Submit a mask");
  });

  test("a public vote receipt remains visible when another vote is no longer allowed", () => {
    const html = renderToStaticMarkup(
      <ProposalVoting
        stage={stage}
        proposalTitle="Proposal"
        canVote={false}
        eligibilityNotice={notice}
        canChangeVote={false}
        confirmed={false}
        submittedOption={1}
      />
    );
    expect(html).toContain("Vote submitted");
    expect(html).toContain("No</strong>");
    expect(html).not.toContain("No voting power for this proposal");
    expect(html).not.toContain("Change vote");
  });

  test("failed reads are not described as zero voting power", () => {
    const html = renderToStaticMarkup(<BallotEligibilityNotice connected={true} failed={true} />);
    expect(html).toContain("Could not check voting eligibility");
    expect(html).not.toContain("No voting power");
  });

  test("a vote sent from another wallet shows success and both roles, without reopening voting", () => {
    const html = renderToStaticMarkup(
      <SubmittedVoteCard
        onSwitchWallet={async () => {}}
        receipt={{
          voter: "0x1111111111111111111111111111111111111111",
          sender: "0x2222222222222222222222222222222222222222",
          txHash: null,
        }}
        walletAddress="0x2222222222222222222222222222222222222222"
        canChangeVote={true}
        onChangeVote={() => {
          throw new Error("Rendering must not reopen the ballot");
        }}
      />
    );
    expect(html).toContain("Vote submitted successfully");
    expect(html).toContain("Vote counts for");
    expect(html).toContain("Your vote counts for the wallet that signed it.");
    expect(html).toContain("0x1111...1111");
    expect(html).toContain("Sent by");
    expect(html).toContain("0x2222...2222");
    expect(html).toContain("Change vote");
    expect(html).not.toContain('role="radiogroup"');
    expect(html).not.toContain("No voting power");
  });

  test("reconnecting the signing wallet keeps success visible until Change vote is chosen", () => {
    const html = renderToStaticMarkup(
      <SubmittedVoteCard
        onSwitchWallet={async () => {}}
        receipt={{ voter: "0x1111111111111111111111111111111111111111", txHash: null }}
        walletAddress="0x1111111111111111111111111111111111111111"
        canChangeVote={true}
        onChangeVote={() => {
          throw new Error("Changing accounts must not reopen the ballot");
        }}
      />
    );
    expect(html).toContain("Vote submitted successfully");
    expect(html).toContain("Change vote");
    expect(html).not.toContain('role="radiogroup"');
  });

  test("a closed proposal preserves confirmation without offering to change the vote", () => {
    const html = renderToStaticMarkup(
      <SubmittedVoteCard
        onSwitchWallet={async () => {}}
        receipt={{ voter: "0x1111111111111111111111111111111111111111", txHash: null }}
        canChangeVote={false}
        onChangeVote={() => {}}
      />
    );
    expect(html).toContain("Vote submitted successfully");
    expect(html).not.toContain("Change vote");
  });
});
