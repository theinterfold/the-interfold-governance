# Local design preview

Set `NEXT_PUBLIC_DESIGN_PREVIEW=true` in `.env.local` and run the development server on localhost. The demo wallet connects automatically and can be disconnected from the wallet button (inside the menu on mobile).

The preview includes fictional FOLD balances, active and cooling-down locks, delegated voting power, public and private proposals, and proposal creation forms. Fixtures live in `fixtures.ts`; nothing is persisted to the live query cache.

The connector and local transport reject signing and transaction requests, the CRISP SDK rejects mutations, and metadata uploads are blocked. This mode is for reviewing the interface; it does not simulate completed transactions or validate live-chain behaviour.

Production builds always disable the preview, even if the environment flag remains enabled. Without the flag, development uses the existing wallet and network configuration.

Run the isolation checks with:

```sh
NODE_ENV=development NEXT_PUBLIC_DESIGN_PREVIEW=true bun test tests/design-preview.test.ts
```
