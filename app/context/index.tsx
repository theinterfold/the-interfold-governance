import { AlertProvider } from "./Alerts";
import { WalletAccountPanel } from "@/components/walletAccountPanel";
import type { ReactNode } from "react";
import { QueryClient } from "@tanstack/react-query";
import { config } from "@/context/Web3Modal";
import { GovernanceWalletProvider } from "@/components/GovernanceWalletProvider";
import { WagmiProvider, deserialize, serialize } from "wagmi";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { OdsModulesProvider } from "@aragon/ods";
import { odsCoreProviderValues } from "@/components/ods-customizations";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1_000 * 60 * 60 * 24, // 24 hours
    },
  },
});

const persister = createAsyncStoragePersister({
  serialize,
  storage: AsyncStorage,
  deserialize,
});

export function RootContextProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <OdsModulesProvider wagmiConfig={config} queryClient={queryClient} coreProviderValues={odsCoreProviderValues}>
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
          <GovernanceWalletProvider>
            <AlertProvider>{children}<WalletAccountPanel /></AlertProvider>
          </GovernanceWalletProvider>
        </PersistQueryClientProvider>
      </OdsModulesProvider>
    </WagmiProvider>
  );
}
