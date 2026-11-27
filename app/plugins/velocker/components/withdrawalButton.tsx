import type { ComponentProps } from "react";
import { PowerAction } from "./powerAction";

export type WithdrawalKind = "start" | "cancel" | "withdraw";

/** Keep each withdrawal operation's icon and color consistent in rows and confirmations. */
export function WithdrawalButton({
  kind,
  children,
  ...props
}: Omit<ComponentProps<typeof PowerAction>, "affordance"> & { kind: WithdrawalKind }) {
  return (
    <PowerAction
      iconBehavior="persistent"
      intent={kind === "withdraw" ? "confirm" : "open"}
      appearance={kind === "cancel" && props.intent !== "confirm" ? "text" : "default"}
      {...props}
      aria-label={props["aria-label"] ?? (typeof children === "string" ? children : undefined)}
      data-withdrawal-action={kind}
      affordance={kind === "start" ? "clock" : kind === "cancel" ? "undo" : "wallet"}
    >
      <span className="withdrawal-label-full">{children}</span>
      <span className="withdrawal-label-short" aria-hidden="true">{kind === "start" ? "Start" : kind === "cancel" ? "Cancel" : "Withdraw"}</span>
    </PowerAction>
  );
}
