import { useCallback } from "react";

/** React 18 does not forward the boolean inert attribute yet. Apply it before paint. */
export function useInert(inactive: boolean) {
  return useCallback(
    (node: HTMLDivElement | null) => {
      if (node) node.inert = inactive;
    },
    [inactive]
  );
}
