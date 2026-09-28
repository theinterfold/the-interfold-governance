import { switchDemoAccount, DEMO_SENDING_WALLET } from "./demoWalletSession";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useDisconnect } from "wagmi";
import { ActionTray } from "@/plugins/velocker/components/actionTray";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import {
  getDemoRequest,
  getServerDemoRequest,
  resetDemoState,
  resolveDemoRequest,
  subscribeDemoData,
  subscribeDemoRequest,
} from "./simulation";

export function openDemoWalletPanel() {
  window.dispatchEvent(new Event("interfold-demo-wallet-open"));
}

/** One host outside navigation: wallet prompts also work when the mobile menu is closed. */
export function DemoWalletPanel() {
  const request = useSyncExternalStore(subscribeDemoRequest, getDemoRequest, getServerDemoRequest);
  const [settings, setSettings] = useState(false);
  const [resetError, setResetError] = useState("");
  const trigger = useRef<HTMLElement | null>(null);
  const query = useQueryClient();
  const { address } = useAccount();
  const { disconnect, isPending: isDisconnecting, error: disconnectError, reset: resetDisconnect } = useDisconnect();
  useEffect(
    () =>
      subscribeDemoData(() => {
        void query.invalidateQueries();
      }),
    [query]
  );
  useEffect(() => {
    const open = () => {
      setResetError("");
      resetDisconnect();
      setSettings(true);
    };
    window.addEventListener("interfold-demo-wallet-open", open);
    return () => window.removeEventListener("interfold-demo-wallet-open", open);
  }, [resetDisconnect]);
  const close = () => {
    if (request) resolveDemoRequest(request.id, "reject");
    setSettings(false);
  };
  return (
    <ActionTray
      open={!!request || settings}
      title="Wallet"
      pending={isDisconnecting}
      triggerRef={trigger}
      onClose={close}
      className="demo-wallet-panel"
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
          <details className="demo-wallet-failures">
            <summary>Test a failure</summary>
            <button type="button" onClick={() => resolveDemoRequest(request.id, "revert")}>
              {request.kind === "transaction" ? "Transaction reverts" : "Submission fails"}
            </button>
            <button type="button" onClick={() => resolveDemoRequest(request.id, "network")}>
              Connection fails
            </button>
          </details>
        </>
      ) : (
        <>
          <p className="demo-wallet-request-detail">
            Use any supported action on the page. This wallet will open so you can confirm, reject or test an error.
            Changes stay in this browser session.
          </p>
          <PowerAction
            onClick={() => {
              switchDemoAccount();
              setSettings(false);
            }}
          >
            {address?.toLowerCase() === DEMO_SENDING_WALLET.toLowerCase() ? "Use voting wallet" : "Use sending wallet"}
          </PowerAction>
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
    </ActionTray>
  );
}
