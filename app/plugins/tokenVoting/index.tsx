import { NotFound } from "@/components/not-found";
import ProposalCreate from "./pages/new";
import ProposalDetail from "./pages/proposal";
import { useUrl } from "@/hooks/useUrl";

/**
 * Standalone router for the public (TokenVoting) plugin. In The Interfold the
 * unified `governance` shell is the registered entry point and renders the
 * detail/create pages directly; this router is kept for completeness so the
 * module can also be mounted on its own.
 */
export default function PluginPage() {
  const { hash } = useUrl();

  if (!hash || hash === "#/") return <ProposalCreate />;
  else if (hash === "#/new") return <ProposalCreate />;
  else if (hash.startsWith("#/proposals/")) {
    const id = hash.replace("#/proposals/", "");
    return <ProposalDetail index={BigInt(id)} />;
  }

  return <NotFound />;
}
