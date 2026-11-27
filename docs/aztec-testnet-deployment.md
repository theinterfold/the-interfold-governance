# Aztec testnet deployment (private ballots on Aztec)

This guide moves the private stage of a **testnet** DAO from Sepolia ballots to Aztec ballots.
Weights stay the BondedVotes `getPastVotes(slot, snapshot) / divisor` of the round. Nothing here is
for mainnet. Nothing in this guide deploys by itself: each step is run by the operator.

## What changes in the governance contracts

Nothing in the Solidity. `CrispVoting` talks to its E3 program through `earliestVotingStart()`,
`availabilityFinalizationWindow()`, `decodeTally(e3Id)` and `votingPowerDivisorOf(e3Id)`, and encodes the seven-field
`customParams` of `CRISPProgram`. `CRISPAztecVotesProgram` implements all of these, so the DAO only needs its address in
`CRISP_PROGRAM_ADDRESS`. Two differences:

- `availabilityFinalizationWindow()` is `0`: the E3 input window ends at the voting end and no Avail tail exists. The Interfold
  compute window (604800 s on Sepolia) must be at least the program's `remoteFinalityWindow()` (10800 s); the program checks
  this at request time.
- Ballots go to Aztec and L1 sees only the input root. Weights reach Aztec through the permissionless L1 `enroll`.

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

Sepolia (11155111), Interfold v0.20.0 `0x5611c8aa517FE57D05229Ff94eA37E88b1b8FDDB`, Aztec testnet (rollup version
679261766). Requests use parameter set 4 (`insecure-64`) and the minimum committee.

| Contract | Address |
| --- | --- |
| `CRISPAztecVotesProgram` (Sepolia, block 12220048) | `0xb42772d7b79901d7269202d9b5F366E4dC0F7275` |
| `CrispAztecVotes` (Aztec, block 71607) | `0x28fe29ac3e8a082e115c81a77e0593a990c33403890f868d6750b1a54e8aa620` |
| BondedVotes (voting token) | `0x9e32510C3249Bb0EfBC363929ED7278406a6e8B4` |
| DAO | `0x2ddc10290453AA5F77C2aBa8438Cf0373bEdd5D9` |
| CRISP plugin (private body) | `0xd909313Cec8CA36A71d31cDcbBC9c347afb40AD9` |
| TokenVoting plugin (public body) | `0x498bbaf963a888E9CE981A406ce15CD1b4537e1E` |
| SPP, private process | `0x5ca84D70b728564624591251C21E52CC1b6559fc` |
| SPP, public process | `0xcB07a1682015541A5Ba1b0148732d7da6E3eF2EC` |
| `VotingFaucet` | `0x2D91A520b40D5799EA7Ea2A9849034CB1AE99BC7` |

Plugin deployment block 12220059. The CRISP server for this program is served at
`https://private-crisp.theinterfold.com/aztec-gov` (infra `playbooks/crisp-aztec-gov.yml`). On Sepolia, `forge script` needs
`--with-gas-price 2000000 --priority-gas-price 1000000 --gas-estimate-multiplier 500`: 900 pushes the `CrispVoting` deployment
past the block gas limit.

## CRISP SDK

The app uses `@crisp-e3/sdk@0.29.0` and `@crisp-e3/aztec@0.29.0`, the production CRISP release built against Interfold
v0.20.0. It holds the real `insecure-64` and `secure-8192` bundles and selects one from the round's parameter set.
