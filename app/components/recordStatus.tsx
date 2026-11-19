import type { HTMLAttributes } from "react";
import { Check, Hourglass, LockSimple } from "@phosphor-icons/react";
import { StatusBadge } from "@/components/text/statusBadge";
import { PowerInfo } from "@/plugins/velocker/components/powerInfo";

export function DelegationRecordStatus({state}: {state: "active" | "pending"}) {
  const accepted = state === "active";
  const Icon = accepted ? Check : Hourglass;
  return <span data-record-state={true}>
    <PowerInfo compact={true} label={accepted ? "Accepted delegation" : "Pending delegation request"}
      trigger={<StatusBadge className={accepted ? "accepted" : "lock-cooldown"} data-record-status={true}
        responsive={{label:accepted ? "Accepted" : "Pending",short:accepted ? "Accepted" : "Pending",icon:<Icon size={16} aria-hidden="true" />}}><Icon size={16} aria-hidden="true" />{accepted ? "Accepted" : "Pending"}</StatusBadge>}>
      <p>{accepted ? "You represent this wallet. Its delegated power is included in your voting power." : "This wallet has asked you to represent it. Its power is not counted until you accept."}</p>
    </PowerInfo>
  </span>;
}

export function LockedRecordStatus(props: HTMLAttributes<HTMLSpanElement>) {
  return <PowerInfo compact={true} label="About active locks" trigger={<StatusBadge {...props} className="accepted lock-status-badge" data-record-status={true}
    responsive={{label:"Locked",short:"Locked",icon:<LockSimple size={16} aria-hidden="true" />}}>Locked</StatusBadge>}>
    <p>Activate your locks once to vote with them yourself. New locks then use the same voting wallet automatically.</p>
    <p>Only active locks count. Locks in cooldown or ready to withdraw do not. Changes apply to proposals created afterwards.</p>
    <p>You keep ownership of your FOLD and control withdrawals.</p>
  </PowerInfo>;
}
