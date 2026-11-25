import { PageIntro } from "@/components/pageIntro";

/** Also rendered in the initial document, before the proposals bundle is ready. */
export function ProposalsIntro({ showPageTitle }: { showPageTitle: boolean }) {
  return <PageIntro immediate title="Proposals" glyph="proposals" showPageTitle={showPageTitle}
    description="Explore the decisions shaping Interfold. Read proposals, cast your vote, and follow the outcome." />;
}
