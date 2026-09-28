import { useEffect, useState } from "react";
import { useEnsAddress } from "wagmi";
import { mainnet } from "wagmi/chains";
import { ensConfig } from "@/hooks/useMemberName";
import { isAddressSearch, normalizeSearchName, selectableAddress } from "../utils/delegateSearch";

export function useDelegateSearch(search: string) {
  const query = search.trim();
  const [settledQuery, setSettledQuery] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setSettledQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const name = normalizeSearchName(query);
  const settled = query === settledQuery;
  const resolution = useEnsAddress({
    config: ensConfig,
    chainId: mainnet.id,
    name,
    query: { enabled: !!name && settled, staleTime: 5 * 60 * 1000, retry: 1 },
  });
  // A previous name's result must never remain selectable while the next is resolving.
  const resolvedAddress =
    selectableAddress(query) ?? (name && settled ? selectableAddress(resolution.data) : undefined);
  return {
    name,
    resolvedAddress,
    searchNames: !!query && !isAddressSearch(query) && settled,
    settling: !settled,
    resolving: !!name && (!settled || resolution.isFetching),
    message: name
      ? !settled || resolution.isFetching
        ? "Looking up ENS name…"
        : resolution.isError
          ? "Couldn’t look up this ENS name. Try again or paste the wallet address."
          : resolution.isSuccess && !resolvedAddress
            ? "No wallet address found for this ENS name."
            : undefined
      : undefined,
  };
}
