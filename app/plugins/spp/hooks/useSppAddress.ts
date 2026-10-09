import { PUB_SPP_PUBLIC_ADDRESS } from "@/constants";
import { usePrivatePair } from "@/plugins/crispVoting/hooks/usePrivatePair";

import type { Address } from "viem";
import type { SppKind } from "../utils/types";

/** The SPP a proposal of this kind lives on. A private one follows the pair in scope. */
export function useSppAddress(kind: SppKind): Address {
  const { spp } = usePrivatePair();
  return kind === "private" ? spp : PUB_SPP_PUBLIC_ADDRESS;
}
