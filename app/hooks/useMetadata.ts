import { fetchIpfsAsJson } from "@/utils/ipfs";
import { JsonValue } from "@/utils/types";
import { useQuery } from "@tanstack/react-query";

export function useMetadata<T = JsonValue>(
  ipfsUri?: string,
  options?: { retry?: boolean | number; enabled?: boolean }
) {
  const { data, isLoading, isSuccess, error, refetch } = useQuery<T, Error>({
    queryKey: ["ipfs", ipfsUri || ""],
    queryFn: () => {
      if (!ipfsUri) return Promise.resolve("");

      return fetchIpfsAsJson(ipfsUri);
    },
    retry: options?.retry ?? true,
    enabled: options?.enabled,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retryOnMount: true,
    staleTime: Infinity,
  });

  return {
    data,
    isLoading,
    isSuccess,
    error,
    refetch,
  };
}

export const useIpfsJsonData = useMetadata;
