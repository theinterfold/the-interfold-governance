import { createContext, useContext, useState } from "react";
import { Info } from "@phosphor-icons/react";
import { BallotOptionalAction } from "./ballot";
import { Disclosure } from "@/components/motion/Disclosure";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { PowerInfo } from "@/plugins/velocker/components/powerInfo";
import { BendingChevron } from "@/vendor/site-header";
import { PUB_CHAIN } from "@/constants";

export type NetworkFeePresentation = "original" | "plain" | "inline" | "disclosure" | "help";
/** Comparisons change presentation only; fee responsibility stays in the ballot draft. */
export const NetworkFeePresentationContext = createContext<NetworkFeePresentation>("help");

export function BallotNetworkFee({ id, checked, masksOnly = false, disabled, unavailable, onChange }: {
  id: string;
  checked: boolean;
  /** Another wallet sends the vote, so this setting applies only to its masks. */
  masksOnly?: boolean;
  disabled: boolean;
  unavailable?: string;
  onChange: (value: boolean) => void;
}) {
  const presentation = useContext(NetworkFeePresentationContext);
  const [expanded, setExpanded] = useState(false);
  const blocked = disabled || unavailable !== undefined;
  const summary = checked
    ? masksOnly ? "You pay the masks’ fees." : "You pay the network fee."
    : masksOnly ? "Mask fees covered by Interfold." : "Network fee covered by Interfold.";
  const originalSummary = checked
    ? masksOnly ? "You'll pay the masks’ network fees." : "You'll pay the network fee from your wallet."
    : masksOnly ? "The Interfold covers the masks’ network fees." : "The Interfold covers the network fee.";
  const walletExplanation = `You pay the gas fee in ${PUB_CHAIN.nativeCurrency.symbol} and confirm the amount in your wallet. Your address is visible as the sender.`;
  const details = <div className="ballot-network-fee-explanation">
    <p className="ballot-network-fee-title">Network fee</p>
    <p>{checked ? "Your wallet sends the transaction and pays the fee." : "Interfold sends the transaction and covers the fee."}</p>
    {!checked && <p>If Interfold cannot send it, your wallet may ask you to send it and pay the fee. Review the fee before confirming; you can decline.</p>}
    {masksOnly && <p>This choice only applies to your masks. The other wallet pays for the vote.</p>}
  </div>;
  const help = <PowerInfo compact label="About network fees" contentClassName="ballot-network-fee-popover">{details}<p>{walletExplanation}</p></PowerInfo>;
  const option = <BallotOptionalAction
    id={id}
    layout="inline"
    title={masksOnly ? "Pay mask fees from my wallet" : "Pay from my wallet"}
    description={walletExplanation}
    checked={checked}
    disabled={blocked}
    onChange={onChange}
  />;

  return <FluidHeight className="ballot-network-fee-wrap" layoutKey={presentation}>
    <div className={presentation === "original" ? "ballot-submission-route ui-info-note" : "ballot-network-fee"}
      data-presentation={presentation} data-variant={presentation === "original" ? "outlined" : undefined}>
      {presentation === "original" ? <div className="ballot-submission-route-content">
        <div className="ballot-submission-route-heading"><p>{originalSummary}</p>{help}</div>
        {option}
      </div> : presentation === "plain" ? <>
        <div className="ballot-network-fee-row"><p>{summary}</p>{help}</div>
        {option}
      </> : presentation === "inline" ? <div className="ballot-network-fee-row">
        <p>{summary}</p>
        <button type="button" className="ui-text-action ballot-network-fee-action" disabled={blocked}
          aria-pressed={checked} aria-label={checked ? "Let Interfold cover the network fee" : masksOnly ? "Pay mask fees from my wallet" : "Pay the network fee from my wallet"}
          onClick={() => onChange(!checked)}>{checked ? "Use Interfold" : "Pay from my wallet"}</button>
        {help}
      </div> : presentation === "disclosure" ? <>
        <div className="ballot-network-fee-row">
          <p>{summary}</p>{help}
          <button type="button" className="ui-text-action ballot-network-fee-action"
            aria-expanded={expanded} aria-controls={`${id}-options`} onClick={() => setExpanded(!expanded)}>
            Change <BendingChevron open={expanded} width={7} thickness={1.3}/>
          </button>
        </div>
        <Disclosure id={`${id}-options`} open={expanded}>{option}</Disclosure>
      </> : <PowerInfo key="fee-settings" label="Network fee settings" interactive
        contentClassName="ballot-network-fee-popover"
        trigger={<span className="ballot-network-fee-summary"><span>{summary}</span><Info size={16} aria-hidden="true"/></span>}>
        {details}
        <div className="ballot-network-fee-popover-option">
          {option}
          <p className="ballot-network-fee-option-help">{walletExplanation}</p>
        </div>
      </PowerInfo>}
      {unavailable !== undefined && <p className="ballot-network-fee-unavailable" role="status">{unavailable}</p>}
    </div>
  </FluidHeight>;
}
