import type { IProposalResource } from "@/utils/types";
import { CardEmptyState } from "@aragon/ods";
import React from "react";
import { BookOpen } from "@phosphor-icons/react";
import { ProposalExternalLink } from "./proposalExternalLink";

interface ICardResourcesProps {
  resources?: IProposalResource[];
  title: string;
}

export const CardResources: React.FC<ICardResourcesProps> = (props) => {
  const { title } = props;
  let { resources } = props;

  if (resources == null || resources.length === 0) {
    return <CardEmptyState objectIllustration={{ object: "ARCHIVE" }} heading="No resources were added" />;
  }

  // Check that resources is not a empty but not an array
  if (!Array.isArray(resources)) resources = [resources];

  return (
    <ul className="proposal-resources" aria-label={title}>
      {resources.map((resource) => (
        <li key={resource.url}>
          <ProposalExternalLink href={resource.url} icon={<BookOpen size={16} aria-hidden="true" />}>
            {/^https:\/\/docs\.theinterfold\.com\/?(?:[?#].*)?$/i.test(resource.url)
              ? "Read the help guide"
              : resource.name}
          </ProposalExternalLink>
        </li>
      ))}
    </ul>
  );
};
