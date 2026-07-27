import { AlertInline, Button, IconType, InputText, Tag, TextAreaRichText } from "@aragon/ods";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import React, { type ReactNode, useState } from "react";
import type { Address } from "viem";
import { useAccount } from "wagmi";
import { AddActionCard } from "@/components/cards/AddActionCard";
import { NewActionDialog, type NewActionType } from "@/components/dialogs/NewActionDialog";
import { Else, ElseIf, If, Then } from "@/components/if";
import { DurationInput } from "@/components/input/durationInput";
import { MainSection } from "@/components/layout/main-section";
import { MissingContentView } from "@/components/MissingContentView";
import { ProposalActions } from "@/components/proposalActions/proposalActions";
import { downloadAsFile } from "@/utils/download-as-file";
import { encodeActionsAsJson } from "@/utils/json-actions";
import type { RawAction } from "@/utils/types";
import { FeeCreditCard } from "../components/feeCreditCard";
import { type CanCreateProposal, useCanCreateProposal } from "../hooks/useCanCreateProposal";
import { useCreateProposal } from "../hooks/useCreateProposal";
import { useDelegate } from "../hooks/useDelegate";

export default function Create() {
  const { address: selfAddress, isConnected } = useAccount();
  const canCreateState = useCanCreateProposal();
  const [addActionType, setAddActionType] = useState<NewActionType>("");
  const {
    title,
    summary,
    description,
    actions,
    resources,
    setTitle,
    setSummary,
    setDescription,
    setActions,
    setResources,
    isCreating,
    submitProposal,
    durationSeconds,
    setDuration,
    minDurationSeconds,
    maxDurationSeconds,
    durationError,
  } = useCreateProposal();

  const handleTitleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(event?.target?.value);
  };
  const handleSummaryInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSummary(event?.target?.value);
  };
  const handleNewActionDialogClose = (newAction: RawAction[] | null) => {
    if (!newAction) {
      setAddActionType("");
      return;
    }

    setActions(actions.concat(newAction));
    setAddActionType("");
  };
  const onRemoveAction = (idx: number) => {
    actions.splice(idx, 1);
    setActions([].concat(actions as any));
  };
  const removeResource = (idx: number) => {
    resources.splice(idx, 1);
    setResources([].concat(resources as any));
  };
  const onResourceNameChange = (event: React.ChangeEvent<HTMLInputElement>, idx: number) => {
    resources[idx].name = event.target.value;
    setResources([].concat(resources as any));
  };
  const onResourceUrlChange = (event: React.ChangeEvent<HTMLInputElement>, idx: number) => {
    resources[idx].url = event.target.value;
    setResources([].concat(resources as any));
  };

  const exportAsJson = () => {
    if (!actions.length) return;

    const strResult = encodeActionsAsJson(actions);
    downloadAsFile("actions.json", strResult, "text/json");
  };

  return (
    <MainSection narrow={true}>
      <div className="w-full justify-between">
        <div className="page-head mb-8">
          <div>
            <div className="kicker mb-3">Governance / Submit</div>
            <h1 className="display-title">New proposal</h1>
          </div>
        </div>

        <PlaceHolderOr selfAddress={selfAddress} state={canCreateState} isConnected={isConnected}>
          <p className="form-intro">
            A proposal becomes <em>active</em> the moment it is mined. Voters then have the stage-configured window to
            cast encrypted ballots — tallies decrypt only once that window closes. A passed proposal is then held for
            the foundation veto window before it can be executed.
          </p>
          <div className="mb-6">
            <InputText
              className=""
              label="Title"
              maxLength={100}
              placeholder="A short title that describes the main purpose"
              variant="default"
              value={title}
              readOnly={isCreating}
              onChange={handleTitleInput}
            />
          </div>
          <div className="mb-6">
            <InputText
              className=""
              label="Summary"
              maxLength={280}
              placeholder="A short summary that outlines the main purpose of the proposal"
              variant="default"
              value={summary}
              readOnly={isCreating}
              onChange={handleSummaryInput}
            />
          </div>
          <div className="mb-6">
            <TextAreaRichText
              label="Body"
              className="pt-2"
              value={description}
              onChange={setDescription}
              placeholder="A description of what the proposal is all about"
            />
          </div>

          <div className="mb-6 flex flex-col gap-y-2 md:gap-y-3">
            <div className="flex flex-col gap-0.5 md:gap-1">
              <div className="flex items-center gap-x-3">
                <p className="field-section-label">Resources</p>
                <Tag label="Optional" />
              </div>
              <p className="text-sm font-normal leading-normal text-neutral-500 md:text-base">
                Add links to external resources
              </p>
            </div>
            <div className="flex flex-col gap-y-4 rounded-xl border border-neutral-100 bg-neutral-0 p-4">
              <If lengthOf={resources} is={0}>
                <p className="text-sm font-normal leading-normal text-neutral-500 md:text-base">
                  There are no resources yet. Click the button below to add the first one.
                </p>
              </If>
              {resources.map((resource, idx) => {
                return (
                  <div key={idx} className="flex flex-col gap-y-3 py-3 md:py-4">
                    <div className="flex items-end gap-x-3">
                      <InputText
                        label="Resource name"
                        readOnly={isCreating}
                        value={resource.name}
                        onChange={(e) => onResourceNameChange(e, idx)}
                        placeholder="GitHub, Twitter, etc."
                      />
                      <Button
                        size="lg"
                        variant="tertiary"
                        onClick={() => removeResource(idx)}
                        iconLeft={IconType.MINUS}
                      />
                    </div>
                    <InputText
                      label="URL"
                      value={resource.url}
                      onChange={(e) => onResourceUrlChange(e, idx)}
                      placeholder="https://..."
                      readOnly={isCreating}
                    />
                  </div>
                );
              })}
            </div>
            <span className="mt-3">
              <Button
                variant="tertiary"
                size="lg"
                iconLeft={IconType.PLUS}
                disabled={isCreating}
                onClick={() => {
                  setResources(resources.concat({ url: "", name: "" }));
                }}
              >
                Add resource
              </Button>
            </span>
          </div>

          {/* Voting duration — creator-chosen per proposal, bounded by the plugin minimum
              and the stage-0 maxAdvance (minus the tally buffer). */}
          <div className="mb-6 flex flex-col gap-y-2">
            <DurationInput
              durationSeconds={durationSeconds ?? 0}
              setDurationSeconds={setDuration}
              minSeconds={minDurationSeconds ?? 0}
              disabled={isCreating}
            />
            {maxDurationSeconds !== undefined ? (
              <p className="text-sm font-normal leading-normal text-neutral-500">
                Maximum {Math.floor(maxDurationSeconds / 86400)}d {Math.floor((maxDurationSeconds % 86400) / 3600)}h —
                the tally must be published before the proposal expires.
              </p>
            ) : null}
            <If true={!!durationError}>
              <AlertInline message={durationError ?? ""} variant="critical" />
            </If>
          </div>

          {/* Creator-pays E3 fee escrow */}
          <FeeCreditCard disabled={isCreating} durationSeconds={durationSeconds} />

          {/* Actions */}
          <ProposalActions
            actions={actions}
            emptyListDescription="The proposal has no actions defined yet. Select a type of action to add to the proposal."
            onRemove={(idx) => onRemoveAction(idx)}
          />

          <If lengthOf={actions} above={0}>
            <Button
              className="mt-6"
              iconLeft={IconType.RICHTEXT_LIST_UNORDERED}
              size="lg"
              variant="tertiary"
              onClick={() => exportAsJson()}
            >
              Export actions as JSON
            </Button>
          </If>

          <div className="mt-8 grid w-full grid-cols-2 gap-4 md:grid-cols-4">
            <AddActionCard
              title="Add a payment"
              icon={IconType.WITHDRAW}
              disabled={isCreating}
              onClick={() => setAddActionType("withdrawal")}
            />
            <AddActionCard
              title="Add a function call"
              icon={IconType.BLOCKCHAIN_BLOCKCHAIN}
              disabled={isCreating}
              onClick={() => setAddActionType("select-abi-function")}
            />
            <AddActionCard
              title="Add raw calldata"
              icon={IconType.COPY}
              disabled={isCreating}
              onClick={() => setAddActionType("calldata")}
            />
            <AddActionCard
              title="Import JSON actions"
              disabled={isCreating}
              icon={IconType.RICHTEXT_LIST_UNORDERED}
              onClick={() => setAddActionType("import-json")}
            />
          </div>

          {/* Dialog */}

          <NewActionDialog
            newActionType={addActionType}
            onClose={(newActions) => handleNewActionDialogClose(newActions)}
          />

          {/* Submit */}

          <div className="actions-row">
            <Button isLoading={isCreating} size="lg" variant="primary" onClick={() => submitProposal()}>
              <If lengthOf={actions} above={0}>
                <Then>Submit proposal</Then>
                <Else>Submit signaling proposal</Else>
              </If>
            </Button>
            <div className="flex-1" />
            <span className="gas-note">Encrypted on-chain ballot</span>
          </div>
        </PlaceHolderOr>
      </div>
    </MainSection>
  );
}

const PlaceHolderOr = ({
  selfAddress,
  isConnected,
  state,
  children,
}: {
  selfAddress: Address | undefined;
  isConnected: boolean;
  state: CanCreateProposal;
  children: ReactNode;
}) => {
  const { open } = useWeb3Modal();
  const { selfDelegate, isDelegating } = useDelegate(state.votingToken, state.refetch);

  return (
    <If true={!selfAddress || !isConnected}>
      <Then>
        {/* Not connected */}
        <MissingContentView callToAction="Connect wallet" onClick={() => open()}>
          Please connect your wallet to continue.
        </MissingContentView>
      </Then>
      <ElseIf true={state.isLoading}>
        {/* Reading on-chain voting power */}
        <MissingContentView>Checking your voting power…</MissingContentView>
      </ElseIf>
      <ElseIf true={state.needsDelegation}>
        {/* Holds tokens but hasn't delegated — self-delegation activates voting power */}
        <MissingContentView callToAction="Delegate to myself" isLoading={isDelegating} onClick={() => selfDelegate()}>
          You hold voting tokens, but they aren&apos;t delegated yet — so your voting power reads as zero on-chain and
          you can&apos;t create a proposal. Delegate to yourself once to activate it. This is a one-time transaction.
        </MissingContentView>
      </ElseIf>
      <ElseIf true={state.hasNoTokens}>
        {/* No tokens at all */}
        <MissingContentView>
          You cannot create a proposal because your account holds no FOLD voting tokens.
        </MissingContentView>
      </ElseIf>
      <ElseIf true={!state.canCreate}>
        {/* Below threshold for another reason */}
        <MissingContentView>You don&apos;t have enough voting power to create a proposal.</MissingContentView>
      </ElseIf>
      <Else>{children}</Else>
    </If>
  );
};
