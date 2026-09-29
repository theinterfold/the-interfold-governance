import { selectDemoAccount, DEMO_SENDING_WALLET } from "./demoWalletSession";
import { DEMO_WALLET } from "./previewMode";
import { formatHexString } from "@/utils/evm";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useDisconnect } from "wagmi";
import { ActionTray } from "@/plugins/velocker/components/actionTray";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import { Disclosure } from "@/components/motion/Disclosure";
import { BendingChevron } from "@/vendor/site-header";
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
  const [showFailures, setShowFailures] = useState(false);
  const failuresId = useId();
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
  useEffect(() => setShowFailures(false), [request?.id]);
  return (
    <ActionTray
      open={!!request || settings}
      title="Wallet"
      pending={isDisconnecting}
      triggerRef={trigger}
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
            Choose which wallet to use. The sending wallet can send a signed vote, but has no voting power.
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
                  disabled={isDisconnecting}
                  onClick={() => {
                    selectDemoAccount(wallet.address);
                    setSettings(false);
                  }}
                >
                  {wallet.label} · {formatHexString(wallet.address)}
                </PowerAction>
              );
            })}
          </div>
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
