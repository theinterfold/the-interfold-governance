/** A cached readable document stays visible even when a later refresh fails. */
export function proposalMetadataState(
  metadata: unknown,
  { isSuccess, error }: { isSuccess: boolean; error: unknown }
): "ready" | "loading" | "unavailable" {
  if (
    metadata &&
    typeof metadata === "object" &&
    "title" in metadata &&
    typeof metadata.title === "string" &&
    metadata.title.trim().length > 0
  )
    return "ready";
  return error != null || isSuccess ? "unavailable" : "loading";
}
