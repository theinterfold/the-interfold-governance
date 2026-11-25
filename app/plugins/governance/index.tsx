import { isAddress } from "viem";
import { NotFound } from "@/components/not-found";
import { useUrl } from "@/hooks/useUrl";
import { PUB_CRISP_VOTING_PLUGIN_ADDRESS, PUB_TOKEN_VOTING_PLUGIN_ADDRESS } from "@/constants";
import ProposalList from "./pages/list";
import CreateProposal from "./pages/new";
import CrispProposalDetail from "@/plugins/crispVoting/pages/proposal";
import TokenProposalDetail from "@/plugins/tokenVoting/pages/proposal";
import { ProposalNavigation } from "@/components/proposal/proposalNavigation";

const NOT_INSTALLED = "This voting process is not installed in the DAO yet, so the proposal cannot exist.";

/**
 * Unified governance shell. One registry entry that aggregates both plugins:
 *  - #/                       merged, privacy-labelled proposal list
 *  - #/new                    single create form (Private/Public toggle)
 *  - #/proposals/private/:id  CRISP (private) proposal detail
 *  - #/proposals/public/:id   TokenVoting (public) proposal detail
 */
export default function PluginPage() {
  const { hash } = useUrl();
  return <ProposalNavigation hash={hash} list={(visible) => <ProposalList routeVisible={visible} />} detail={proposalRoute} />;
}

function proposalRoute(hash: string) {
  if (hash === "#/new") {
    if (!isAddress(PUB_CRISP_VOTING_PLUGIN_ADDRESS) && !isAddress(PUB_TOKEN_VOTING_PLUGIN_ADDRESS)) {
      return (
        <NotFound message="The voting plugins are not installed in this DAO yet, so proposals cannot be created." />
      );
    }
    return <CreateProposal />;
  }

  if (hash.startsWith("#/proposals/private/")) {
    // A detail link into a process that is not installed (phased rollout, or a link carried
    // over from another deployment) — explain, rather than render a detail page over nothing.
    if (!isAddress(PUB_CRISP_VOTING_PLUGIN_ADDRESS)) return <NotFound message={NOT_INSTALLED} />;
    const match = /^#\/proposals\/private\/(\d+)(\/read)?$/.exec(hash);
    return match ? <CrispProposalDetail key={match[1]} index={BigInt(match[1])} readingOnly={!!match[2]} /> : <NotFound />;
  }
  if (hash.startsWith("#/proposals/public/")) {
    if (!isAddress(PUB_TOKEN_VOTING_PLUGIN_ADDRESS)) return <NotFound message={NOT_INSTALLED} />;
    const match = /^#\/proposals\/public\/(\d+)(\/read)?$/.exec(hash);
    return match ? <TokenProposalDetail key={match[1]} index={BigInt(match[1])} readingOnly={!!match[2]} /> : <NotFound />;
  }

  return <NotFound />;
}
