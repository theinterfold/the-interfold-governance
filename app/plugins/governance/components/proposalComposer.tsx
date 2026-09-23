import { Button, TextAreaRichText } from "@aragon/ods";
import { useId, useRef, useState, type ReactNode } from "react";
import { MainSection } from "@/components/layout/main-section";
import { Disclosure } from "@/components/motion/Disclosure";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { NewActionDialog, type NewActionType } from "@/components/dialogs/NewActionDialog";
import { ProposalActions } from "@/components/proposalActions/proposalActions";
import { formatDurationSeconds } from "@/plugins/spp/components/stageDurationNote";
import { downloadAsFile } from "@/utils/download-as-file";
import { encodeActionsAsJson } from "@/utils/json-actions";
import type { ProposalDraft, ProposalKind } from "../hooks/useProposalDraft";

type Props = ProposalDraft & {
  kind: ProposalKind;
  onKindChange?: (kind: ProposalKind) => void;
  durationSeconds?: number;
  isCreating: boolean;
  canSubmit: boolean;
  submitProposal: () => void;
  fee?: ReactNode;
  renderEditor: (editor: ReactNode) => ReactNode;
};

const actionTypes: { type: NewActionType; title: string; description: string }[] = [
  { type: "withdrawal", title: "Payment", description: "Send funds from the DAO" },
  { type: "select-abi-function", title: "Contract call", description: "Choose a contract function" },
  { type: "calldata", title: "Raw calldata", description: "Add an encoded call" },
  { type: "import-json", title: "Import JSON", description: "Load an existing set of actions" },
];

export function ProposalComposer(props: Props) {
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
    kind,
    onKindChange,
    durationSeconds,
    isCreating,
    canSubmit,
    submitProposal,
    fee,
    renderEditor,
  } = props;
  const id = useId();
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [addActionType, setAddActionType] = useState<NewActionType>("");
  const actionTrigger = useRef<HTMLButtonElement | null>(null);

  const editor = (
    <div className="composer-editor">
      <div className="composer-field composer-title-field">
        <label htmlFor={`${id}-title`}>Title</label>
        <input
          id={`${id}-title`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Give your proposal a title"
          maxLength={100}
          readOnly={isCreating}
          required={true}
        />
      </div>
      <div className="composer-field">
        <div className="composer-field-heading">
          <label htmlFor={`${id}-summary`}>Summary</label>
          <span className="composer-count" aria-hidden="true">
            {summary.length} / 280
          </span>
        </div>
        <textarea
          id={`${id}-summary`}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="What should change, and why?"
          maxLength={280}
          rows={2}
          readOnly={isCreating}
          required={true}
        />
      </div>
      <div className="composer-body">
        <TextAreaRichText
          label="Proposal details"
          value={description}
          onChange={setDescription}
          disabled={isCreating}
          immediatelyRender={false}
          placeholder="Explain the proposal, its rationale and the intended outcome…"
        />
      </div>

      <section className="composer-disclosure">
        <h2>
          <button
            type="button"
            className="composer-section-trigger"
            aria-expanded={resourcesOpen}
            aria-controls={`${id}-resources`}
            onClick={() => setResourcesOpen(!resourcesOpen)}
          >
            <span>
              Supporting links <span className="composer-section-note">{resources.length || "Optional"}</span>
            </span>
            <span className="composer-plus" data-open={resourcesOpen} aria-hidden="true" />
          </button>
        </h2>
        <Disclosure open={resourcesOpen} id={`${id}-resources`}>
          <div className="composer-section-content">
            <FluidHeight>
              <div className="composer-resources">
                {resources.map((resource, index) => (
                  <div className="composer-resource" key={index}>
                    <div className="composer-field">
                      <label htmlFor={`${id}-resource-${index}-name`}>Link name</label>
                      <input
                        id={`${id}-resource-${index}-name`}
                        value={resource.name}
                        placeholder="Discussion or document"
                        readOnly={isCreating}
                        onChange={(event) =>
                          setResources(
                            resources.map((item, i) => (i === index ? { ...item, name: event.target.value } : item))
                          )
                        }
                      />
                    </div>
                    <div className="composer-field">
                      <label htmlFor={`${id}-resource-${index}-url`}>URL</label>
                      <input
                        id={`${id}-resource-${index}-url`}
                        type="url"
                        value={resource.url}
                        placeholder="https://…"
                        readOnly={isCreating}
                        onChange={(event) =>
                          setResources(
                            resources.map((item, i) => (i === index ? { ...item, url: event.target.value } : item))
                          )
                        }
                      />
                    </div>
                    <button
                      type="button"
                      className="composer-remove"
                      disabled={isCreating}
                      aria-label={`Remove link ${index + 1}`}
                      onClick={() => setResources(resources.filter((_, i) => i !== index))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </FluidHeight>
            <button
              type="button"
              className="composer-text-button"
              disabled={isCreating}
              onClick={() => setResources([...resources, { name: "", url: "" }])}
            >
              + Add link
            </button>
          </div>
        </Disclosure>
      </section>

      <section className="composer-disclosure">
        <h2>
          <button
            type="button"
            className="composer-section-trigger"
            aria-expanded={actionsOpen}
            aria-controls={`${id}-actions`}
            onClick={() => setActionsOpen(!actionsOpen)}
          >
            <span>
              DAO actions <span className="composer-section-note">{actions.length || "Optional"}</span>
            </span>
            <span className="composer-plus" data-open={actionsOpen} aria-hidden="true" />
          </button>
        </h2>
        <Disclosure open={actionsOpen} id={`${id}-actions`}>
          <div className="composer-section-content">
            <p className="composer-help">
              Add the transactions this proposal should execute if it passes. Leave empty for a signaling vote.
            </p>
            <FluidHeight>
              {actions.length > 0 && (
                <div className="composer-actions">
                  <ProposalActions
                    actions={actions}
                    compact={true}
                    onRemove={isCreating ? undefined : (index) => setActions(actions.filter((_, i) => i !== index))}
                  />
                  <button
                    type="button"
                    className="composer-text-button"
                    onClick={() => downloadAsFile("actions.json", encodeActionsAsJson(actions), "text/json")}
                  >
                    Export JSON ↗
                  </button>
                </div>
              )}
            </FluidHeight>
            <div className="composer-action-types">
              {actionTypes.map((action) => (
                <button
                  type="button"
                  key={action.type}
                  disabled={isCreating}
                  onClick={(event) => {
                    actionTrigger.current = event.currentTarget;
                    setAddActionType(action.type);
                  }}
                >
                  <span>
                    <strong>{action.title}</strong>
                    <small>{action.description}</small>
                  </span>
                  <span aria-hidden="true">+</span>
                </button>
              ))}
            </div>
          </div>
        </Disclosure>
      </section>
      <NewActionDialog
        newActionType={addActionType}
        triggerRef={actionTrigger}
        onClose={(newActions) => {
          if (newActions) setActions([...actions, ...newActions]);
          setAddActionType("");
        }}
      />
    </div>
  );

  return (
    <MainSection>
      <div className="proposal-composer">
        <header className="composer-header">
          <a href="#/" className="composer-back">
            ← Proposals
          </a>
          <h1 className="display-title">New proposal</h1>
        </header>
        <div className="composer-layout">
          {renderEditor(editor)}
          <aside className="composer-sidebar" aria-label="Voting and submission">
            <FluidHeight>
              <div className="composer-sidebar-content">
                <section className="composer-voting">
                  <h2 className="composer-label">Voting method</h2>
                  {onKindChange ? (
                    <div className="composer-methods" role="radiogroup" aria-label="Voting method">
                      <label className="composer-method" data-selected={kind === "private"}>
                        <input
                          type="radio"
                          name={`${id}-method`}
                          checked={kind === "private"}
                          disabled={isCreating}
                          onChange={() => onKindChange("private")}
                        />
                        <span>
                          Secret ballot <small>Standard</small>
                        </span>
                      </label>
                      <label className="composer-method" data-selected={kind === "public"}>
                        <input
                          type="radio"
                          name={`${id}-method`}
                          checked={kind === "public"}
                          disabled={isCreating}
                          onChange={() => onKindChange("public")}
                        />
                        <span>Transparent fallback</span>
                      </label>
                    </div>
                  ) : (
                    <p className="composer-method-name">
                      {kind === "private" ? "Secret ballot" : "Transparent fallback"}
                    </p>
                  )}
                  <p className="composer-help composer-method-description">
                    {kind === "private"
                      ? "Individual votes stay private. Results are revealed after voting closes."
                      : "Only for when a secret ballot cannot run. Individual votes and the running tally are public."}
                  </p>
                </section>
                <section className="composer-timing">
                  <div className="composer-summary-line">
                    <h2>Voting period</h2>
                    <span>{durationSeconds === undefined ? "Loading…" : formatDurationSeconds(durationSeconds)}</span>
                  </div>
                  <p className="composer-help">
                    Starts when the proposal is created, followed by the foundation veto window.
                  </p>
                </section>
                {fee}
                <div className="composer-submit">
                  <Button
                    isLoading={isCreating}
                    disabled={!canSubmit}
                    size="lg"
                    variant="primary"
                    onClick={submitProposal}
                  >
                    Submit proposal
                  </Button>
                  <p className="composer-help">
                    {actions.length
                      ? `${actions.length} DAO ${actions.length === 1 ? "action" : "actions"} attached.`
                      : "Signaling vote · No DAO actions"}
                  </p>
                </div>
              </div>
            </FluidHeight>
          </aside>
        </div>
      </div>
    </MainSection>
  );
}
