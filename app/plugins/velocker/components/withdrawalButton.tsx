import type { ComponentProps } from "react";
import { PowerAction } from "./powerAction";

export type WithdrawalKind = "start" | "cancel" | "withdraw";

/** Keep each withdrawal operation's icon and color consistent in rows and confirmations. */
export function WithdrawalButton({
  kind,
  ...props
}: Omit<ComponentProps<typeof PowerAction>, "affordance"> & { kind: WithdrawalKind }) {
  return (
    <PowerAction
      {...props}
      data-withdrawal-action={kind}
      affordance={kind === "start" ? "clock" : kind === "cancel" ? "undo" : "wallet"}
    />
  );
}
