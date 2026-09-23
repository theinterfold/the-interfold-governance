import { PUB_CHAIN } from "@/constants";
import { getSimpleRelativeTimeFromDate } from "@/utils/dates";
import { AccordionItem, AccordionItemHeader, Heading, Tabs } from "@aragon/ods";
import { Tabs as RadixTabsRoot } from "@radix-ui/react-tabs";
import dayjs from "dayjs";
import { useEffect, useState, type ReactNode } from "react";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { useInert } from "@/components/motion/useInert";
import { AccordionContent } from "@/components/motion/AccordionContent";
import { VotingBreakdown, type IBreakdownMajorityVotingResult, type ProposalType } from "../votingBreakdown";
import { type IBreakdownApprovalThresholdResult } from "../votingBreakdown/approvalThresholdResult";
import { VotingDetails } from "../votingDetails";
import { VotingStageStatus } from "./votingStageStatus";
import type { IVote, IVotingStageDetails } from "@/utils/types";
import { VotesDataList } from "../votesDataList/votesDataList";

export interface IVotingStageProps<TType extends ProposalType = ProposalType> {
  title: string;
  number: number;
  disabled: boolean;
  status: "accepted" | "rejected" | "active";

  variant: TType;
  proposalId?: string;
  result?: TType extends "approvalThreshold" ? IBreakdownApprovalThresholdResult : IBreakdownMajorityVotingResult;
  details?: IVotingStageDetails;
  votes?: IVote[];
}

export const VotingStage: React.FC<IVotingStageProps> = (props) => {
  const { details, disabled, title, number, result, status, variant, votes } = props;

  const [activeTab, setActiveTab] = useState("breakdown");
  const [changingTab, setChangingTab] = useState(false);
  useEffect(() => {
    if (!changingTab) return;
    const timer = window.setTimeout(() => setChangingTab(false), 360);
    return () => window.clearTimeout(timer);
  }, [activeTab, changingTab]);
  const stageKey = `Stage ${number}`;
  const snapshotTakenAt = details?.censusBlock
    ? `Block ${details.censusBlock}`
    : details?.censusTimestamp
      ? dayjs(details.censusTimestamp * 1000).toString()
      : "";
  const snapshotBlockURL = details?.censusBlock
    ? `${PUB_CHAIN.blockExplorers?.default.url}/block/${details?.censusBlock}`
    : "";

  return (
    <AccordionItem
      key={stageKey}
      value={stageKey}
      disabled={disabled}
      className="border-t border-t-neutral-100 bg-neutral-0"
    >
      <AccordionItemHeader className="!items-start !gap-y-5">
        <div className="flex w-full gap-x-6">
          <div className="flex flex-1 flex-col items-start gap-y-2">
            <Heading size="h3" className="line-clamp-1 text-left">
              {title}
            </Heading>
            <VotingStageStatus status={status} endDate={getSimpleRelativeTimeFromDate(dayjs(details?.endDate))} />
          </div>
          <span className="hidden leading-tight text-neutral-500 sm:block">{stageKey}</span>
        </div>
      </AccordionItemHeader>

      <AccordionContent>
        <RadixTabsRoot
          value={activeTab}
          onValueChange={(value) => {
            setChangingTab(true);
            setActiveTab(value);
          }}
        >
          <Tabs.List>
            <Tabs.Trigger value="breakdown" label="Breakdown" />
            <Tabs.Trigger value="votes" label="Votes" />
            <Tabs.Trigger value="details" label="Details" />
          </Tabs.List>
          {/* Inner disclosures already animate their own height; only animate this surface when changing tabs. */}
          <FluidHeight animate={changingTab}>
            <div className="motion-tab-panels">
              <MotionTab value="breakdown" activeTab={activeTab}>
                <div className="py-4 pb-8">
                  {result && <VotingBreakdown cta={result.cta} variant={variant} result={result} />}
                </div>
              </MotionTab>
              <MotionTab value="votes" activeTab={activeTab}>
                <div className="py-4 pb-8">
                  <VotesDataList votes={votes ?? []} />
                </div>
              </MotionTab>
              <MotionTab value="details" activeTab={activeTab}>
                <div className="py-4 pb-8">
                  {details && (
                    <VotingDetails
                      startDate={details.startDate}
                      endDate={details.endDate}
                      snapshotTakenAt={snapshotTakenAt}
                      snapshotBlockURL={snapshotBlockURL}
                      tokenAddress={details.tokenAddress}
                      strategy={details.strategy}
                      options={details.options}
                    />
                  )}
                </div>
              </MotionTab>
            </div>
          </FluidHeight>
        </RadixTabsRoot>
      </AccordionContent>
    </AccordionItem>
  );
};

const TAB_ORDER = ["breakdown", "votes", "details"];

function MotionTab({ value, activeTab, children }: { value: string; activeTab: string; children: ReactNode }) {
  const active = value === activeTab;
  const ref = useInert(!active);
  return (
    <Tabs.Content
      forceMount={true}
      value={value}
      className="motion-tab-panel"
      aria-hidden={!active}
      data-direction={TAB_ORDER.indexOf(value) < TAB_ORDER.indexOf(activeTab) ? "left" : "right"}
    >
      <div ref={ref}>{children}</div>
    </Tabs.Content>
  );
}
