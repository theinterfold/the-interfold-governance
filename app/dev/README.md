# Local design preview

Set `NEXT_PUBLIC_DESIGN_PREVIEW=true` in `.env.local` and run the development server on localhost. The demo wallet connects automatically. Its button opens controls (inside the menu on mobile).

For a fresh checkout, run this from `app/` to reproduce the current review without
real wallet credentials, RPC services or contract addresses:

```sh
bun install --frozen-lockfile
NEXT_PUBLIC_DESIGN_PREVIEW=true \
NEXT_PUBLIC_CHAIN_NAME=mainnet \
NEXT_PUBLIC_PLUGIN_DEPLOYMENT_BLOCK=1 \
NEXT_PUBLIC_TOKEN_DEPLOYMENT_BLOCK=1 \
NEXT_PUBLIC_VE_LOCKER_DEPLOYMENT_BLOCK=1 \
bun dev
```

Open `http://localhost:3000/`. The nonzero fixture deployment blocks enable the
proposal and delegate event lists. The review build and published demo are
documented in [governance-share/README.md](governance-share/README.md).

The preview includes fictional FOLD balances, active and cooling-down locks, delegated voting power, public and private proposals, and proposal creation forms. The delegate directory uses the previously captured public snapshot. Fixtures live in `fixtures.ts`; local actions live in `simulation.ts`.

The directory's **Newest delegates** order uses a synthetic chronology in preview; the captured snapshot has no delegation dates. Live mode reads first-delegation blocks only when this sort is selected. Power sorts use the existing voting-power data.

Built-in proposals include three action states: the active operator-support proposal has one 0.25 ETH payment, completed community-grant proposals have two payments (1 ETH and 0.5 ETH), and the active participation-guidelines proposal has no actions. These are local examples with fictitious recipients, never executable live transactions.

## Trying actions and errors

Use the page normally. Each supported action opens **Demo wallet**, where you can **Confirm**, **Reject**, or open **Test a failure** and choose **Transaction reverts** or **Connection fails**. Approval, lock creation and delegation are separate requests, so a later step can fail after an earlier one succeeds. The page's ordinary pending, success, error and retry states receive the simulated result.

Supported actions: FOLD approval, creating locks for yourself or another wallet, delegation, starting/cancelling withdrawals, withdrawing an available lock, public votes, private ballots/masks, proposal creation and fee-credit deposits/withdrawals. The existing cooldown and withdrawable fixtures let you test each withdrawal state without waiting. These are UI scenarios, not a contract or cryptography emulator.

Successful changes update local balances and records and persist in **sessionStorage** across reloads of the same tab. Open **Demo wallet → Reset demo data** to restore the initial balances, locks, delegates and proposals. The same panel offers **Disconnect demo wallet**: this leaves the page disconnected across navigation, mobile-menu openings and reloads in this tab. Click **Connect wallet** in the header or page to reconnect. Disconnecting preserves the demo's balances, locks, delegates and proposals. No live query cache is used.

The connector has no private key and no upstream RPC provider. Only the demo account and allowlisted fictitious contracts are accepted. Receipts/hashes are local values and never link to an explorer. Message-signing returns a deliberately invalid placeholder after approval. Private ballots bypass cryptography and the remote SDK; proposal metadata stays in sessionStorage. Unsupported actions fail explicitly. No funds move, signatures authorize nothing, and nothing is uploaded or broadcast.

Production builds always disable the preview, even if the environment flag remains enabled. Without the flag, development uses the existing wallet and network configuration.

Run the isolation checks with:

```sh
NODE_ENV=development NEXT_PUBLIC_DESIGN_PREVIEW=true bun test tests/design-preview.test.ts tests/demo-simulation.test.ts tests/demo-wallet-session.test.ts tests/lock-flow.test.ts tests/lock-owner.test.ts
```

Secret ballots open a confirmation dialog with an unchecked **Also send a mask** option. Confirming it produces two sequential demo-wallet requests. Reject or fail the second to check partial success: the vote remains submitted and only the mask needs retrying. **Submit a mask** also works independently, with an optional eligible recipient. Mask confirmations are transient; no mask history or counter is stored.

### Ballot layout comparison

Two local preview URLs are available for review:

- `/plugins/proposals/#/` (also `?ballot=option`): the default secret ballot has Yes, No, Abstain and Submit a mask as mutually exclusive selections, on the list and full proposal pages. Selecting a row does not submit or open a dialog; the main submit button opens the relevant confirmation. A normal vote still offers the unchecked **Also send a mask** option in its confirmation.
- `/plugins/proposals/?ballot=separate#/`: explicit comparison with the older separate mask action, which opens its confirmation directly. Public proposals never offer masks.

The comparison parameter only takes effect in local design preview. Without it, or in production, the fourth mask option is the default. Nothing about eligibility, voting weight or the submission sequence changes.
