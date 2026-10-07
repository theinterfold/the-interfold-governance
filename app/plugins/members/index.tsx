import { NotFound } from "@/components/not-found";
import { useUrl } from "@/hooks/useUrl";
import { PUB_ENABLE_LOCKING } from "@/constants";
import Locker from "@/plugins/velocker/pages/index";
import Delegation from "./pages/index";

export default function PluginPage() {
  const { hash } = useUrl();

  if (!hash || hash === "#/") {
    // With the velocker enabled, locking and self-delegation share one page, which also serves
    // old /plugins/members links.
    return PUB_ENABLE_LOCKING ? <Locker /> : <Delegation />;
  }

  return <NotFound />;
}
