import { useRef, useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { PUB_TOKEN_SYMBOL } from "@/constants";

export function VotingPowerInfo({ cooldownText }: { cooldownText: string }) {
  const [open, setOpen] = useState(false);
  const openOnPointerDown = useRef(false);

  return (
    <Tooltip.Provider delayDuration={180}>
      <Tooltip.Root open={open} onOpenChange={setOpen}>
        <Tooltip.Trigger
          type="button"
          className="power-info-toggle"
          aria-label="How voting power works"
          aria-expanded={open}
          onPointerDown={() => {
            openOnPointerDown.current = open;
          }}
          onClick={(event) => {
            // Radix dismisses tooltips on click by default; allow tap and keyboard toggling too.
            event.preventDefault();
            setOpen(event.detail === 0 ? !open : !openOnPointerDown.current);
          }}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" />
            <path d="M12 11v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="12" cy="7.5" r=".9" fill="currentColor" />
          </svg>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="power-info-popover"
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={16}
          >
            <dl>
              <div>
                <dt>Lock {PUB_TOKEN_SYMBOL}</dt>
                <dd>
                  Each committed {PUB_TOKEN_SYMBOL} counts 1:1 toward voting power. Only you can withdraw your locks.
                </dd>
              </div>
              <div>
                <dt>Choose who votes</dt>
                <dd>
                  Delegate your locks to yourself or another wallet. Bonded and vesting {PUB_TOKEN_SYMBOL} count
                  automatically for their owner.
                </dd>
              </div>
              <div>
                <dt>Withdraw</dt>
                <dd>
                  Voting power stops when withdrawal starts. Claim your {PUB_TOKEN_SYMBOL} after {cooldownText}.
                </dd>
              </div>
            </dl>
            <p>Proposals use the voting power recorded at their snapshot.</p>
            <Tooltip.Arrow className="power-info-arrow" width={12} height={6} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
