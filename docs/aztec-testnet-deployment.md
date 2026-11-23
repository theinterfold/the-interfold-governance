# Aztec testnet deployment (private ballots on Aztec)

This guide moves the private stage of a **testnet** DAO from Sepolia ballots to Aztec ballots.
Weights stay the BondedVotes `getPastVotes(slot, snapshot) / divisor` of the round. Nothing here is
for mainnet. Nothing in this guide deploys by itself: each step is run by the operator.

## What changes in the governance contracts

Nothing in the Solidity. `CrispVoting` talks to its E3 program through four views only:
`earliestVotingStart()`, `availabilityFinalizationWindow()`, `decodeTally(e3Id)` and
`votingPowerDivisorOf(e3Id)`. It also encodes the seven-field `customParams` of `CRISPProgram`.
`CRISPAztecVotesProgram` implements all of these, so the DAO only needs its address in
`CRISP_PROGRAM_ADDRESS`.

| Plugin assumption                                        | With `CRISPAztecVotesProgram`                                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `customParams` has seven fields                          | Same layout. The program accepts CUSTOM credits, `credits == 0` and ONCHAIN census, which the plugin always sends. |
| `availabilityFinalizationWindow()`                       | `0`. The E3 input window ends at the voting end. No Avail tail exists.                                         |
| Compute window covers the late-input tail                | The Interfold compute window (604800 s on Sepolia; 21600 s is the decryption window) must be at least `remoteFinalityWindow` (10800 s). The program checks this at request time. |
| Tally becomes readable inside stage-0 `maxAdvance`       | Readable at `shift + vote + computeWindow`. This is never later than with `CRISPProgram`, so the headroom is the same or larger. |
| Divisor in `votingPowerDivisorOf`                        | Recorded when the round is requested, with the `CRISPProgram` rule. Quorum math is unchanged.                  |
| Refunds (`claimRefund`)                                  | Interfold refunds failed E3s. The program holds no fee, so the path is unchanged.                              |
| Inputs on L1                                             | None. Ballots go to Aztec, weights go to Aztec through the permissionless L1 `enroll`. L1 sees only the input root. |

## Steps

1. Deploy the Aztec side and the L1 program first (CRISP repo, `extensions/aztec`). Record the
   `CRISPAztecVotesProgram` address. Register it in Interfold (`e3Programs(address)` must return
   `true`).
2. Check the compute window:
   ```bash
   cast call $INTERFOLD 'getTimeoutConfig()((uint256,uint256,uint256))' --rpc-url "$RPC_URL"
   # the second value (compute window) must be >= remoteFinalityWindow()
   cast call $PROGRAM 'remoteFinalityWindow()(uint256)' --rpc-url "$RPC_URL"
   cast call $PROGRAM 'availabilityFinalizationWindow()(uint256)' --rpc-url "$RPC_URL"   # expect 0
   ```
3. In `contracts/.env` set `CRISP_PROGRAM_ADDRESS` to the votes program. Keep `MINIMUM_DURATION`
   and `SPP_PRIVATE_VOTE_DURATION` at or above the program's `minVotingDuration()`.
4. Redeploy the DAO: `make deploy`. The program address is fixed in the plugin and cannot be
   changed later, so a program change needs a new DAO.
5. `make sync-env`. It copies `CRISP_PROGRAM_ADDRESS` to `NEXT_PUBLIC_CRISP_PROGRAM_ADDRESS` in
   `app/.env`. Set `NEXT_PUBLIC_CRISP_VOTING_CHAIN=aztec` in the app env.
6. Point the CRISP server at the program with `PROGRAM_KIND=aztec-votes`, and start the keeper in
   `votes` mode (CRISP repo docs). The server relays the L1 `enroll` so voters pay nothing.
7. Fork-test one proposal before use: create, enroll, vote, close, tally, execute.

## Current testnet deployment

Sepolia (11155111), Interfold `0xb35EE9ed8BE5967daabBA8c2e817C52D0b57ac26`, Aztec testnet (rollup version 679261766).

| Contract | Address |
| --- | --- |
| `CRISPAztecVotesProgram` (Sepolia, block 12198396) | `0x08e1C6288fb0E6f2a1850F08Db632dBC89c309Dc` |
| `CrispAztecVotes` (Aztec, block 61045) | `0x2e9309f3c0dd3b1870d51bd219d777b7d6c8f16a01a5a399036b3504055c8b98` |
| DAO | `0x3b64638240bC6543018056265F5b244d05dAAc1E` |
| CRISP plugin (private body) | `0x4645814aDba1e90fF88bd4C5F869d8B7aB96b861` |
| TokenVoting plugin (public body) | `0xC16ae9D68F600c85aA49D094aF146AACb0E10494` |
| SPP, private process | `0x65423ABa2698407E753e476C6ae342076FC3411a` |
| SPP, public process | `0x927D9673B1B2986f057347635a67bB5F3c360816` |

Plugin deployment block 12198434. The CRISP server for this program is served at
`https://private-crisp.theinterfold.com/aztec-gov` (infra `playbooks/crisp-aztec-gov.yml`). On Sepolia, `forge script` needs
`--with-gas-price 2000000 --priority-gas-price 1000000 --gas-estimate-multiplier 500`: 900 pushes the `CrispVoting` deployment
past the block gas limit.

## Vendored SDK: testnet only

`app/vendor/crisp-e3-sdk-0.28.1.tgz` is a `build:testing` build of `@crisp-e3/sdk` (`insecure-64` is real, `secure-8192` is a stub), and the app uses it on every path. This branch must not deploy to mainnet until the tarball is rebuilt with `build:prod`.
