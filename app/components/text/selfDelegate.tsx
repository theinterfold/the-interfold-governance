import { useAccount } from "wagmi";
import { useDelegate } from "@/hooks/useDelegate";
import { useTokenVotes } from "@/hooks/useTokenVotes";

/** Inline link-styled button that self-delegates the connected account's FOLD voting power. */
export function SelfDelegateLink({ label }: { label?: string }) {
  const { address } = useAccount();
  const { refetch } = useTokenVotes(address);
  const { delegateToSelf, isConfirming, canDelegate } = useDelegate(() => setTimeout(() => refetch(), 1000 * 2));

  return (
    <button
      type="button"
      onClick={delegateToSelf}
      disabled={isConfirming || !canDelegate}
      className="!text-sm text-primary-400 hover:underline disabled:opacity-50"
    >
      {isConfirming ? "delegating…" : (label ?? "delegate your voting power to yourself")}
    </button>
  );
}
