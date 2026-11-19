import "@/vendor/shared-ui/overflow-tooltip.css";
import Script from "next/script";
import { RootContextProvider } from "@/context";
import { Layout } from "@/components/layout";
import AlertContainer from "@/components/alert/alert-container";
import { ErrorBoundary } from "@/components/errorBoundary";
import "@aragon/ods/index.css";
import "@/vendor/interfold-design/tokens.css";
import "@/pages/globals.css";
import "@/components/recordTables.css";
import "@/vendor/site-header/styles.css";
import { PUB_APP_NAME } from "@/constants";
import Head from "next/head";

export default function AragonetteApp({ Component, pageProps }: any) {
  return (
    <>
      <Head>
        <title>{PUB_APP_NAME}</title>
      </Head>
      <Script src="/shared-ui/overflow-tooltip.js?v=labeltip-3" strategy="afterInteractive" />
      <RootContextProvider>
        <Layout>
          {/* Keyed on the page component so navigating away clears a crashed view. */}
          <ErrorBoundary key={Component?.name}>
            <Component {...pageProps} />
          </ErrorBoundary>
        </Layout>
        <AlertContainer />
      </RootContextProvider>
    </>
  );
}
