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
  - The phased mainnet rollout **deliberately defers this** (`DISARM_ADMIN="false"`) so phase 2 can
    install the private process without a vote. For that window the `has $ADMIN_PLUGIN_ADDRESS
    $EXEC` check below is a known, dated exception rather than a finding — record the intended
    disarm date next to it.
  - **Who may drive an armed bootstrap** is `EXECUTE_PROPOSAL_PERMISSION` on the Admin *plugin*,
    not `EXECUTE` on the DAO. `make grant-admin` / `make revoke-admin` rotate it (deployer EOA →
    foundation multisig): two commands, never batched, with a successor-proves-it no-op proposal in
    between. Rotating is not disarming — while the grant overlaps, *both* holders can execute
    anything on the DAO.
  - **The successor must be a multisig, not an EOA** — same rule as the foundation body and for the
    same reason. `grantAdminTo()` enforces it unless `ADMIN_SUCCESSOR_ALLOW_EOA=true` (testnets).
  - Handing the bootstrap to the **same** address as `FOUNDATION_ADDRESS` collapses the stage
    separation: that signer set can then both approve and bypass stage 0. It also removes the
    escape hatch if the foundation key is lost — in approval mode that freeze is permanent.
- **Minting the governance token is DAO-only.** `CrispVotingSetup` grants `MINT_PERMISSION` to the
  DAO. It previously granted to `ANY_ADDR` ("for testing"), which would have let anyone mint
  voting power; `test_prepareInstallationGrantsMintToTheDaoOnlyNeverToAnyAddr` prevents a
  regression.

### Off-chain (trusted, by design)

These are real trust assumptions, not bugs — but they are worth stating plainly:

- **The CRISP server** supplies the eligible-voter set and merkle leaves for private voting, and
  receives every encrypted ballot. If it is down, private voting stops. Public (TokenVoting)
  proposals do not depend on it.
  - **The census is verifiable, not merely trusted.** The eligible-voters dialog rebuilds the
    census tree from the served leaves (SDK `generateMerkleTree`, the same LeanIMT + Poseidon
    the circuit uses) and compares it to the `merkleRoot` the CRISP program committed for that
    round, then re-derives each leaf from `getPastVotes` at the snapshot. A tampered set fails
    one of those two checks.
  - **Still trusted:** omission (a holder the server never lists cannot be checked from the
    list alone — that needs independent enumeration from token events) and ballot-level
    censorship (a vote accepted then dropped).
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

While the bootstrap is still armed on purpose (phase 1 → 3), also check **who can drive it**. This
is a permission on the Admin plugin, so `_where` is the plugin, not the DAO:

```bash
EXEC_PROPOSAL=$(cast keccak "EXECUTE_PROPOSAL_PERMISSION")
drives() { cast call $DAO "hasPermission(address,address,bytes32,bytes)(bool)" \
  $ADMIN_PLUGIN_ADDRESS $1 $EXEC_PROPOSAL 0x --rpc-url $RPC; }

drives $DEPLOYER_ADDRESS            # false once `make revoke-admin` has run
drives $ADMIN_SUCCESSOR_ADDRESS     # true after `make grant-admin`
```

Exactly one of these should be true outside a rotation window; both true means the rotation was
started and never finished. `drives $FOUNDATION_ADDRESS` returning true means the approver and the
bypass are the same signer set — intentional or not, note it.

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
