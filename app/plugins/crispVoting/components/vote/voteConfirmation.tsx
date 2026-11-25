import { SuccessBanner } from "@/components/alert/successBanner";
import { PUB_CHAIN } from "@/constants";
import { BallotSuccess } from "@/components/proposalVoting/ballotSuccess";
import type { BallotKind } from "../../utils/ballotSubmission";
import { Spinner } from "@aragon/ods";
import type { ReactNode } from "react";
import { ReceiptPopover } from "@/components/proposalVoting/receiptPopover";
import { TransactionLink } from "@/components/proposalVoting/transactionLink";
import { MaskSubmissionProgress } from "@/components/proposalVoting/maskSubmissionProgress";
export { VoteChangeAction } from "@/components/proposalVoting/ballotSuccess";

function ReceiptLink({ txHash, kind, label, ariaLabel }: { txHash: string | null; kind: BallotKind; label: string; ariaLabel?: string }) {
  if (!txHash) return null;
  return (
    <TransactionLink
      href={`${PUB_CHAIN.blockExplorers?.default?.url}/tx/${txHash}`}
      ariaLabel={ariaLabel ?? `View ${kind} transaction on the explorer`}
      label={label}
    />
  );
}

function MaskReceiptList({ receipts, complete = false }: { receipts: (string | null)[]; complete?: boolean }) {
  return (
    <ol className="mask-receipt-list" data-complete={complete || undefined} aria-label="Mask transactions">
      {receipts.map((hash, index) => hash && (
        <li key={`${index}-${hash}`}>
          <ReceiptLink
            txHash={hash}
            kind="mask"
            label={`Mask ${index + 1}`}
            ariaLabel={`View mask ${index + 1} transaction on the explorer`}
          />
        </li>
      ))}
    </ol>
  );
}

/** A group keeps the same transaction action, with individual receipts on demand. */
function MaskSuccessBanner({ title, receipts, secondary }: { title: string; receipts: (string | null)[]; secondary: boolean }) {
  const multiple = receipts.length > 1;
  const hasReceipts = receipts.some(Boolean);
  return (
    <SuccessBanner
      title={title}
      secondary={secondary}
      action={hasReceipts ? multiple ? (
        <ReceiptPopover><MaskReceiptList receipts={receipts} complete /></ReceiptPopover>
      ) : <ReceiptLink txHash={receipts[0]} kind="mask" label="View transaction" /> : undefined}
    />
  );
}

/** Completed masks stay visible while a saved vote changes sending wallets. */
export function MaskSubmissionSummary({ receipts }: { receipts: (string | null)[] }) {
  if (!receipts.length) return null;
  return (
    <SubmissionSummary
      busy={false}
      activeKind="mask"
      includeVote={false}
      includeMask={true}
      secondaryMasks
      first="mask"
      maskReceipts={receipts}
      maskRun={null}
      detail=""
      preparing={false}
    />
  );
}

/** The vote and masks keep their own status, with receipts attached to the submission they confirm. */
export function SubmissionSummary({
  busy,
  activeKind,
  includeVote,
  includeMask,
  first,
  voteReceipt,
  option,
  maskReceipts,
  maskRun,
  detail,
  preparing,
  voteAction,
  maskAction,
  secondaryMasks = false,
}: {
  busy: boolean;
  activeKind: BallotKind;
  includeVote: boolean;
  includeMask: boolean;
  first: BallotKind;
  voteReceipt?: { txHash: string | null; option: number | null };
  option?: string;
  maskReceipts: (string | null)[];
  maskRun: { total: number; current: number; sent: number } | null;
  detail: string;
  preparing: boolean;
  voteAction?: ReactNode;
  maskAction?: ReactNode;
  secondaryMasks?: boolean;
}) {
  const order: BallotKind[] = !voteReceipt && first === "mask" ? ["mask", "vote"] : ["vote", "mask"];
  return (
    <div className="vp-submission-blocks" aria-live="polite">
      {order.map((kind) => {
        if (kind === "vote" ? !includeVote : !includeMask) return null;
        const maskTotal = maskRun?.total ?? Math.max(1, maskReceipts.length);
        const complete = kind === "vote" ? !!voteReceipt : maskReceipts.length >= maskTotal;
        const stopped = !busy && kind === "mask" && !complete;
        const pending = busy && activeKind === kind && !complete;
        const state = complete ? "submitted" : stopped ? "incomplete" : pending ? "pending" : "waiting";
        const stoppedMaskTitle = maskReceipts.length
          ? `${maskReceipts.length} of ${maskTotal} masks submitted`
          : maskTotal === 1 ? "Mask not submitted" : "Masks not submitted";
        const title =
          kind === "vote"
            ? complete
              ? "Vote submitted"
              : pending
                ? preparing
                  ? "Preparing your vote"
                  : "Submitting your vote"
                : "Vote waiting"
            : complete
              ? maskTotal === 1
                ? "Mask submitted"
                : `${maskTotal} masks submitted`
              : pending
                ? maskTotal === 1
                  ? "Submitting mask"
                  : "Submitting masks"
                : stopped ? stoppedMaskTitle : "Mask waiting";
        const message = complete || stopped
          ? undefined
          : pending
            ? detail
            : kind === "vote"
              ? "Starts after the mask is submitted."
              : "Starts after your vote is submitted.";
        return (
          <section
            key={kind}
            className="vp-submission-block"
            data-kind={kind}
            data-state={state}
            aria-label={kind === "vote" ? "Your vote" : "Masks"}
            aria-busy={pending}
          >
            {complete && kind === "vote" ? (
              <BallotSuccess choice={option} txHash={voteReceipt!.txHash} action={voteAction}>
                {voteAction && "You can change your vote until voting closes."}
              </BallotSuccess>
            ) : complete ? (
              <MaskSuccessBanner title={title} receipts={maskReceipts} secondary={includeVote || secondaryMasks} />
            ) : (
              <div className="vp-submission-block-header">
                <h3>{title}</h3>
                <div className="vp-submission-block-status">
                  {pending && <Spinner size="sm" variant="neutral" />}
                </div>
              </div>
            )}
            {kind === "vote" && !complete && option !== undefined && (
              <p className="vp-success-choice">
                <span>Your choice:</span> <strong>{option}</strong>
              </p>
            )}
            {pending && kind === "mask" && maskTotal > 1 && <MaskSubmissionProgress
              total={maskTotal} confirmed={maskReceipts.length} current={maskRun?.current ?? 0}
            />}
            {message && <p className="vp-submission-detail">{message}</p>}
            {kind === "mask" && !complete && maskTotal > 1 && maskReceipts.length > 0 && (
              <>
                {!pending && !stopped && (
                  <p className="vp-submission-detail">
                    {maskReceipts.length} of {maskTotal} submitted
                  </p>
                )}
                <MaskReceiptList receipts={maskReceipts} />
              </>
            )}
          </section>
        );
      })}
      {!busy && maskAction}
    </div>
  );
}
