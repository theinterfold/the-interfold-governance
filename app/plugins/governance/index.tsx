import { NotFound } from "@/components/not-found";
import { useUrl } from "@/hooks/useUrl";
import ProposalList from "./pages/list";
import CreateProposal from "./pages/new";
import CrispProposalDetail from "@/plugins/crispVoting/pages/proposal";
import TokenProposalDetail from "@/plugins/tokenVoting/pages/proposal";

/**
 * Unified governance shell. One registry entry that aggregates both plugins:
 *  - #/                       merged, privacy-labelled proposal list
 *  - #/new                    single create form (Private/Public toggle)
 *  - #/proposals/private/:id  CRISP (private) proposal detail
 *  - #/proposals/public/:id   TokenVoting (public) proposal detail
 */
export default function PluginPage() {
  const { hash } = useUrl();

  if (!hash || hash === "#/") return <ProposalList />;
  if (hash === "#/new") return <CreateProposal />;

  if (hash.startsWith("#/proposals/private/")) {
    const id = hash.replace("#/proposals/private/", "");
    return <CrispProposalDetail index={BigInt(id)} />;
  }
  if (hash.startsWith("#/proposals/public/")) {
    const id = hash.replace("#/proposals/public/", "");
    return <TokenProposalDetail index={BigInt(id)} />;
  }

  return <NotFound />;
}
