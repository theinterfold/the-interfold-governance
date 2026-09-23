import { useEffect, useRef } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export function DemoWallet() {
  const { isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const started = useRef(false);
  const connector = connectors.find((item) => item.id === "interfold-design-preview");

  useEffect(() => {
    if (started.current || isConnected || !connector) return;
    started.current = true;
    connect({ connector });
  }, [connect, connector, isConnected]);

  return (
    <button
      type="button"
      className="flex h-[41px] shrink-0 items-center gap-2 rounded-[6px] bg-[var(--ink)] px-4 leading-tight text-[var(--paper)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:ring focus-visible:ring-primary focus-visible:ring-offset"
      disabled={isPending || !connector}
      title={error ? error.message : isConnected ? "Disconnect demo wallet" : "Connect demo wallet"}
      onClick={() => (isConnected ? disconnect() : connector && connect({ connector }))}
    >
      <span aria-hidden="true" className={`bg-current h-1.5 w-1.5 rounded-full ${isConnected ? "" : "opacity-40"}`} />
      {isPending ? "Connecting…" : isConnected ? "Demo wallet" : "Connect demo"}
    </button>
  );
}
