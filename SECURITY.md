# Security

## Reporting a vulnerability

Do **not** open a public issue for a security report. Email the maintainers privately and allow
time for a fix before disclosure. Include a description, affected contracts/addresses, and a
reproduction (a Foundry test is ideal).

## Trust model

Read [`docs/architecture.md`](docs/architecture.md) first — it explains staged governance. What
follows is the short version of who can do what, and what has to be trusted.

### On-chain

- **Only the two SPPs hold `EXECUTE_PERMISSION` on the DAO.** The voting bodies (CrispVoting,
  TokenVoting) are stage-0 bodies and must never (re)gain it — that would let a proposer bypass
  the foundation stage entirely. `test_prepareInstallationNeverRequestsExecutePermissionOnTheDao`
  guards the install path; verify the live grants after any deploy (see the runbook below).
- **The foundation body is the last line of defence.** In `approval` mode it must explicitly
  approve or the proposal expires; in `veto` mode silence is consent. Whoever controls that
  address can block (approval mode) or veto (veto mode) every proposal.
  - **Production requirement: this must be a multisig, not an EOA.** In approval mode, losing the
    key freezes governance permanently — every future proposal expires unapproved.
- **The Admin plugin must be disarmed after wiring.** `make wire-spp` revokes it. An armed Admin
  plugin can execute on the DAO with no vote at all.
- **Minting the governance token is DAO-only.** `CrispVotingSetup` grants `MINT_PERMISSION` to the
  DAO. It previously granted to `ANY_ADDR` ("for testing"), which would have let anyone mint
  voting power; `test_prepareInstallationGrantsMintToTheDaoOnlyNeverToAnyAddr` prevents a
  regression.

### Off-chain (trusted, by design)

These are real trust assumptions, not bugs — but they are worth stating plainly:

- **The CRISP server** supplies the eligible-voter set and merkle leaves for private voting, and
  receives every encrypted ballot. If it is down, private voting stops. If it is dishonest about
  the voter set, ballots will not match. Public (TokenVoting) proposals do not depend on it.
- **IPFS pinning** holds proposal titles/summaries/bodies. On-chain actions survive a lost pin,
  but the human-readable description does not. A single pinning provider is a single point of
  failure.
- **The RPC endpoint** shapes everything the UI displays. A malicious RPC can lie about state; it
  cannot forge a signature or move funds.

## Secrets

**Never give a credential a `NEXT_PUBLIC_` prefix.** Next inlines those into the client bundle,
so a `NEXT_PUBLIC_*` secret is readable by every visitor. Server-only credentials live without
the prefix and are read exclusively inside `app/pages/api/*`:

| Variable            | Read by                  | Never              |
| ------------------- | ------------------------ | ------------------ |
| `PINATA_JWT`        | `pages/api/ipfs/pin.ts`  | the browser        |
| `ETHERSCAN_API_KEY` | `pages/api/etherscan.ts` | the browser        |
| `PRIVATE_KEY`       | Foundry deploy scripts   | anywhere in `app/` |

CI enforces this: the `secret-hygiene` job fails the build if a secret-shaped variable appears
behind `NEXT_PUBLIC_`.

If either credential was ever committed or shipped behind a `NEXT_PUBLIC_` prefix, **rotate it** —
removing it from the code does not un-publish it.

## Deployment verification runbook

Run after every deploy, before announcing it. Set `DAO`, `RPC`, and the plugin addresses from
`contracts/.env`.

```bash
EXEC=$(cast keccak "EXECUTE_PERMISSION")
ROOT=$(cast keccak "ROOT_PERMISSION")
has() { cast call $DAO "hasPermission(address,address,bytes32,bytes)(bool)" $DAO $1 $2 0x --rpc-url $RPC; }

# MUST be true — only the SPPs execute on the DAO
has $SPP_PRIVATE_ADDRESS $EXEC
has $SPP_PUBLIC_ADDRESS  $EXEC

# MUST all be false
has $CRISP_VOTING_PLUGIN_ADDRESS $EXEC   # a body must never execute directly
has $TOKEN_VOTING_PLUGIN_ADDRESS $EXEC
has $ADMIN_PLUGIN_ADDRESS        $EXEC   # Admin must be disarmed post-wiring
has $DEPLOYER_ADDRESS            $ROOT   # deployer must not retain ROOT

# The foundation body must be a contract (multisig), not an EOA:
cast code $FOUNDATION_ADDRESS --rpc-url $RPC | wc -c   # 3 == EOA == not production-ready
```

Also confirm the stage-1 mode matches intent — `vetoThreshold == 0` means **approval** mode
(opt-in), anything else means **veto** mode (opt-out):

```bash
cast call $SPP_PRIVATE_ADDRESS "getStages(uint16)" <stageConfigIndex> --rpc-url $RPC
```

## Known limitations

- No external audit has been performed. See the coverage numbers in CI; `CrispVoting.sol` branch
  coverage is still incomplete.
- Proposal metadata has a single pinning provider.
- The faucet (`NEXT_PUBLIC_ENABLE_FAUCET`) is testnet-only scaffolding and must be disabled in
  production.
