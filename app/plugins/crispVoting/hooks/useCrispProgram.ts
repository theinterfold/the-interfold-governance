import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { usePrivatePair } from "./usePrivatePair";
import { resolveCrispProgram } from "../utils/ballotDigest";
import { publicClient } from "../utils/client";

/**
 * The CRISP program a round was requested against: the contract that verifies its ballot
 * signatures. `undefined` until the read lands. A round never changes program, so the result is
 * cached for good.
 */
export function useCrispProgram(e3Id: bigint | undefined): Address | undefined {
  const { body } = usePrivatePair();
  const { data } = useQuery({
    queryKey: ["crisp-program", body, e3Id?.toString()],
    queryFn: () => resolveCrispProgram(publicClient, body, e3Id!),
    enabled: e3Id !== undefined,
    staleTime: Infinity,
  });
  return data;
}
