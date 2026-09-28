/** Opt-in local design data. A production build can never enable this mode. */
export const DESIGN_PREVIEW =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DESIGN_PREVIEW === "true";

// An address-only fixture: no private key or real wallet is created or connected.
export const DEMO_WALLET = "0x2B49CF50c9b1e03fC96A27Ead77419BaF2C3ED0E" as const;
export const DEMO_MESSAGE = "Design preview only. No signature, transaction or upload was sent.";

export function previewAddress(id: number) {
  return `0x${id.toString(16).padStart(40, "0")}` as `0x${string}`;
}

export function requireLocalPreview() {
  if (
    !DESIGN_PREVIEW ||
    (typeof window !== "undefined" && !["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname))
  ) {
    throw new Error("Design preview is only available in local development.");
  }
}
