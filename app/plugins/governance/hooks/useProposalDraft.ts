import { useState } from "react";
import { PUB_APP_NAME, PUB_PROJECT_URL } from "@/constants";
import type { IProposalResource, RawAction } from "@/utils/types";

/** The written proposal stays intact when the voting method changes. */
export function useProposalDraft() {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [actions, setActions] = useState<RawAction[]>([]);
  const [resources, setResources] = useState<IProposalResource[]>([{ name: PUB_APP_NAME, url: PUB_PROJECT_URL }]);
  return {
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
  };
}

export type ProposalDraft = ReturnType<typeof useProposalDraft>;
export type ProposalKind = "private" | "public";
export type ProposalCreateProps = {
  draft?: ProposalDraft;
  onKindChange?: (kind: ProposalKind) => void;
};
