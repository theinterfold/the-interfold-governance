import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export function useUrl() {
  const router = useRouter();
  const [url, setUrl] = useState(typeof window != "undefined" ? window.location.href : "");

  useEffect(() => {
    const urlChanged = () => setUrl(window.location.href);
    urlChanged();
    router.events.on("hashChangeComplete", urlChanged);
    router.events.on("routeChangeComplete", urlChanged);
    window.addEventListener("hashchange", urlChanged);
    window.addEventListener("popstate", urlChanged);

    return () => {
      router.events.off("hashChangeComplete", urlChanged);
      router.events.off("routeChangeComplete", urlChanged);
      window.removeEventListener("hashchange", urlChanged);
      window.removeEventListener("popstate", urlChanged);
    };
  }, [router.events]);

  return new URL(url || "http://localhost");
}
