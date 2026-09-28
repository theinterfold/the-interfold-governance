import { isAddress, zeroAddress, type Address } from "viem";
import { normalize } from "viem/ens";

export function normalizeSearchName(value: string): string | undefined {
  const query = value.trim();
  if (!query.includes(".")) return;
  try {
    return normalize(query);
  } catch {
    return;
  }
}

export function isAddressSearch(value: string) {
  return /^0x[0-9a-f]*$/i.test(value.trim());
}

export function selectableAddress(value?: string | null): Address | undefined {
  return value && isAddress(value) && value.toLowerCase() !== zeroAddress ? (value as Address) : undefined;
}

export function matchesDelegateSearch(address: Address, query: string, name?: string | null, resolved?: Address) {
  const term = query.trim().toLowerCase();
  return (
    !term ||
    address.toLowerCase().includes(term) ||
    !!name?.toLowerCase().includes(term) ||
    (!!resolved && address.toLowerCase() === resolved.toLowerCase())
  );
}

/** Search the whole directory without starting one RPC request per delegate at once. */
export async function loadDelegateNames(
  addresses: Address[],
  read: (address: Address) => Promise<unknown>,
  signal: AbortSignal
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, addresses.length) }, async () => {
      while (!signal.aborted && next < addresses.length) {
        const address = addresses[next++];
        // Individual query errors remain visible in the cache and must not stop other names.
        await read(address).catch(() => undefined);
      }
    })
  );
  return true;
}
