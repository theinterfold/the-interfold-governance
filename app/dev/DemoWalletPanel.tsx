import { selectDemoAccount, DEMO_SENDING_WALLET } from "./demoWalletSession";
import { DEMO_WALLET } from "./previewMode";
import { formatHexString } from "@/utils/evm";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { ActionTray } from "@/plugins/velocker/components/actionTray";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import { Disclosure } from "@/components/motion/Disclosure";
import { BendingChevron } from "@/vendor/site-header";
import {
  subscribeDemoWalletConnection,
  getDemoWalletConnectionOpen,
  getServerDemoWalletConnectionOpen,
  completeDemoWalletConnection,
} from "./demoWalletConnection";
import {
  getDemoRequest,
  getServerDemoRequest,
  resetDemoState,
  resolveDemoRequest,
  subscribeDemoData,
  subscribeDemoRequest,
} from "./simulation";

export function setDemoWalletReturnFocus(target: HTMLElement | null, onCloseComplete?: () => void) {
  window.dispatchEvent(new CustomEvent("interfold-demo-wallet-focus", { detail: { target, onCloseComplete } }));
}

export function openDemoWalletPanel(returnFocus?: unknown, onCloseComplete?: () => void) {
  setDemoWalletReturnFocus(returnFocus instanceof HTMLElement ? returnFocus : null, onCloseComplete);
  window.dispatchEvent(new Event("interfold-demo-wallet-open"));
}

/** One host outside navigation: wallet prompts also work when the mobile menu is closed. */
export function DemoWalletPanel() {
  const request = useSyncExternalStore(subscribeDemoRequest, getDemoRequest, getServerDemoRequest);
  const [settings, setSettings] = useState(false);
  const [resetError, setResetError] = useState("");
  const [showFailures, setShowFailures] = useState(false);
  const failuresId = useId();
  const trigger = useRef<HTMLElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const closeComplete = useRef<(() => void) | undefined>();
  const query = useQueryClient();
  const { address, isConnected } = useAccount();
  const {
    connectAsync,
    connectors,
    isPending: isConnecting,
    error: connectionError,
    reset: resetConnect,
  } = useConnect();
  const connectionOpen = useSyncExternalStore(
    subscribeDemoWalletConnection,
    getDemoWalletConnectionOpen,
    getServerDemoWalletConnectionOpen
  );
  const connected = isConnected && !!address;
  const connector = connectors.find((item) => item.id === "interfold-design-preview");
  const { disconnect, isPending: isDisconnecting, error: disconnectError, reset: resetDisconnect } = useDisconnect();
  useEffect(
    () =>
      subscribeDemoData(() => {
        void query.invalidateQueries();
      }),
    [query]
  );
  useEffect(() => {
    const focus = (event: Event) => {
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      returnFocus.current = detail?.target instanceof HTMLElement ? detail.target : null;
      closeComplete.current = typeof detail?.onCloseComplete === "function" ? detail.onCloseComplete : undefined;
    };
    const open = () => {
      setResetError("");
      resetDisconnect();
      setSettings(true);
    };
    const connect = () => {
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      returnFocus.current = null;
      closeComplete.current = undefined;
      resetConnect();
      open();
    };
    window.addEventListener("interfold-demo-wallet-open", open);
    window.addEventListener("interfold-demo-wallet-connect", connect);
    window.addEventListener("interfold-demo-wallet-focus", focus);
    return () => {
      window.removeEventListener("interfold-demo-wallet-open", open);
      window.removeEventListener("interfold-demo-wallet-connect", connect);
      window.removeEventListener("interfold-demo-wallet-focus", focus);
    };
  }, [resetDisconnect, resetConnect]);
  const close = () => {
    if (request) resolveDemoRequest(request.id, "reject");
    setSettings(false);
  };
  useEffect(() => setShowFailures(false), [request?.id]);
  return (
    <ActionTray
      open={!!request || settings}
      title={!request && !connected ? "Connect wallet" : "Wallet"}
      pending={isDisconnecting || isConnecting}
      triggerRef={trigger}
      returnFocusRef={returnFocus}
      onCloseComplete={() => {
        if (connectionOpen) completeDemoWalletConnection(connected);
        if (connected && !trigger.current?.isConnected && !closeComplete.current) {
          document.querySelector<HTMLElement>("[data-wallet-connect-focus]")?.focus({ preventScroll: true });
        }
        closeComplete.current?.();
        closeComplete.current = undefined;
      }}
      onClose={close}
      className="demo-wallet-panel"
      overlayClassName="demo-wallet-overlay"
    >
      <p className="demo-wallet-mode">Local simulation · no real funds</p>
      {request ? (
        <>
          <h2 className="demo-wallet-request-title">{request.title}</h2>
          <p className="demo-wallet-request-detail">{request.detail}</p>
          <div className="demo-wallet-choices">
            <PowerAction intent="confirm" onClick={() => resolveDemoRequest(request.id, "confirm")}>
              {request.kind === "signature" ? "Sign" : "Confirm"}
            </PowerAction>
            <PowerAction onClick={() => resolveDemoRequest(request.id, "reject")}>Reject</PowerAction>
          </div>
          <div className="demo-wallet-failures">
            <button
              className="demo-wallet-failures-toggle"
              type="button"
              aria-expanded={showFailures}
              aria-controls={failuresId}
              onClick={() => setShowFailures(!showFailures)}
            >
              Test a failure <BendingChevron open={showFailures} />
            </button>
            <Disclosure id={failuresId} open={showFailures}>
              <button type="button" onClick={() => resolveDemoRequest(request.id, "revert")}>
                {request.kind === "transaction" ? "Transaction reverts" : "Submission fails"}
              </button>
              <button type="button" onClick={() => resolveDemoRequest(request.id, "network")}>
                Connection fails
              </button>
            </Disclosure>
          </div>
        </>
      ) : (
        <>
          <p className="demo-wallet-request-detail">
            {connected
              ? "Choose which wallet to use. The sending wallet can send a signed vote, but has no voting power."
              : "Connect a wallet to continue. The voting wallet can vote and delegate; the sending wallet has no voting power."}
          </p>
          <div className="vp-cta mb-6" role="group" aria-label="Demo wallets">
            {[
              { address: DEMO_WALLET, label: "Voting wallet" },
              { address: DEMO_SENDING_WALLET, label: "Sending wallet" },
            ].map((wallet) => {
              const selected = address?.toLowerCase() === wallet.address.toLowerCase();
              return (
                <PowerAction
                  key={wallet.address}
                  align="start"
                  intent={selected ? "confirm" : "open"}
                  affordance={selected ? "check" : undefined}
                  aria-pressed={selected}
                  disabled={isDisconnecting || isConnecting || (!connected && !connector)}
                  isLoading={isConnecting && selected}
                  onClick={async () => {
                    try {
                      selectDemoAccount(wallet.address);
                      if (!connected && connector) await connectAsync({ connector });
                      setSettings(false);
                    } catch {
                      // Keep the connector open for a deliberate retry.
                    }
                  }}
                >
                  {connected ? wallet.label : `Connect ${wallet.label.toLowerCase()}`} ·{" "}
                  {formatHexString(wallet.address)}
                </PowerAction>
              );
            })}
          </div>
          {connectionError && (
            <p role="alert" className="power-feedback">
              Could not connect. Please try again.
            </p>
          )}
          {!connected && (
            <PowerAction onClick={close} disabled={isConnecting}>
              Cancel
            </PowerAction>
          )}
          {connected && (
            <>
              <PowerAction
                onClick={() => {
                  try {
                    resetDemoState();
                    window.location.reload();
                  } catch (error) {
                    setResetError((error as Error).message);
                  }
                }}
              >
                Reset demo data
              </PowerAction>
              {resetError && (
                <p role="alert" className="power-feedback">
                  {resetError}
                </p>
              )}
              <PowerAction
                affordance="remove"
                disabled={isDisconnecting}
                isLoading={isDisconnecting}
                onClick={() => {
                  disconnect(undefined, { onSuccess: () => setSettings(false) });
                }}
              >
                Disconnect demo wallet
              </PowerAction>
              {disconnectError && (
                <p role="alert" className="power-feedback">
                  Could not disconnect. Please try again.
                </p>
              )}
            </>
          )}
        </>
      )}
    </ActionTray>
  );
}
