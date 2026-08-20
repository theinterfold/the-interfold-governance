import { NotFound } from "@/components/not-found";
import { useUrl } from "@/hooks/useUrl";
import { PUB_ENABLE_LOCKING } from "@/constants";
import Locker from "@/plugins/velocker/pages/index";
import Delegation from "./pages/index";

export default function PluginPage() {
  const { hash } = useUrl();

  if (!hash || hash === "#/" || hash.startsWith("#/delegates")) {
    // With the velocker enabled, locking and delegation merged into one page — old
    // /plugins/members links keep working by rendering it here.
    return PUB_ENABLE_LOCKING ? <Locker /> : <Delegation />;
  }

  return <NotFound />;
}
