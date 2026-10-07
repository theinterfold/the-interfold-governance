import { useEffect, useState } from "react";
import { DESIGN_PREVIEW, requireLocalPreview } from "./previewMode";

/** Local preview defaults to the Ballot / Mask study; the published ballot keeps its current layout. */
export function useBallotPreviewVariant() {
  const [variant, setVariant] = useState<"paths" | "separate" | "option">(DESIGN_PREVIEW ? "paths" : "option");

  useEffect(() => {
    if (!DESIGN_PREVIEW) return;
    requireLocalPreview();
    const requested = new URLSearchParams(window.location.search).get("ballot");
    setVariant(requested === "separate" || requested === "option" ? requested : "paths");
  }, []);

  return variant;
}
