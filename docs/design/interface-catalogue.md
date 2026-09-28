# Interface catalogue

Live local review page: `http://127.0.0.1:3100/design-system` (development only).
It renders actual components and CSS roles rather than copies drawn for documentation.
Its inventory is `app/dev/interfaceCatalog.ts`; the font and control tokens live in
`app/pages/globals.css`. The specimens are in `app/pages/design-system.tsx`.

## Reference and adaptation

The existing **Pesquisar exemplos de governance** conversation and
`Interfold_Governance_Visual_Atlas_2026-09-24.html` informed this pass.
The atlas was based on the repository’s September 21 main branch; local changes
are assessed against the running app, not assumed to match that older inventory.

| Reference | Pattern used | Interfold application |
| --- | --- | --- |
| [Base product family](https://brand.base.org/sub-brands) | One visual system across product areas | Shared roles and actions for Voting power and Proposals |
| [Aave Pro guide](https://aave.com/blog/aave-pro-user-guide), Deposit screenshot | Restrained headings, aligned facts, actions separated from data | Equal overview columns and a dedicated lock-management area |
| [Coinbase account redesign](https://www.coinbase.com/en-gb/blog/building-economic-freedom-one-pixel-at-a-time), My Assets | Consolidated account facts | Total, liquid balance and sources belong to one overview |
| Interfold website `titleBlock.ts`, `packages/site-header` | Brand type, responsive scale, common control sizes | PageIntro uses the brand outline weight; header and `SiteFooter` come from the main website's shared source. Footer structure and styles stay global; links, copyright and newsletter visibility are application content. Only background colour varies aesthetically. Standard actions follow 46/52px heights and 6px corners |

The reference is composition and consistency. Brand colours, fonts and governance
behaviour remain Interfold’s. The atlas is research, not an implementation specification.

## Typography inventory

| Role | Token / component | Size and weight | Uses |
| --- | --- | --- | --- |
| Page introduction | `PageIntro` | Gramercy regular; existing responsive website scale | Voting power, Proposals |
| Panel title | `PanelHeader` | Inter 20 / 600 | Your account, Locks, Proposals |
| Document title | `--ui-title-font` / `ui-card-title` | Inter 24 / 500 | Proposal titles |
| Section introduction | `power-section-intro` / site type ladder | Gramercy 24–32 title, 16–18 copy | Choose a delegate, outside its white card |
| Section title | `--ui-section-font` / `ui-section-title` | Inter 16 / 600 | Voting power, Voting power sources, Voting details, Actions |
| Supporting text | `--ui-body-font` / `ui-body` | Inter 14 / 400 | Account explanations, source names, lock summary |
| Label / metadata | `--ui-label-font` / `ui-label` | Inter 12 / 500 | Locked FOLD, Unlocked FOLD, directory headings, proposal filters and metadata |
| List amount | `ListTokenAmount` / `--ui-list-value-font` | Inter 16 / 600; tabular numerals | Locks and delegate voting power |
| List identifier | `RowIdentifier` | Inter 12 / 500; tabular numerals | Stable lock IDs and positional delegate ranks |
| State | `--ui-status-font` / `StatusBadge`, `LockStatusBadge` | Inter 12 / 600 | Locks and proposal states |
| Address / technical identifier | Existing address components | Office Code Pro 500 | Addresses and code; list IDs use RowIdentifier |

Explicit exceptions: the single main voting-power total is 48–64px, delegated total
is 28px, long proposal reading text is 16px, and branded page introductions retain
their website typography. These exceptions have a semantic role; do not introduce
another size just to fit a particular label.

## Form spacing

Shared tokens in `globals.css` define the rhythm for lock/delegation reviews and ballot forms:

| Role | Token | Space |
| --- | --- | --- |
| Label to control / compact identity details | `--ui-space-tight` | 8px |
| Related content / selector follow-up | `--ui-space-related` | 12px |
| Adjacent controls | `--ui-space-controls` | 16px |
| Sections | `--ui-space-section` | 24px |

The owner identity stays mounted at the top of the neutral group in both states, while its
contents crossfade. The field keeps an accessible label without duplicating visible headings.
Reduced motion skips the transition. The connected wallet is the default owner. A secondary
“Lock for another wallet” action beside the section title reveals the address field; “Use your
wallet” returns to the default. The shared transition carries the final action as additional
fields appear. Its heading says “Lock for your wallet” or “Lock for another wallet”, so ownership
is explicit before entry. Only the editable wallet address has an underline.

The overview follows the main page introduction directly, without repeating “Your voting power”.
The delegate section uses `power-section-intro` outside its white card: Gramercy headings and
supporting copy from the existing site type ladder, an 8px title/copy gap and 24px before the card.
Inter remains the font for data, card headings and controls.

`LockPartyGroup` shares the owner/delegate hierarchy: a section title and secondary text action
outside each neutral group, 12px before its content, and supporting copy inside. The neutral
surface extends 12px into the dialog gutter on each side, with matching 12px horizontal padding,
so headings, wallet fields, helper copy, warning edges and form facts share the same left axis.
Groups keep 16px vertical padding and 24px separation; the amount is separated from them by 32px. The owner group’s decorative
surface grows and shrinks with the shared step transition. Only its painted height animates;
content and corner radius do not scale; the settled surface follows the natural group height. Reversals begin at the
current painted height, and reduced motion goes straight to the final size.
Lock creation uses one form with its ownership/delegation notices and final action visible together.
There is no separate “Review lock” step; wallet approval and confirmation still follow submission.
After a successful lock and failed delegation, retry only finishes delegation.
`ExpandingActionLabel` keeps “Approve and lock” mounted while “for another wallet” expands beside it;
the shared words slide left within the centered button and return on reversal. The suffix uses
measured text width, the form’s 360ms easing and immediate changes for reduced motion.
An exact zero balance shows “No FOLD available to lock” next to the amount and disables submission.
An unresolved balance is not presented as zero; errors do not replace the button label.

Exact withdrawal amounts use `exactNumber`: a decimal point, at least two fraction digits and
no thousands separators. Significant token decimals are preserved as strings. The editable lock
amount stays raw, so presentation never changes transaction values. Both amount displays share
`--token-review-font` and `--token-review-unit-font`; token value/unit pairs use `--token-unit-gap`
(8px) throughout the account overview, lists and reviews.

## Control inventory

| Role | Implementation | Uses |
| --- | --- | --- |
| Primary | `ActionButton intent="create"` or `"confirm"` | Lock FOLD and confirmation/submission actions |
| Voting | `ActionButton intent="vote"` | Green Vote, public/private vote submission and review confirmation |
| Secondary | `ActionButton intent="open"` | View results/View proposal/Close details, Change delegate, Remove delegation and row actions |
| Navigation | `ActionLink`, with the same intent and surface as ActionButton | Create proposal uses `intent="create"` in the external Proposals header |
| Domain action | `PowerAction` alias; `WithdrawalButton` wrapper | Same underlying button; no independent sizing |
| Saved lock studies | `LockSummaryToggle` + `ActionButton` | Historical alternatives retained in `/design-locks`; production locks are always visible |
| Row state | `LockStatusBadge`, `DelegateStatus`, `.badge` | Read-only status; never presented as a transaction action |
| Utility | Sort, info, close, copy | Compact controls serving a different role from standard actions |
| Secondary text action | `.ui-text-action` | Lock for another wallet and Change delegate inside the lock form; reveals additional fields or the delegate chooser |
| Wallet identity | `AddressText`, also used by `EnsMember` | One details trigger; connected wallets show their address followed by a “Your wallet” badge using the metadata type role |
| Wallet menu control | `WalletButton` | Compact light surface, 6px corners, 12px monospace address; shared by the header and menu in live and preview modes |
| Transaction facts | `ActionDetailField`, `EncodedView`, `CallParamField` | Shared read-only recipient, value and calldata rows in proposal details and composer previews; exact values, no disabled inputs |
| Proposal creation | `ProposalComposer` | Shared writing/settings surfaces, compact Inter heading, ballot-style voting-method rows, bending disclosure chevrons and ActionButton controls across public/private entry points |
| Resource navigation | `CardResources` | Transparent outlined chips, including Read the help guide, shared by proposal expansions and full pages |

Unselected mask choices and standalone mask entry controls use `--surface-muted`.
Only a selected mask radio uses the ballot's selected mint background and filled selection mark.
The optional mask explains its voter-privacy benefit; the submission summary retains transaction
count and gas disclosure. Its compact info control explains encrypted, zero-weight cover without
changing votes or the result. The info control is outside the checkbox label, so interacting with
it never changes the mask selection. A random recipient does not expose a redundant wallet address, while
explicit recipient choices keep their relevant identity or input. The review's mask disclosure
owns its height transition directly, keeping the dialog surface and footer in sync without a
second height animator. Reversal preserves focus and draft input; reduced motion is immediate.

The delegate chooser and review share `DelegationAmount`: only the locked FOLD covered by the
change, excluding withdrawal positions. Bonded, vesting and incoming voting power do not belong
in this action. The amount is a plain readout, label above value, left-aligned, without a
field-like background, border or inset. The overview uses the neutral label “Voting power”.
The account overview shows Your voting power at the upper left and the owned balance legend and
ring to its right. The ring follows the height of the legend. Its three categories are Unlocked
FOLD, Locked FOLD and Bonded. Vesting is included in the relevant owned balance, while the
voting-power info still explains every contributing amount. It must never be double-counted.
A separate Locks card follows, always expanded, with a count and compact Lock FOLD in its header.
The balance values are not repeated there. Missing reads stay unavailable; zero has an empty ring.
Hover/focus on balance categories highlights the corresponding ring segment.

The review names the new voting delegate and the current delegate it replaces. When a new lock
also changes existing delegation, its warning identifies the delegate being replaced or removed
using the shared wallet identity, with ENS when available. Both ownership and delegation warnings
use the same small Phosphor warning icon, with title and body aligned in one text column.
A zero current delegate is not shown as
a wallet. Proposal voting-power info sits beside its label, with the snapshot note below;
`ui-label-with-info` keeps the same grouping for mask privacy info. Where lock-table
headers collapse, each delegate address keeps its “Delegated to” label. Self-delegation and removal are quick actions; the connected wallet also appears
in the ordinary directory. Both the directory and chooser show ten delegates initially, with
“Load more” adding ten. Search and sorting cover the full directory and reset the visible count.
Both choosers and the directory use `SearchField`: a rounded outline, 16px search icon, clear
control and an ENS-or-address placeholder. Search matches partial primary ENS names across the
whole directory, with bounded lookups using the wallet-label cache. Complete ENS names also
resolve to a selectable wallet even outside the directory; resolution and network failures have
explicit feedback. The delegation review shows the current and proposed delegate, without a
redundant lock-owner row (the connected wallet owns the locks in this flow).
All action affordances use `ActionIcon`: Phosphor regular, 16px, trailing, with an 8px gap.
`ActionButton` owns their shared reveal through `ActionLabel`: hidden at rest, revealed on hover
or keyboard focus, visible without animation on touch or with reduced motion. This includes
Change/Select delegate, self-delegation, removal, custom-address selection, lock and withdrawal
actions. Never insert a separate leading action icon into a button's children. Status checks
(Delegated, Selected, No delegation) use the same icon family and size but remain visible.
The footer announces the displayed/total count. Locks and delegates share a full-width white row
surface, thin separators, neutral hover/focus and 12px vertical padding. At desktop both have a
76px minimum row height and a 196px compact action column. `RowIdentifier` and `ListTokenAmount`
share typography; lock IDs retain # because they are persistent identifiers, while delegate
numbers are positions in the currently displayed order. Mobile groups identity and amount,
then state and action, without a fixed height. Days remain to the left of right-aligned lock badges.

Shared information bubbles use `PowerInfoArrow`, whose fill overlaps the surface border and whose
outline continues along the two pointer edges, so the pointer belongs to the same shape.

All rectangular surfaces use `--ui-radius` (6px), including these bubbles, dialogs, cards, form
controls, badges and `CardResources` links. ODS radius tokens and `--action-radius` alias it;
clipped row backgrounds use `--ui-radius-inner`. Neutral strokes use `--ui-stroke` (16% ink mixed
with white) and `--ui-stroke-hover` (32% ink), with no transparent border colour that changes on
grey backgrounds. Keep semantic state borders and circular avatars, indicators and charts.

Standard actions are 46px mobile / 52px from 768px, with 6px corners and 14px/600 type.
The explicit `size="compact"` variant is 40px desktop / at least 44px mobile or touch, used for
Lock FOLD and lock/delegate row actions. `ActionLabel` owns trailing icons and `BendingChevron`
remains visible for disclosures. Disabled/loading styling belongs to the action family.

Create proposal is in the external Proposals header, beside the title/intro and eligibility feedback,
using the same `PanelHeader` and spacing above the white panel as Your locks.
It has the same regular dimensions as Vote: 260px wide on desktop, growing to the available
width on small screens. Vote, vote submission and vote confirmation use `intent="vote"` (green).
Create proposal and Lock FOLD retain black; closed/result actions are white. Search uses the
same `SearchField` as the directory. `DeadlineInfo` unifies exact dates in countdown/cooldown
tooltips, always including UTC and seconds, without changing their visible relative summaries.
`PanelHeader` and `.ui-panel` / `.power-card` own shared card headings and surfaces.

## Consolidation — 26 September 2026

The implementation follows [the consistency audit](interface-audit-2026-09-26.md).
The `/design-locks` and `/design-proposals` alternatives are retained as studies; their historical
layouts are not requirements for the current product. The authoritative current conventions
are in [interface-consistency.md](interface-consistency.md).

The catalogue covers the primary roles on these two pages. It is not a claim that
all legacy ODS controls in every admin, composer or transaction state have been migrated.
