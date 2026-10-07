# Voting power, available balance and locks

Inspected the public interfaces on 23 September 2026, without connecting a wallet.
These references inform the visual organization, not Interfold's token mechanics.

| Reference | Observed pattern | Adaptation for Interfold |
| --- | --- | --- |
| [Convex — Lock CVX](https://www.convexfinance.com/lock-cvx) | Available balance and Max sit beside the amount input and lock action. Current CVX locks have a separately titled area; voting weight and delegation are another group. | Keep Wallet balance with Lock FOLD; give existing locks their own full-width disclosure. |
| [Stake DAO — SDT](https://app.stakedao.org/sdt) | Position metrics, including Your vlSDT, sit above a dedicated action area. Stake, Request Unstake and Redeem share that area; available SDT and Max accompany the input. | Give the voting-power total priority and associate the available balance with creating a lock, rather than the existing-lock summary. |
| [Continuity of shared elements](motion-patterns.md) | Preserve shared elements across views and move them continuously. | Apply continuity to grouped and individual lock states: counts split into row badges, with travel coordinated with the panel's height. This specific split/merge is Tiago's requested adaptation. |

The Aave public staking page was also inspected. Its disconnected view shows an
asset catalogue rather than personal balances, so it was not used as evidence
for where to place Wallet balance or existing locks.

Chosen on 25 September 2026: B · Estados à vista, B3 position/action/detail layout,
with treatment 3 · Badges de estado. The other comparison options remain available
in the design review page.

Large voting power stays at the upper left. Total FOLD, Bonded and Vesting share
the right column. Below the divider, Locked FOLD describes the current position
on the left; Unlocked FOLD sits directly beside its Lock FOLD action on the right.
A full-width View locks control follows both balances. Its colored state/count
badges sit at the right, followed by the chevron. With no locks, this control is
absent; balances and the creation action remain visible.

Collapsed and expanded states use the same shared icons and palette: a lock for
Active, a broken link for Not delegated, an hourglass for In cooldown, and a check
for Ready to withdraw. Expanded rows retain real delegation metadata and withdrawal
actions, with status at the right. Cooldown duration stays beside its badge;
hover or keyboard focus exposes the precise UTC end time including seconds.
The end time does not determine withdrawal eligibility: the contract's canExit
result still controls the action. Unknown balances and errors are not displayed
as zero or empty states.

The control retains its dimensions and shows Hide locks while expanded. Summary
badges give way to the individual row badges without changing their color or icon.
Narrow layouts wrap the state summary and stack the balance/action groups.
The allocation chart belongs to Total FOLD; Locked FOLD includes cooldown and
ready positions, while Bonded and Vesting are separate holdings.

The shared grouped-disclosure motion uses temporary, accessibility-hidden copies
and the browser's animation API. Real summary and row badges remain mounted;
the copies disappear after the flight. Interrupted flights reverse from their
current positions. The same timing token drives travel and expansion, and reduced
motion disables the movement. The expanded view retains only the individual badges.

Rechecked on 25 September 2026: [Convex](https://www.convexfinance.com/lock-cvx)
distinguishes available tokens, locked positions and vote weight.
[NuFi's balance documentation](https://support.nu.fi/support/solutions/articles/80000946563-total-balance-and-available-balance-in-staking)
shows a total with available and staked balances. The adaptation here keeps four
asset categories that sum to Total FOLD, with voting power outside that sum.
