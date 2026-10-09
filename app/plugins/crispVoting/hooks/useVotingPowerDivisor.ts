import { useQuery } from "@tanstack/react-query";
import { usePrivatePair } from "./usePrivatePair";
import { getVotingPowerDivisor } from "../utils/ballotDigest";
import { publicClient } from "../utils/client";

/**
 * The divisor CRISP recorded for a round (`votingPowerDivisorOf(e3Id)`): one tally count or served
 * balance stands for this many raw token units.
 *
 * `undefined` until the read lands, and when the program holds no divisor for the round. Do NOT
 * substitute a default: a guessed factor would silently misreport turnout. Fixed when the round is
 * requested, so it is cached for good.
 */
export function useVotingPowerDivisor(e3Id: bigint | undefined): bigint | undefined {
  const { body } = usePrivatePair();
  const { data } = useQuery({
    queryKey: ["crisp-voting-power-divisor", body, e3Id?.toString()],
    queryFn: () => getVotingPowerDivisor(publicClient, body, e3Id!),
    enabled: e3Id !== undefined,
    staleTime: Infinity,
  });

  return data !== undefined && data > 0n ? data : undefined;
}
