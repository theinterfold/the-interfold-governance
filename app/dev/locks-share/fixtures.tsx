import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Address } from "viem";

// Bundler-only fixtures for the standalone design preview. These are not chain defaults.
export const DEMO_DECIMALS = 18;
const UNIT = 10n ** BigInt(DEMO_DECIMALS);
export const DEMO_ACCOUNT = "0x0000000000000000000000000000000000000001" as Address;
export const DEMO_CURRENT_DELEGATE = "0x0000000000000000000000000000000000000002" as Address;
export const DEMO_ACCOUNTS = {
  wallet: DEMO_ACCOUNT,
  delegateOne: DEMO_CURRENT_DELEGATE,
  delegateTwo: "0x0000000000000000000000000000000000000003" as Address,
  delegateThree: "0x0000000000000000000000000000000000000004" as Address,
  delegateFour: "0x0000000000000000000000000000000000000005" as Address,
};
export const DEMO_VOTING_POWER = 25_000n * UNIT;
export const DEMO_TOTAL_SUPPLY = 1_200_000_000n * UNIT;

export type DemoDelegateEntry = { address: Address; votingPower: bigint };
export const DEMO_DELEGATES: DemoDelegateEntry[] = [
  { address: DEMO_ACCOUNTS.delegateTwo, votingPower: 2_020_000n * UNIT },
  { address: DEMO_ACCOUNTS.delegateThree, votingPower: 1_940_000n * UNIT },
  { address: DEMO_ACCOUNTS.delegateFour, votingPower: 1_160_000n * UNIT },
  { address: DEMO_ACCOUNTS.delegateOne, votingPower: 1_000_000n * UNIT },
];

// Names are fictional labels resolved only by this table, never through ENS.
export const DEMO_MEMBER_NAMES = new Map<Address, string>([
  [DEMO_ACCOUNT, "example-wallet.eth"],
  [DEMO_ACCOUNTS.delegateOne, "delegate-one.eth"],
  [DEMO_ACCOUNTS.delegateTwo, "delegate-two.eth"],
  [DEMO_ACCOUNTS.delegateThree, "delegate-three.eth"],
  [DEMO_ACCOUNTS.delegateFour, "delegate-four.eth"],
]);

export type LocksShareState = {
  account: Address;
  currentDelegate: Address;
  votingPower: bigint;
};

const defaults: LocksShareState = {
  account: DEMO_ACCOUNT,
  currentDelegate: DEMO_CURRENT_DELEGATE,
  votingPower: DEMO_VOTING_POWER,
};
const LocksShareContext = createContext<LocksShareState>(defaults);

export function LocksShareProvider({ children, value }: { children: ReactNode; value?: Partial<LocksShareState> }) {
  const account = value?.account ?? defaults.account;
  const currentDelegate = value?.currentDelegate ?? defaults.currentDelegate;
  const votingPower = value?.votingPower ?? defaults.votingPower;
  const state = useMemo(() => ({ account, currentDelegate, votingPower }), [account, currentDelegate, votingPower]);
  return <LocksShareContext.Provider value={state}>{children}</LocksShareContext.Provider>;
}

export const PUB_TOKEN_SYMBOL = "FOLD";
export const PUB_APP_NAME = "Interfold Governance · Design preview";
export const PUB_CHAIN = {
  id: 31337,
  name: "Design preview",
  blockExplorers: undefined as { default: { name: string; url: string } } | undefined,
};

// The real ENS search hook passes this value to the local useEnsAddress replacement.
export const ensConfig = Object.freeze({ chains: [PUB_CHAIN] });
const refetch = async () => undefined;
const firstSeen = new Map(DEMO_DELEGATES.map(({ address }, index) => [address.toLowerCase(), BigInt(index + 1)]));

export function useTokenDecimals() {
  return DEMO_DECIMALS;
}

export function createConfig(_options?: unknown) {
  // ODS supplies a client factory at module load; the preview never invokes it.
  void _options;
  return ensConfig;
}

export function useConfig() {
  return ensConfig;
}

export function useChains() {
  return ensConfig.chains;
}

export function WagmiProvider({ children }: { children: ReactNode; [key: string]: unknown }) {
  return <>{children}</>;
}

export function useAccount() {
  const { account } = useContext(LocksShareContext);
  return {
    address: account,
    addresses: [account],
    chain: PUB_CHAIN,
    chainId: PUB_CHAIN.id,
    isConnected: true,
    isConnecting: false,
    isDisconnected: false,
    isReconnecting: false,
    status: "connected" as const,
  };
}

export function useMemberName(address?: Address) {
  const { account } = useContext(LocksShareContext);
  if (!address) return undefined;
  return address.toLowerCase() === account.toLowerCase()
    ? "example-wallet.eth"
    : DEMO_MEMBER_NAMES.get(address.toLowerCase() as Address);
}

export function useEnsAddress(options: { name?: string; query?: { enabled?: boolean }; [key: string]: unknown } = {}) {
  const { account } = useContext(LocksShareContext);
  const name = options.name?.trim().toLowerCase();
  const enabled = !!name && options.query?.enabled !== false;
  const data = enabled
    ? name === "example-wallet.eth"
      ? account
      : Array.from(DEMO_MEMBER_NAMES).find(([, label]) => label === name)?.[0]
    : undefined;
  return { data, isFetching: false, isLoading: false, isError: false, isSuccess: enabled, refetch };
}

export function useEnsAvatar(_options?: unknown) {
  void _options;
  // ODS renders its existing local address avatar when no remote image is supplied.
  return {
    data: undefined as string | undefined,
    isFetching: false,
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch,
  };
}

export function useEnsName(options: { address?: Address; query?: { enabled?: boolean }; [key: string]: unknown } = {}) {
  const name = useMemberName(options.address);
  const enabled = !!options.address && options.query?.enabled !== false;
  return {
    data: enabled ? name : undefined,
    isFetching: false,
    isLoading: false,
    isError: false,
    isSuccess: enabled,
    refetch,
  };
}

export function useDelegates() {
  return { delegates: DEMO_DELEGATES, totalSupply: DEMO_TOTAL_SUPPLY, isLoading: false, error: undefined, refetch };
}

export function useDelegateNames(delegates: DemoDelegateEntry[], _enabled?: boolean) {
  void _enabled;
  const { account } = useContext(LocksShareContext);
  return {
    names: new Map(
      delegates.map(({ address }) => [
        address.toLowerCase() as Address,
        address.toLowerCase() === account.toLowerCase()
          ? "example-wallet.eth"
          : DEMO_MEMBER_NAMES.get(address.toLowerCase() as Address),
      ])
    ),
    searching: false,
    failed: false,
    retry: refetch,
  };
}

export function useDelegateFirstSeen(_enabled?: boolean, _refreshKey?: number) {
  void _enabled;
  void _refreshKey;
  return { data: firstSeen, isPending: false, isError: false, isFetching: false, refetch };
}

export function useTokenVotes(address?: Address) {
  const state = useContext(LocksShareContext);
  const ownAccount = address?.toLowerCase() === state.account.toLowerCase();
  const votingPower = ownAccount
    ? state.votingPower
    : DEMO_DELEGATES.find((entry) => entry.address.toLowerCase() === address?.toLowerCase())?.votingPower;
  return {
    delegatesTo: ownAccount ? state.currentDelegate : undefined,
    votingPower,
    balance: undefined,
    isLoading: false,
    isError: false,
    refetch,
  };
}

function unavailableTransaction(_target?: Address) {
  void _target;
  throw new Error("Transactions are unavailable in this design preview. Use the local delegate selection callback.");
}

export function useDelegate(_onSuccess?: () => void) {
  void _onSuccess;
  return {
    delegate: unavailableTransaction,
    delegateToSelf: unavailableTransaction,
    isConfirming: false,
    isConfirmed: false,
    canDelegate: false,
  };
}
