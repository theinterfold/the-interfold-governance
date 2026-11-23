import type { IProposalResource } from "./types";

export function proposalDocument(metadata?: { title?: unknown; summary?: unknown; description?: unknown; resources?: unknown }) {
  return {
    title: typeof metadata?.title === "string" ? metadata.title.trim() : "",
    summary: typeof metadata?.summary === "string" ? metadata.summary : "",
    description: typeof metadata?.description === "string" ? metadata.description : "",
    resources: Array.isArray(metadata?.resources)
      ? metadata.resources.filter((resource): resource is IProposalResource =>
          typeof resource?.name === "string" && typeof resource?.url === "string")
      : [],
  };
}

export type ProposalMetadataState = "ready" | "loading" | "untitled" | "unavailable";

/** A cached readable document stays visible even when a later refresh fails. */
export function proposalMetadataState(
  metadata: unknown,
  { isSuccess, error }: { isSuccess: boolean; error: unknown }
): ProposalMetadataState {
  if (
    metadata &&
    typeof metadata === "object" &&
    "title" in metadata &&
    typeof metadata.title === "string" &&
    metadata.title.trim().length > 0
  )
    return "ready";
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) return "untitled";
  return error != null || isSuccess ? "unavailable" : "loading";
}
