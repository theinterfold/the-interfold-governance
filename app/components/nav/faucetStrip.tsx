import { Button, Spinner } from "@aragon/ods";
import { PUB_CHAIN, PUB_ENABLE_FAUCET, PUB_TOKEN_SYMBOL } from "@/constants";
import { useAlerts } from "@/context/Alerts";
import { useFaucet } from "@/hooks/useFaucet";

/**
 * Testnet notice with the faucet claim. The header keeps only the site's links and the wallet, as
 * on theinterfold.com. The strip is in the page flow under the sticky header, so it scrolls away.
 * Above the header it would sit under the mobile menu trigger, which the site header fixes at the
 * header's own position.
 */
export function FaucetStrip() {
  if (!PUB_ENABLE_FAUCET) return null;
  return <FaucetStripBody />;
}

function FaucetStripBody() {
  const { addAlert } = useAlerts();
  const { claim, canClaim, blockedReason, isConfirming } = useFaucet();

  // The faucet tops up per token; blockedReason mirrors its own revert conditions
  // so a repeat click explains itself instead of burning a reverting transaction.
  const claimTestTokens = () => {
    if (!canClaim) {
      addAlert(blockedReason ?? "Cannot claim from the faucet right now");
      return;
    }
    claim();
  };

  return (
    <div className="faucet-strip">
      <div className="faucet-strip-content page-content">
        <p>
          <span className="faucet-strip-network">{PUB_CHAIN.name} testnet</span>
          Test {PUB_TOKEN_SYMBOL} and fee tokens are free. Claim again for more voting weight, up to 5.
        </p>
        <Button size="sm" className="btn-mint" onClick={claimTestTokens} disabled={isConfirming} title={blockedReason}>
          {isConfirming ? <Spinner size="sm" /> : "Get test tokens"}
        </Button>
      </div>
    </div>
  );
}
