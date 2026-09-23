# Public delegate snapshot

`delegates-mainnet.json` contains the 26 public delegates returned by the original
[Interfold governance site](https://governance.theinterfold.com/plugins/lock/#/)
on 23 September 2026 at 00:49 UTC, at Ethereum block 26,036,708.

The file preserves the exact response from its public `/members/delegates`
indexer endpoint, together with the request and capture time. The delegation
source was read from the configured voting escrow's `ivotesAdapter()` getter.
Voting power and total supply use 18 decimals. Directory percentages use the
captured total supply, not the fictional supply used by the other preview fixtures.

This is a static design reference, not a live feed. The local preview serves its
addresses and voting powers through `demoIndexer`; direct voting-power reads for
these addresses use the same captured values. The connected demo wallet, locks
and proposal examples remain fictional. Signing and transactions remain blocked.

To refresh, repeat the read-only request recorded in the JSON and replace the
snapshot with its complete response and a new capture time. Do not replace the
captured values with inferred names, balances or voting powers.
