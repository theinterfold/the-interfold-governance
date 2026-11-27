import { type ReactNode } from "react";
import { useWalletModal } from "@/hooks/useWalletModal";
import { WalletButton } from "@/components/input/walletButton";
import styles from "./walletConnectionPrompt.module.css";

/** One contextual entry point. Connecting never submits the pending action. */
export function WalletConnectionPrompt({
  title,
  children,
  onConnect,
  align = "start",
}: {
  align?: "start" | "center";
  title?: string;
  children?: ReactNode;
  onConnect?: () => void;
}) {
  const { open, isOpen } = useWalletModal();
  return (
    <div className={styles.prompt} data-wallet-entry={true} data-align={align}>
      {title && <h2 className="ui-section-title">{title}</h2>}
      {children && <p className={styles.description}>{children}</p>}
      <WalletButton
        placement="content"
        label="Connect wallet"
        className={styles.action}
        disabled={isOpen}
        onClick={() => (onConnect ? onConnect() : void open())}
      />
    </div>
  );
}
