import { TextAreaRichText } from "@aragon/ods";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MainSection } from "@/components/layout/main-section";
import { ActionButton } from "@/components/input/actionButton";
import { ActionIcon } from "@/components/input/actionIcon";
import { FieldError } from "@/components/input/fieldError";
import { BendingChevron } from "@/vendor/site-header";
import { Disclosure } from "@/components/motion/Disclosure";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { NewActionDialog, type NewActionType } from "@/components/dialogs/NewActionDialog";
import { ProposalActions } from "@/components/proposalActions/proposalActions";
import { formatDurationSeconds } from "@/plugins/spp/components/stageDurationNote";
import { downloadAsFile } from "@/utils/download-as-file";
import { encodeActionsAsJson } from "@/utils/json-actions";
import type { ProposalDraft, ProposalKind } from "../hooks/useProposalDraft";
import { ProposalCreationRequirement, type CreationRequirement } from "./proposalCreationRequirement";
import { validateProposalDetails, type ProposalField } from "../utils/proposalValidation";

type Props = ProposalDraft & {
  kind: ProposalKind;
  onKindChange?: (kind: ProposalKind) => void;
  durationSeconds?: number;
  isCreating: boolean;
  canSubmit: boolean;
  /** An extra reason to hold Submit back (e.g. an unfundable fee) on top of `canSubmit`. */
  submitDisabled?: boolean;
  creationRequirement: CreationRequirement;
  submitProposal: () => void;
  fee?: ReactNode;
  /** The method's own schedule copy; replaces the default start-and-veto note under the voting period. */
  schedule?: ReactNode;
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
    submitDisabled = false,
    creationRequirement,
    submitProposal,
    fee,
    schedule,
    renderEditor,
  } = props;
  const id = useId();
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [addActionType, setAddActionType] = useState<NewActionType>("");
  const actionTrigger = useRef<HTMLButtonElement | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const errors = validationAttempt ? validateProposalDetails({ title, summary, resources }) : [];
  const fieldErrors = new Map(errors.map(({ field, message }) => [field, message]));
  const hasResourceErrors = errors.some(({ field }) => field.startsWith("resource-"));
  const validationProps = (field: ProposalField) => ({
    "aria-invalid": fieldErrors.has(field) || undefined,
    "aria-describedby": fieldErrors.has(field) ? `${id}-${field}-error` : undefined,
  });

  useEffect(() => {
    if (!validationAttempt) return;
    // Focus after React has exposed any invalid fields in Supporting links.
    const frame = requestAnimationFrame(() => {
      const field = composerRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        'input[aria-invalid="true"], textarea[aria-invalid="true"]'
      );
      if (!field) return;
      field.focus({ preventScroll: true });
      field.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [validationAttempt]);

  const handleSubmit = () => {
    if (!canSubmit || submitDisabled || isCreating) return;
    const problems = validateProposalDetails({ title, summary, resources });
    setValidationAttempt((attempt) => attempt + 1);
    if (problems.length) {
      if (problems.some(({ field }) => field.startsWith("resource-"))) setResourcesOpen(true);
      return;
    }
    submitProposal();
  };

  const editor = (
    <div className="composer-editor">
      <section className="composer-writing" aria-label="Proposal content">
        <div className="composer-field composer-title-field">
          <label htmlFor={`${id}-title`}>Title</label>
          <input
            id={`${id}-title`}
            {...validationProps("title")}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Give your proposal a title"
            maxLength={100}
            readOnly={isCreating}
            required={true}
          />
          <FieldError id={`${id}-title-error`} message={fieldErrors.get("title")} />
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
            {...validationProps("summary")}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="What should change, and why?"
            maxLength={280}
            rows={2}
            readOnly={isCreating}
            required={true}
          />
          <FieldError id={`${id}-summary-error`} message={fieldErrors.get("summary")} />
        </div>
        <div className="composer-body">
          <TextAreaRichText
            label="Description"
            value={description}
            onChange={setDescription}
            disabled={isCreating}
            immediatelyRender={false}
            placeholder="Explain the proposal, its rationale and the intended outcome…"
          />
        </div>
      </section>

      <section className="composer-disclosure">
        <h2>
          <button
            type="button"
            className="composer-section-trigger"
            data-invalid={hasResourceErrors || undefined}
            aria-expanded={resourcesOpen}
            aria-controls={`${id}-resources`}
            onClick={() => setResourcesOpen(!resourcesOpen)}
          >
            <span>
              Supporting links <span className="composer-section-note">{resources.length || "Optional"}</span>
            </span>
            <BendingChevron open={resourcesOpen} />
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
                        {...validationProps(`resource-${index}-name`)}
                        value={resource.name}
                        placeholder="Discussion or document"
                        readOnly={isCreating}
                        onChange={(event) =>
                          setResources(
                            resources.map((item, i) => (i === index ? { ...item, name: event.target.value } : item))
                          )
                        }
                      />
                      <FieldError
                        id={`${id}-resource-${index}-name-error`}
                        message={fieldErrors.get(`resource-${index}-name`)}
                      />
                    </div>
                    <div className="composer-field">
                      <label htmlFor={`${id}-resource-${index}-url`}>URL</label>
                      <input
                        id={`${id}-resource-${index}-url`}
                        {...validationProps(`resource-${index}-url`)}
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
                      <FieldError
                        id={`${id}-resource-${index}-url-error`}
                        message={fieldErrors.get(`resource-${index}-url`)}
                      />
                    </div>
                    <button
                      type="button"
                      className="composer-remove"
                      disabled={isCreating}
                      aria-label={`Remove link ${index + 1}`}
                      onClick={() => setResources(resources.filter((_, i) => i !== index))}
                    >
                      <ActionIcon name="close" />
                    </button>
                  </div>
                ))}
              </div>
            </FluidHeight>
            <ActionButton
              type="button"
              affordance="plus"
              disabled={isCreating}
              onClick={() => setResources([...resources, { name: "", url: "" }])}
            >
              Add link
            </ActionButton>
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
            <BendingChevron open={actionsOpen} />
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
                  <ActionButton
                    type="button"
                    onClick={() => downloadAsFile("actions.json", encodeActionsAsJson(actions), "text/json")}
                  >
                    Export JSON
                  </ActionButton>
                </div>
              )}
            </FluidHeight>
            <div className="composer-action-types">
              {actionTypes.map((action) => (
                <ActionButton
                  type="button"
                  key={action.type}
                  affordance="plus"
                  align="start"
                  disabled={isCreating}
                  onClick={(event) => {
                    actionTrigger.current = event.currentTarget;
                    setAddActionType(action.type);
                  }}
                >
                  <span className="composer-action-type-copy">
                    <strong>{action.title}</strong>
                    <small>{action.description}</small>
                  </span>
                </ActionButton>
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
      <div className="proposal-composer" ref={composerRef}>
        <header className="composer-header">
          <a href="#/" className="composer-back">
            ← Proposals
          </a>
          <h1 className="ui-card-title">New proposal</h1>
          <p className="ui-body">Describe the decision and choose how the community will vote.</p>
        </header>
        <div className="composer-layout">
          {renderEditor(editor)}
          <aside className="composer-sidebar" aria-label="Voting and submission">
            <FluidHeight>
              <div className="composer-sidebar-content">
                <section className="composer-voting">
                  <h2 className="ui-section-title">Voting method</h2>
                  {onKindChange ? (
                    <div
                      className="vote-choices composer-methods"
                      role="radiogroup"
                      aria-label="Voting method"
                      aria-describedby={`${id}-method-description`}
                    >
                      <label
                        className={`vote-choice composer-method ${kind === "private" ? "selected" : ""}`}
                        data-disabled={isCreating}
                      >
                        <input
                          className="sr-only"
                          type="radio"
                          aria-label="Secret ballot"
                          name={`${id}-method`}
                          checked={kind === "private"}
                          disabled={isCreating}
                          onChange={() => onKindChange("private")}
                        />
                        <span className="label">
                          Secret ballot <small>Standard</small>
                        </span>
                        <span className="mark" aria-hidden="true">
                          {kind === "private" && <ActionIcon name="check" />}
                        </span>
                      </label>
                      <label
                        className={`vote-choice composer-method ${kind === "public" ? "selected" : ""}`}
                        data-disabled={isCreating}
                      >
                        <input
                          className="sr-only"
                          type="radio"
                          aria-label="Transparent fallback"
                          name={`${id}-method`}
                          checked={kind === "public"}
                          disabled={isCreating}
                          onChange={() => onKindChange("public")}
                        />
                        <span className="label">Transparent fallback</span>
                        <span className="mark" aria-hidden="true">
                          {kind === "public" && <ActionIcon name="check" />}
                        </span>
                      </label>
                    </div>
                  ) : (
                    <p className="composer-method-name">
                      {kind === "private" ? "Secret ballot" : "Transparent fallback"}
                    </p>
                  )}
                  <p id={`${id}-method-description`} className="composer-help composer-method-description">
                    {kind === "private"
                      ? "Individual votes stay private. Results are revealed after voting closes."
                      : "Only for when a secret ballot cannot run. Individual votes and the running tally are public."}
                  </p>
                  <div className="composer-timing">
                    <div className="composer-summary-line">
                      <h3>Voting period</h3>
                      <span>{durationSeconds === undefined ? "Loading…" : formatDurationSeconds(durationSeconds)}</span>
                    </div>
                    {schedule ?? (
                      <p className="composer-help">
                        Starts when the proposal is created, followed by the foundation veto window.
                      </p>
                    )}
                  </div>
                </section>
                {fee}
                <section className="composer-submit">
                  <h2 className="ui-section-title">Voting power</h2>
                  <ProposalCreationRequirement {...creationRequirement} />
                  <ActionButton isLoading={isCreating} disabled={!canSubmit || submitDisabled} intent="confirm" onClick={handleSubmit}>
                    Submit proposal
                  </ActionButton>
                  {errors.length > 0 && (
                    <p className="ui-field-error" role="alert">Complete the highlighted fields to continue.</p>
                  )}
                  <p className="composer-help">
                    {actions.length
                      ? `${actions.length} DAO ${actions.length === 1 ? "action" : "actions"} attached.`
                      : "Signaling vote · No DAO actions"}
                  </p>
                </section>
              </div>
            </FluidHeight>
          </aside>
        </div>
      </div>
    </MainSection>
  );
}
