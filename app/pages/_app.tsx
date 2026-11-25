import "@/vendor/shared-ui/overflow-tooltip.css";
import Script from "next/script";
import { RootContextProvider } from "@/context";
import { Layout } from "@/components/layout";
import AlertContainer from "@/components/alert/alert-container";
import { ErrorBoundary } from "@/components/errorBoundary";
import "@aragon/ods/index.css";
import "@/vendor/interfold-design/tokens.css";
import "@/pages/globals.css";
// Next replaces route CSS before React swaps the outgoing page. Keep the home
// layout available during its exit, as with the shared plugin layout styles.
import "@/components/governHero.module.css";
import "@/components/recordTables.css";
import "@/vendor/site-header/styles.css";
import { PUB_APP_NAME } from "@/constants";
import Head from "next/head";
import type { AppProps } from "next/app";
import { PageNavigation } from "@/components/motion/PageNavigation";
import { resolveQueryParam } from "@/utils/query";

export default function AragonetteApp({ Component, pageProps, router }: AppProps) {
  const pluginId = resolveQueryParam(router.query.id);
  const path = router.pathname === "/plugins/[id]" && pluginId ? `/plugins/${pluginId}` : router.pathname;
  return (
    <>
      <Head>
        <title>{PUB_APP_NAME}</title>
      </Head>
      <Script src="/shared-ui/overflow-tooltip.js?v=labeltip-3" strategy="afterInteractive" />
      <RootContextProvider>
        <Layout>
          <PageNavigation path={path}>
            <ErrorBoundary key={path}>
              <Component {...pageProps} pluginId={pluginId} />
            </ErrorBoundary>
          </PageNavigation>
        </Layout>
        <AlertContainer />
      </RootContextProvider>
    </>
  );
}
