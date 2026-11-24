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

Sepolia (11155111), Interfold `0xb35EE9ed8BE5967daabBA8c2e817C52D0b57ac26`, Aztec testnet (rollup version 679261766).

| Contract | Address |
| --- | --- |
| `CRISPAztecVotesProgram` (Sepolia, block 12202493) | `0xC6F8e289a1316B9ecAFaDaB98d211dcb66D66c86` |
| `CrispAztecVotes` (Aztec, block 63163) | `0x2b394523778956defd3c1de36721424e775689ee56b849234efaeeb88ba690e0` |
| DAO | `0xCd070cB917b06fA2A3A6Df785320Cf68D959d503` |
| CRISP plugin (private body) | `0x41D537D70F626fA1b3a4aF2B7BdD5BcC1556EE5a` |
| TokenVoting plugin (public body) | `0x95453f560497A9Abc2ec063f024E401F822F73F7` |
| SPP, private process | `0x2eEd223B136cD75f2bAFFac5130dD4f7BDE92ed0` |
| SPP, public process | `0x1d1eb5Abd26590EA20790886f9e65511D7CaCe37` |

Plugin deployment block 12202503. The CRISP server for this program is served at
`https://private-crisp.theinterfold.com/aztec-gov` (infra `playbooks/crisp-aztec-gov.yml`). On Sepolia, `forge script` needs
`--with-gas-price 2000000 --priority-gas-price 1000000 --gas-estimate-multiplier 500`: 900 pushes the `CrispVoting` deployment
past the block gas limit.

## Testing SDK: testnet only

The app uses `@crisp-e3/sdk@0.29.0-insecure.0` and `@crisp-e3/aztec@0.29.0-insecure.0`, the CRISP testing release. In that release `insecure-64` is real and `secure-8192` is a stub, and the app uses it on every path. This branch must not deploy to mainnet until the app uses a production release of both packages.
