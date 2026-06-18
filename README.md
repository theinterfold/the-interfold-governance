# The Interfold Governance

Monorepo for the Interfold DAO governance.

```
the-interfold-governance/
  app/        Next.js frontend (unified shell over both plugins)
  contracts/  Foundry deploy scripts + tests
```

The DAO is governed by two Aragon OSx plugins sharing the **FOLD** ERC20Votes token,
both granted `EXECUTE_PERMISSION` on the DAO (i.e. both execute as governance):

| Plugin           | Privacy | Source                                |
| ---------------- | ------- | ------------------------------------- |
| CrispVoting      | Private | `gnosisguild/crisp-aragon-plugin`     |
| TokenVoting v1.4 | Public  | Aragon canonical PluginRepo (by addr) |

- **app/** — proposals from both plugins in one labelled list (Private/Public), a single
  create form with a privacy toggle, and per-plugin voting/detail pages. See `app/README.md`.
- **contracts/** — `DeployInterfoldDao` creates the DAO and installs both plugins atomically.
  See `contracts/README.md`.

## Quick start

```bash
# Frontend
cd app && bun install && bun dev

# Contracts
cd contracts && make setup && make build && make test
```
