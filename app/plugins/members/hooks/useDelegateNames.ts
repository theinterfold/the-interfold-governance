import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { memberNameQueryOptions } from "@/hooks/useMemberName";
import { loadDelegateNames } from "../utils/delegateSearch";
import type { DelegateEntry } from "./useDelegates";

export function useDelegateNames(delegates: DelegateEntry[], enabled: boolean) {
  const client = useQueryClient();
  const addresses = delegates.map(({ address }) => address.toLowerCase() as Address);
  // Observe the same cache used by wallet labels; the bounded loader owns scheduling.
  const queries = useQueries({
    queries: addresses.map((address) => ({ ...memberNameQueryOptions(address), enabled: false })),
  });
  const lookup = useQuery({
    queryKey: ["delegateSearchNames", addresses],
    queryFn: ({ signal }) =>
      loadDelegateNames(addresses, (address) => client.fetchQuery(memberNameQueryOptions(address)), signal),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return {
    names: new Map(addresses.map((address, index) => [address, queries[index].data])),
    searching: enabled && lookup.isFetching,
    failed: enabled && !lookup.isFetching && queries.some((query) => query.isError),
    retry: () => lookup.refetch(),
  };
}
