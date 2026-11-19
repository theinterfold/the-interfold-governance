import { cloneElement } from "react";
import NextDocument, { Html, Head as NextHead, Main, NextScript } from "next/document";
import { INITIAL_MENU_INTENT } from "@/components/nav/initialMenuIntent";
import { HEADER_ENTRANCE_BOOTSTRAP } from "@/vendor/site-header";

// Only the production homepage reserves a short download window for artwork.
// Its inline gate restores these in order on first motion, interaction, error,
// or at 1.5 s at the latest. App routes and development keep Next's normal path.
class Head extends NextHead {
  getScripts(files: Parameters<NextHead["getScripts"]>[0]) {
    const scripts = super.getScripts(files);
    return this.context.__NEXT_DATA__.page === "/" && !this.context.isDevelopment
      ? scripts.map((script) =>
          cloneElement(script, {
            type: "application/x-interfold-deferred",
            "data-govern-src": script.props.src,
            src: undefined,
          })
        )
      : scripts;
  }

  getDynamicChunks(files: Parameters<NextHead["getDynamicChunks"]>[0]) {
    const scripts = super.getDynamicChunks(files);
    return this.context.__NEXT_DATA__.page === "/" && !this.context.isDevelopment
      ? scripts.map(
          (script) =>
            script &&
            cloneElement(script, {
              type: "application/x-interfold-deferred",
              "data-govern-src": script.props.src,
              src: undefined,
            })
        )
      : scripts;
  }
}

export default class Document extends NextDocument {
  render() {
    return (
      <Html lang="en">
        <Head>
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=3" />
          <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png?v=3" />
          <link rel="shortcut icon" href="/favicon.ico?v=3" />
          <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png?v=3" />
          {/* Home lets CSS request only the fonts it uses after critical artwork
            requests have started. Application routes retain their preloads. */}
          {this.props.__NEXT_DATA__.page !== "/" && (
            <>
              <link
                rel="preload"
                href="/fonts/latin/InterVariable.woff2"
                as="font"
                type="font/woff2"
                crossOrigin="anonymous"
              />
              <link
                rel="preload"
                href="/fonts/ABCGramercy-Regular.woff2"
                as="font"
                type="font/woff2"
                crossOrigin="anonymous"
              />
              <link
                rel="preload"
                href="/fonts/latin/OfficeCodePro-Medium.woff2"
                as="font"
                type="font/woff2"
                crossOrigin="anonymous"
              />
            </>
          )}
        </Head>
        <body>
          {/* Firefox can paint before the stylesheets arrive, which shows the bare header SVGs at full
            width. An inline script blocks the parser until the stylesheets load, as other browsers do. */}
          <script dangerouslySetInnerHTML={{ __html: "0" }} />
          <Main />
          <script dangerouslySetInnerHTML={{ __html: INITIAL_MENU_INTENT + HEADER_ENTRANCE_BOOTSTRAP }} />
          <NextScript />
        </body>
      </Html>
    );
  }
}
