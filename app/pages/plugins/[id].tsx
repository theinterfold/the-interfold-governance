import React, { useEffect, useState, type FC } from "react";
import { ProposalsIntro } from "@/plugins/governance/components/proposalsIntro";
import { useUrl } from "@/hooks/useUrl";
import { NotFound } from "@/components/not-found";
import { plugins } from "@/plugins";

function PendingPlugin({ pluginId }: { pluginId?: string }) {
  const { hash } = useUrl();
  const list = pluginId === "proposals" && (!hash || hash === "#/");
  return <>
    {(!pluginId || list) && <div className={pluginId ? "proposals-page" : "proposals-page plugin-initial-list"}>
      <ProposalsIntro showPageTitle={false} />
    </div>}
    <span className="sr-only" role="status">Loading page…</span>
  </>;
}

const PluginLoader: FC<{ pluginId?: string }> = ({ pluginId }) => {
  const [loaded, setLoaded] = useState<{ id: string; PageComponent: FC | null }>();

  useEffect(() => {
    if (!pluginId) return;

    const plugin = plugins.find((p) => p.id === pluginId);
    if (!plugin) {
      // An unknown section (stale link, or a feature-gated plugin that is disabled in this
      // deployment): without this, the spinner never resolves and the page hangs forever.
      setLoaded({ id: pluginId, PageComponent: null });
      return;
    }
    let active = true;
    import(`@/plugins/${plugin.folderName}`)
      .then((mod) => {
        if (active) setLoaded({ id: pluginId, PageComponent: mod.default });
      })
      .catch((err) => {
        console.error("Failed to load the page component", err);

        if (active) setLoaded({ id: pluginId, PageComponent: null });
      });
    return () => {
      active = false;
    };
  }, [pluginId]);

  const pending = !pluginId || loaded?.id !== pluginId;
  const PageComponent = loaded?.PageComponent;
  if (pending) return <PendingPlugin pluginId={pluginId} />;
  return PageComponent ? <PageComponent /> : <NotFound />;
};

export default PluginLoader;
