# Proposal actions: live product references

Inspected on 25 September 2026 in public desktop views, without connecting a wallet.

| Product | Observed treatment |
| --- | --- |
| [Compound on Cactus/Tally](https://www.tally.xyz/gov/compound/proposals) | A dark, rounded “+ New proposal” button in the proposal section header. Search and filters sit below. Proposal rows contain status and vote data, without repeated filled Vote buttons. |
| [Balancer on Snapshot](https://snapshot.box/#/s:balancer.eth/proposals) | Compact, neutral proposal entries with title, author and voting metadata. The list does not repeat filled Vote buttons. |
| [Optimism on Agora](https://vote.optimism.io/) | Neutral clickable proposal rows show voting status and results. The disconnected view does not establish how creation is presented to an eligible wallet. |

These observations support a hierarchy, rather than one universal placement. For Interfold,
Create proposal uses the shared primary action surface beneath the page introduction. It
stays in the same place for populated and empty lists. Vote, View results, View proposal and
Close details share the secondary surface because they open or close a proposal. Submission
and confirmation inside a ballot retain primary emphasis.

The centered placement is our adaptation to Interfold's existing page introduction, not a
claim that the reference products use that placement. ActionButton and ActionLink share
dimensions, corners, typography, icon behavior, focus and disabled styles; their HTML semantics
differ because one performs an action and the other navigates.
