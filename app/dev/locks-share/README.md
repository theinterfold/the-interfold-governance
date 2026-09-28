# Shareable lock comparison

Standalone review of **A · Contagem + marcadores** and **B · Estados à vista** with **3 · Badges de estado**. The original `/design-locks/` comparison and its saved reference remain available.

This entry reuses `LockReviewPanel`, the real `LockForm`, delegate picker, tooltips, typography and motion components. `fixtures.tsx` supplies the read-only account/directory hooks during this bundle only. The action wrapper updates local React state; no wallet, RPC, storage or transaction service is loaded. The fixture token explicitly has 18 decimals, a 100 FOLD minimum and a 30-day withdrawal cooldown. Production hooks and local-preview restrictions are unchanged.

From `app/`:

```sh
node dev/locks-share/build.mjs
```

The output is `/private/tmp/interfold-lock-review`. It contains only static JS, CSS, HTML, fonts and a Vercel configuration. The HTML is marked noindex and the deployed page disallows network connections. The build deliberately inlines ODS's CSS imports so spacing tokens and modal layout remain identical to the app; the global `power-card` container name is preserved across CSS-module compilation.

Serve that output directory to review. `?option=a` and `?option=b` select the starting option. Scenarios and reset are available on the page; refreshing starts a clean example.

Deploy only this output to the dedicated `interfold-lock-review` Vercel project, never to the main Interfold site.
