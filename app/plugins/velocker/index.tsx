import { NotFound } from "@/components/not-found";
import { useUrl } from "@/hooks/useUrl";
import Locker from "./pages/index";

export default function PluginPage() {
  const { hash } = useUrl();

  if (!hash || hash === "#/") return <Locker />;

  return <NotFound />;
}
