import { URL_PATTERN } from "@/utils/input-values";
import type { ProposalMetadata } from "@/utils/types";

export type ProposalField = "title" | "summary" | `resource-${number}-${"name" | "url"}`;
export type ProposalFieldError = { field: ProposalField; message: string };

/** The composer and both submission paths share the same metadata requirements. */
export function validateProposalDetails({
  title,
  summary,
  resources,
}: Pick<ProposalMetadata, "title" | "summary" | "resources">): ProposalFieldError[] {
  const errors: ProposalFieldError[] = [];
  if (!title.trim()) errors.push({ field: "title", message: "Add a title for your proposal." });
  if (!summary.trim()) errors.push({ field: "summary", message: "Add a short summary of your proposal." });
  resources.forEach((resource, index) => {
    if (!resource.name.trim()) {
      errors.push({ field: `resource-${index}-name`, message: "Give this link a name." });
    }
    if (!URL_PATTERN.test(resource.url.trim())) {
      errors.push({ field: `resource-${index}-url`, message: "Enter a valid URL, for example https://theinterfold.com." });
    }
  });
  return errors;
}
