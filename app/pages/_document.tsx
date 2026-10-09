import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=3" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png?v=3" />
        <link rel="shortcut icon" href="/favicon.ico?v=3" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png?v=3" />
        {/* Inter for the application UI; Gramercy for display titles and Office Code Pro for labels. */}
        <link rel="preload" href="/fonts/InterVariable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link
          rel="preload"
          href="/fonts/ABCGramercy-Regular.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/OfficeCodePro-Medium.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </Head>
      <body>
        {/* Firefox can paint before the stylesheets arrive, which shows the bare header SVGs at full
            width. An inline script blocks the parser until the stylesheets load, as other browsers do. */}
        <script dangerouslySetInnerHTML={{ __html: "0" }} />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
