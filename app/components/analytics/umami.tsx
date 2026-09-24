import Script from "next/script";

export function UmamiAnalytics() {
  const websiteId = (process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? "e29d3733-0edb-46fb-bb7f-0902632177ef").trim();
  const scriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL?.trim();

  if (process.env.NODE_ENV !== "production" || !websiteId) return null;

  return (
    <Script
      id="umami-analytics"
      src={scriptUrl === "" ? "https://cloud.umami.is/script.js" : (scriptUrl ?? "https://cloud.umami.is/script.js")}
      strategy="afterInteractive"
      // Required by the site's Cross-Origin-Embedder-Policy: require-corp header.
      crossOrigin="anonymous"
      data-website-id={websiteId}
      data-domains={process.env.NEXT_PUBLIC_UMAMI_DOMAINS?.trim() ?? "governance.theinterfold.com"}
      data-do-not-track="true"
      data-exclude-search="true"
      data-exclude-hash="true"
    />
  );
}
