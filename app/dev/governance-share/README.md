# Shareable Governance demo

Run `node dev/governance-share/build.mjs` from `app/`. The script prints a unique
temporary `out/` directory containing a static export of the homepage, Proposals
and Voting power. Deploy **only that output** to the dedicated
`interfold-governance-review` Vercel project.

Review URL: https://interfold-governance-review.vercel.app/

## Preserve concurrent demo updates

`release.json` records the latest combined publication and its source snapshot. Check the
live Vercel deployment before preparing a release and again immediately before publishing.
A deployment replaces the entire demo: do not publish an older isolated snapshot without
merging the changes already online. On 2 October, a homepage-only publication from an older
snapshot removed the Constitution proposal and the result-card updates.

Start from a copy of the latest published source, or preserve its unrelated changes in the
new build. Keep published source snapshots unchanged. If the live deployment changed during
the build, combine the new publication before continuing. Update `release.json` after a
successful publication and verify Constitution appears in the proposal list as well as via
its direct link.

From the printed output directory, publish with:

```sh
vercel deploy --yes --prod --project interfold-governance-review --scope tiago-sns-projects
```

The isolated build substitutes the existing local-preview flag with a review-only
adapter. The real source guard remains unchanged. Existing demo wallet/contract
fixtures handle interactions in browser storage: no real wallet or signatures.
No environment files, API routes, source files, or server functions are deployed.
The build receives a clean environment; its security policy limits connections to
its own static origin. The demo is marked noindex, which is not access protection.
Fixture deployment blocks are set to 1 so the proposal and event lists initialize.
The shared demo always uses the approved Ballot / Mask experience with Privacy tools;
old `?ballot=option` or `?ballot=separate` study links open that same experience.
Local development retains those functional study routes for integration work.
Review-only bundle aliases replace real wallet-modal and WalletConnect imports with
fail-closed stubs. These services cannot be initialized by this demo and are not
downloaded at startup. The normal application's imports are unchanged.

Connect wallet opens the address-only demo wallet. Its panel supports disconnect,
reset, approval/rejection and simulated failures. Refreshing preserves the current
browser session; Reset demo data restores the examples.
