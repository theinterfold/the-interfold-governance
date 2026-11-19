import { ArrowsDownUp } from "@phosphor-icons/react";
import type { PrivacyTool } from "@/components/proposalVoting/privacyTools";

/** Shared by the ballot and local studies; changing wallets requires masks to go first. */
export function changeOrderTool({
  includeMask,
  anotherWallet,
  enabled,
  onChange,
}: {
  includeMask: boolean;
  anotherWallet: boolean;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}): PrivacyTool {
  return {
    id: "order",
    title: "Change order",
    description: anotherWallet ? "Masks first" : enabled ? "Random order" : "Vote first",
    hint: enabled ? "Choose at random whether your vote or masks go first." : "Turn on to vary which submission goes first.",
    icon: <ArrowsDownUp size={20} aria-hidden="true" />,
    checked: includeMask && !anotherWallet && enabled,
    unavailable: !includeMask
      ? "Add a mask to change the sending order."
      : anotherWallet
        ? "Masks go first when sending your vote from another wallet."
        : undefined,
    info: (
      <p>
        Choose at random whether your vote or masks go first, so submissions do not always follow the same pattern.
        You can adjust the order in the review. When this extra is off, the vote goes first.
      </p>
    ),
    details: (
      <p className="ballot-optional-note">
        Randomly chooses whether your vote or masks go first. You can adjust the order in the review.
      </p>
    ),
    onChange,
  };
}
