import React, { useEffect, useState, type FC } from "react";
import { useRouter } from "next/router";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { resolveQueryParam } from "@/utils/query";
import { NotFound } from "@/components/not-found";
import { plugins } from "@/plugins";
import { MainSection } from "@/components/layout/main-section";

const PluginLoader: FC = () => {
  const { query } = useRouter();
  const pluginId = resolveQueryParam(query.id);
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

  if (!loaded?.PageComponent || loaded.id !== pluginId) {
    if (!pluginId || loaded?.id !== pluginId) {
      return (
        <MainSection>
          <div className="flex h-24 w-full items-center justify-center">
            <PleaseWaitSpinner />
          </div>
        </MainSection>
      );
    }
    return <NotFound />;
  }

  const PageComponent = loaded.PageComponent;
  return <PageComponent />;
};

export default PluginLoader;
