import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

export type FriendlyError = {
  /** Alert title. */
  title: string;
  /** Human-readable explanation of what went wrong and, where possible, how to fix it. */
  description: string;
  /** True when the user declined the signature — callers usually treat this as a non-error. */
  isUserRejection: boolean;
  /** The decoded custom-error name, when we could recover one (useful for branching / logging). */
  errorName?: string;
};

/**
 * Map of on-chain custom error names to friendly, actionable copy.
 * `args` are the decoded revert arguments (same order as the Solidity error).
 */
const CUSTOM_ERROR_COPY: Record<string, (args: readonly unknown[]) => string> = {
  ProposalCreationForbidden: () =>
    "You don't have enough voting power to create a proposal. If you hold tokens, delegate them to yourself first to activate your voting power.",
  ProposalAlreadyExists: () =>
    "A proposal with these exact contents already exists. Change the title or actions and try again.",
  ProposalExecutionForbidden: () =>
    "This proposal can't be executed yet — voting may still be open or it did not pass.",
  NonexistentProposal: () => "That proposal doesn't exist.",
  NoVotingPower: () => "You have no voting power for this action.",
  InvalidOptionCount: () => "The proposal has an invalid number of voting options.",
  DateOutOfBounds: (args) =>
    `The voting window is out of bounds (limit ${String(args?.[0] ?? "?")}, got ${String(args?.[1] ?? "?")}). Adjust the start or end time.`,
  DaoUnauthorized: () => "The DAO hasn't granted the permission required for this action.",
  ZeroAddress: () => "A required address was empty.",
  AlreadyInitialized: () => "This contract has already been initialized.",
  DelegateCallFailed: () => "An internal call failed while executing the proposal.",
  FunctionDeprecated: () => "This contract function is no longer available.",
  // Aragon action-execution failures carry the failing action index.
  ActionFailed: (args) => {
    const idx = Number(args?.[0]);
    return Number.isFinite(idx)
      ? `Action ${idx + 1} failed to execute successfully.`
      : "One of the proposal actions failed to execute.";
  },
};

function isUserRejection(error: unknown): boolean {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return true;
  }
  const msg = (error as { message?: string })?.message ?? "";
  return msg.startsWith("User rejected the request") || /user (rejected|denied)/i.test(msg);
}

/**
 * Turn any thrown transaction/contract error into a friendly, user-facing message.
 * Decodes viem custom errors (e.g. `ProposalCreationForbidden`) when present and
 * falls back to a sensible default otherwise.
 */
export function decodeTxError(error: unknown, fallbackTitle = "Transaction failed"): FriendlyError {
  if (isUserRejection(error)) {
    return {
      title: "Signature declined",
      description: "You declined the request. Nothing was sent to the network.",
      isUserRejection: true,
    };
  }

  // Find the decoded custom-error node in viem's error chain.
  let revert: ContractFunctionRevertedError | undefined;
  if (error instanceof BaseError) {
    revert = error.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | undefined;
  }

  const errorName = revert?.data?.errorName ?? revert?.reason ?? undefined;
  if (errorName && CUSTOM_ERROR_COPY[errorName]) {
    return {
      title: fallbackTitle,
      description: CUSTOM_ERROR_COPY[errorName](revert?.data?.args ?? []),
      isUserRejection: false,
      errorName,
    };
  }

  // Known error name we don't have bespoke copy for — surface it plainly.
  if (errorName) {
    return {
      title: fallbackTitle,
      description: `The transaction reverted with "${errorName}".`,
      isUserRejection: false,
      errorName,
    };
  }

  // Plain revert reason string (require/revert with message), if any.
  const shortMessage = (error as { shortMessage?: string })?.shortMessage;
  return {
    title: fallbackTitle,
    description: shortMessage || "The transaction reverted. Please check the inputs and try again.",
    isUserRejection: false,
  };
}
