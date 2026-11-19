import { ConnectKitProvider, type Types } from "connectkit";
import { useSyncExternalStore, type ReactNode } from "react";
import { approvedWalletTheme } from "@/context/walletTheme";
import { blockieDataUrl } from "@/utils/blockies";

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(update: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", update);
  return () => query.removeEventListener("change", update);
}
const prefersReducedMotion = () => window.matchMedia(motionQuery).matches;

function WalletAvatar({ address, size, radius }: Types.CustomAvatarProps) {
  if (!address) return null;
  return <img alt="" src={blockieDataUrl(address)} width={size} height={size} style={{ borderRadius: radius }} />;
}

export function GovernanceWalletProvider({ children }: { children: ReactNode }) {
  const reducedMotion = useSyncExternalStore(subscribeMotion, prefersReducedMotion, () => true);
  return (
    <ConnectKitProvider mode="light" customTheme={approvedWalletTheme} options={{ customAvatar: WalletAvatar, reducedMotion }}>
      {children}
    </ConnectKitProvider>
  );
}
