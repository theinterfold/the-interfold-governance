import { useEffect, useState } from "react";
import { DESIGN_PREVIEW } from "./previewMode";

/** The shared ballot defaults to the mask option; only an explicit preview URL shows the older layout. */
export function useBallotPreviewVariant() {
  const [variant, setVariant] = useState<"separate" | "option">("option");

  useEffect(() => {
    if (!DESIGN_PREVIEW || !["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) return;
    setVariant(new URLSearchParams(window.location.search).get("ballot") === "separate" ? "separate" : "option");
  }, []);

  return variant;
}
