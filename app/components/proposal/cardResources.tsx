import type { IProposalResource } from "@/utils/types";
import { CardEmptyState } from "@aragon/ods";
import React from "react";

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
          <a className="proposal-resource-chip" target="_blank" rel="noopener noreferrer" href={resource.url}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5.5C9 3.5 5.5 3.5 2 4.5v15c3.5-1 7-1 10 1 3-2 6.5-2 10-1v-15c-3.5-1-7-1-10 1Zm0 0v15" />
            </svg>
            <span>
              {/^https:\/\/docs\.theinterfold\.com\/?(?:[?#].*)?$/i.test(resource.url)
                ? "Read the help guide"
                : resource.name}
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 18 18 6M6 6h12v12" />
            </svg>
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
};
