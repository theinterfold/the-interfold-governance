# Mask recipients and separate sending wallets

## Choose a mask recipient

The "Another wallet" option loads `crispSdk.getEligibleAddresses(e3Id)`, the same source used for random masking. Search filters the entire list; the selector renders at most 100 matching addresses. It shows the full selected address below the selector. Random and self masking remain available. The proof-building path still validates the recipient's eligibility; an unavailable address is never silently replaced.

## Sign with A, send with B

In vote confirmation, enable "Send from another wallet". The eligible account A encrypts and signs the ballot through the existing SDK flow. After `finishBallotProof`, the app saves the final encoded proof with its voter, program, chain, plugin, round and expiry. It does not send a transaction yet.

The live payload contains no plaintext choice or separate raw signature. The record is scoped by network, plugin and round in localStorage and survives reloads, disconnection and account changes. The pending card is independent of the connected account's eligibility.

Switch accounts in the wallet, or connect another wallet, then explicitly choose "Send signed ballot". Account B needs gas on the voting network, but does not need voting power. The transaction uses the original proof unchanged, so the ballot counts for A. The app rechecks the program and simulates `publishInput` before requesting B's transaction.

Wallet rejection and preflight errors retain the draft. The transaction hash is saved as soon as broadcast, before waiting for confirmation. A pending hash is checked on retry instead of broadcasting again. Success or explicit discard clears the record; expired unsent drafts are removed when loaded. If another ballot changes A's slot head before submission, preflight may reject the old proof: discard it and sign again with A.

This option is separate from relayer sponsorship. The ordinary same-wallet flow is unchanged. In the two-wallet flow, masks can be sent separately after voting.

## Review demo and validation

The public review uses fake accounts and explicit simulated signing/transaction prompts. "Switch demo wallet" toggles between the eligible account and a sending account with zero voting power. Only the isolated simulator stores a fictitious choice, under a separate demo storage key; demo payloads cannot be published to the live network.

Automated tests cover storage validation, account/network guards, proof preservation, rejection, confirmation timeout/reload, reverted receipts and demo isolation. Browser checks cover signing, wallet switching, reload, rejection/retry, successful sending and eligible-recipient selection.

The real chain flow still needs an end-to-end check with two wallets and a live CRISP round before use in production governance. The public review does not exercise real cryptographic proofs, gas or transactions.
