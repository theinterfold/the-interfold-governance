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

## Constitution proposal snapshot

The preview also includes **Adopt the Interfold Constitution**, captured from the public governance contracts and CRISP input indexer on **2 October 2026 at 02:48 UTC**. Its title, content, identifiers, voting window, snapshot voting power and encrypted input activity come from `snapshots/constitution-proposal.json`, which records the source URLs and capture limitations. This is a fixed demonstration snapshot, not a live status feed. The four original examples remain available.

The vote ended on 30 September at 21:35:23 UTC. In this capture, the tally was not published and the Foundation approval stage had not started. The 68 activity entries are encrypted inputs, not a count of voters. Eligible-voter verification is intentionally unavailable for this snapshot; the demo does not fabricate balances or verification checks. Demo wallet balances remain simulated.

## Trying actions and errors

Use the page normally. Each supported action opens **Demo wallet**, where you can **Confirm**, **Reject**, or open **Test a failure** and choose **Transaction reverts** or **Connection fails**. Approval, lock creation and delegation are separate requests, so a later step can fail after an earlier one succeeds. The page's ordinary pending, success, error and retry states receive the simulated result.

Supported actions: FOLD approval, creating locks for yourself or another wallet, delegation, starting/cancelling withdrawals, withdrawing an available lock, public votes, private ballots/masks, proposal creation and fee-credit deposits/withdrawals. The existing cooldown and withdrawable fixtures let you test each withdrawal state without waiting. These are UI scenarios, not a contract or cryptography emulator.

Successful changes update local balances and records and persist in **sessionStorage** across reloads of the same tab. Open **Demo wallet → Reset demo data** to restore the initial balances, locks, delegates and proposals. The same panel offers **Disconnect demo wallet**: this leaves the page disconnected across navigation, mobile-menu openings and reloads in this tab. **Connect wallet** opens an explicit wallet choice with cancellation; it does not reconnect automatically. A disconnected delegate row says **Connect to select** and resumes the chosen delegate's review only after connection and the wallet panel's closing animation. Connecting does not delegate or submit another transaction. Disconnecting preserves the demo's balances, locks, delegates and proposals. No live query cache is used.

## Review on the actual page

Open `/plugins/proposals/?review=changes#/` or `/plugins/lock/?review=changes#/` in local development. Numbered, passive marks attach to the visible controls, panels and dialogs. **Ver notas** lists each change with Before/Now/Test instructions and a link to its actual flow. **Ocultar marcas** removes the overlay; **Fechar review** exits the mode. The opt-in persists across navigation in this tab and is disabled in production. The marketing counterpart is at `http://127.0.0.1:3200/?review=changes` when its local server is running.

The connector has no private key and no upstream RPC provider. Only the demo account and allowlisted fictitious contracts are accepted. Receipts/hashes are local values and never link to an explorer. Message-signing returns a deliberately invalid placeholder after approval. Private ballots bypass cryptography and the remote SDK; proposal metadata stays in sessionStorage. Unsupported actions fail explicitly. No funds move, signatures authorize nothing, and nothing is uploaded or broadcast.

Production builds always disable the preview, even if the environment flag remains enabled. Without the flag, development uses the existing wallet and network configuration.

Run the isolation checks with:

```sh
NODE_ENV=development NEXT_PUBLIC_DESIGN_PREVIEW=true bun test tests/design-preview.test.ts tests/demo-simulation.test.ts tests/demo-wallet-session.test.ts tests/lock-flow.test.ts tests/lock-owner.test.ts
```

On the functional `?ballot=option` route, secret ballots let the user select **Send a mask** independently of Yes / No / Abstain. The review retains that selection in **Also send a mask**; it starts unchecked on a fresh ballot. Confirming both produces two sequential demo-wallet requests. Reject or fail the second to check partial success: the vote remains submitted and only the mask needs retrying. Masking also works independently, with an optional eligible recipient. Mask confirmations are transient; no mask history or counter is stored.

Secret ballots enable **Randomize voting power** by default. The review shows the exact counted FOLD amount and its percentage; optional mask/sending-wallet changes preserve that amount. Clearing the checkbox uses 100%. Only the encrypted choice is reduced: eligibility still uses the full snapshot balance, and a saved signed ballot retains its original encrypted weight. A balance below 100 ballot units cannot be reduced within 1%; the review explains that it uses 100% instead. Public votes and standalone masks have no randomization control.

### Ballot layout comparison

Three local preview URLs are available for review:

- `/plugins/proposals/#/proposals/private/1` (also `?ballot=paths` before the hash): the local site preview places the Ballot / Mask study in the private proposal layout. Its review puts the vote first, then offers Add a mask, Send from another wallet and Randomize voting power. The wallet switch and follow-up mask are interactive simulations; they do not sign or send a ballot.
- `/plugins/proposals/?ballot=option#/proposals/private/1`: the existing functional secret ballot has mutually exclusive Yes, No and Abstain choices, plus an independent **Send a mask** checkbox. Selecting a vote does not clear the mask, or vice versa. The main button opens a review of the selected vote, mask or both. **Send only a mask** remains available after choosing both.
- `/plugins/proposals/?ballot=separate#/`: explicit comparison with the older separate mask action, which opens its confirmation directly. Public proposals never offer masks.

The comparison parameter only takes effect in local design preview. Without it, the site preview uses Ballot / Mask; production retains the functional ballot. The study's fixed amounts and receipts are illustrative, while the `option` and `separate` routes retain the functional demo submission flow.

`/design-ballots` is a development-only study with eight interactive compositions of the shared ballot components. Compare all eight or focus on a version; switch between first-vote and change-vote states. Randomization, optional masks, disclosures and reviews are interactive, with a fixed illustrative 99.50% quote and no wallet or submission calls. Variants do not replace the live ballot layout.

`/design-ballots/?study=masks&v=all` adds four mask-focused explorations: Ballot / Mask paths, vote choices followed by an optional Mask control, one Privacy group with all three combinations, and a single Mask entry opening a choice panel. Each supports vote only, vote + mask and mask only. The `v=paths` variant uses a compact Ballot / Mask selector with icons. Ballot shows voting power above the vote choice; its review emphasizes the selected option before three parallel Privacy tools: Add a mask, Send from another wallet, and Randomize voting power. All three can be selected together. The preview then shows the prepared vote, wallet switch and separate mask step. Mask sends only a mask. Mask reviews include recipient choices (random, own wallet, and example eligible wallets). The functional separate-sender path currently prepares and saves only the vote; following it with a mask remains a design proposal, not an implemented transaction flow. The selector uses native radios for keyboard navigation and the shared motion timing, with a reduced-motion fallback. The refined `v=compose` variant has no Vote checkbox: choosing Yes / No / Abstain implies voting. Enabling Mask reveals Add mask / Just mask. Just mask leaves the voting rows visible but unselected, preserves the draft and current-vote marker, and hides voting-power settings. Choosing a voting row again switches to Add mask. Other variants hide voting choices in mask-only mode. Mask-only reviews show zero voting weight and one submission. These are local simulations using the shared controls and motion; they do not change the production ballot.

`/design-ballots/?study=votes&v=all` compares six treatments for Yes / No / Abstain within the same Ballot / Mask preview: the earlier simple rows, a decision section, framed cards, a black selected row, three columns, and an editorial numbered list. Open one variant to compare its complete flow or use its “Ver esta versão na proposta” link to view it within the local private proposal. The integrated URL accepts `?voteStyle=current|decision|framed|ink|tiles|emphasis` before the hash, for example `/plugins/proposals/?voteStyle=framed#/proposals/private/1`. Without that parameter, the local integrated ballot uses framed cards; this study does not affect the functional production ballot or the shared demo.

`/design-signing/` compares three illustrative ways to explain the ballot signature before the wallet opens: a short summary with a code-style Signature data disclosure, a sequence with the same disclosure beneath it, and that sequence with Signature data opening inside the signing step. A numbering study on the same page compares a separate 01 line with three inline 01. treatments, including a tight version whose description aligns with the number; its wallet toggle shows the longer sign → switch wallet → send vote → send mask path. The selected number style also appears in the shared ballot reviews. The local Ballot / Mask review uses **Em linha · pequeno** with **O que acontece a seguir**, omitting the mask step when no mask was selected. Example addresses and the commitment are fictional; the study never signs or sends anything. The real private vote signs EIP-712 CRISP Ballot data containing the round, slot, and ciphertext commitment, so the plaintext choice and voting power must be explained by the app rather than presented as readable signature fields.

In the integrated Ballot / Mask preview, Privacy tools starts collapsed while Randomize voting power remains on for every fresh ballot and can be turned off from the collapsed icon or expanded options. Opening and closing the group does not reset the selected tools. Privacy choices that add actions reveal numbered steps in the review and subsequent stages. Another sending wallet adds a prepare step before sending the vote; an added mask follows as its own submission. Randomization changes the counted voting power but does not add a step. The prepared vote screen keeps the choice and amount prominent, while wallet identities and the simulation notice remain secondary.

`/design-signature-options/` compares three Signature data interactions: replacing the review inside the same dialog, expanding and bringing the data into view, and a readable summary leading to full data in the same dialog. The study preserves compact numbered steps and supports vote only or another wallet plus mask. It is development-only and does not replace the integrated ballot.
