# ATMA DAO — Staking Basket DAO

On-chain governance for a Cardano **staking basket**. ATMA DAO lets voting-token
holders propose and vote on changes to a basket's **pool composition** and
**fee percentage** through token-weighted, time-boxed proposals settled entirely
on-chain.

The project is split in two:

| Directory    | Stack                              | Role                                            |
| ------------ | ---------------------------------- | ----------------------------------------------- |
| [`onchain/`](./onchain)  | [Aiken](https://aiken-lang.org) (Plutus V3) | Validators that enforce the governance rules    |
| [`offchain/`](./offchain) | TypeScript · [MeshJS](https://meshjs.dev) | CLI that builds, signs, and submits transactions |

> ⚠️ **Status: testnet / research.** This code is provided as-is and has **not**
> been audited. Do not use it to custody real funds. See [Security](#security).

---

## How it works

Governance state lives in a single **GOV UTxO** at the governance validator,
identified by a unique DAO NFT. Its datum holds the basket state (pool
composition + fee), the governance parameters (deposits, quorum, timing), and an
optional ongoing proposal.

Voting uses a **sharding** pattern to avoid UTxO contention: instead of every
voter competing to update one UTxO, the proposer spawns N independent *shard*
UTxOs. Voters cast ballots into separate shards concurrently, locking their
voting tokens into a **vote position** until an unlock time. After the voting
period closes, the shards are merged back into the proposal tally and the
result is applied.

```
init ──▶ propose ──▶ create-shards ──▶ vote (×N, concurrent) ──▶ merge-shards ──▶ end-proposal
                                           │
                                           └──▶ unlock (reclaim tokens after unlock time)
```

### Validators (`onchain/validators/`)

| Validator          | Redeemers                                           | Responsibility                                      |
| ------------------ | --------------------------------------------------- | --------------------------------------------------- |
| `governance`       | `CreateProposal`, `CreateShards`, `MergeShardsGOV`, `EndProposal` | Owns the GOV UTxO; controls the proposal lifecycle  |
| `shards_manager`   | `Vote(Yes\|No)`, `MergeShards`                      | Holds per-shard vote tallies                        |
| `voting_position`  | `UnlockPosition`                                    | Locks a voter's tokens until the unlock time        |

Shared types and helpers live in `onchain/lib/dao/`, with `test_*.ak` modules
providing unit and property-based tests.

### Off-chain endpoints (`offchain/src/endpoints/`)

`initialize`, `create_proposal`, `create_shards`, `vote`, `merge_shards`,
`end_proposal`, `unlock_position`, and `stats` (read-only queries). The
`DAOContext` in `offchain/src/daoContext.ts` parameterizes and serializes the
validators from `plutus.json` and resolves their addresses.

---

## Prerequisites

- [Aiken](https://aiken-lang.org/installation-instructions) `v1.1.19`
- [Node.js](https://nodejs.org) `>= 20`
- A [Blockfrost](https://blockfrost.io) project ID for the Cardano **Preview** network
- A funded Preview-testnet wallet mnemonic ([faucet](https://docs.cardano.org/cardano-testnets/tools/faucet))

## Build the on-chain contracts

```sh
cd onchain
aiken check   # run the test suite
aiken build   # compile validators to plutus.json
```

The off-chain CLI reads its blueprint from `offchain/src/plutus.json`. After
rebuilding, copy the freshly generated blueprint over if the validators changed:

```sh
cp onchain/plutus.json offchain/src/plutus.json
```

## Configure & run the off-chain CLI

```sh
cd offchain
npm install

# Create your local config from the template and fill in your own credentials.
cp config.example.json config.json
```

`config.json` is **git-ignored** and must contain your own testnet wallet seed
and Blockfrost key:

```json
{
  "setup": {
    "adminSeed": "<24-word preview-testnet mnemonic>",
    "blockfrostKey": "<preview blockfrost project id>",
    "network": "Preview"
  }
}
```

Then drive the DAO:

```sh
npm run dao status                              # inspect full DAO state
npm run dao init                                # create the GOV UTxO
npm run dao propose --type fee --fee 3          # propose a fee change
npm run dao propose --type composition --comp '[["<pool-pkh>",50]]'
npm run dao create-shards -n 4                  # spawn 4 voting shards
npm run dao vote --choice yes --amount 100      # lock 100 tokens, vote yes
npm run dao merge-shards                         # tally shards (after voting ends)
npm run dao end-proposal                         # apply the result
npm run dao unlock --tx <hash> --index 0        # reclaim locked tokens
```

Run the off-chain test suite with:

```sh
npm test
```

---

## Project layout

```
atma-dao/
├── onchain/                 # Aiken smart contracts (Plutus V3)
│   ├── validators/          # governance, shards_manager, voting_position
│   ├── lib/dao/             # shared types, helpers, and tests
│   └── aiken.toml
├── offchain/                # TypeScript MeshJS CLI
│   ├── app/cli.ts           # CLI entry point
│   ├── src/endpoints/       # one module per governance action
│   ├── src/daoContext.ts    # validator parameterization & datum codecs
│   └── config.example.json  # copy to config.json (git-ignored)
└── .github/workflows/       # CI: aiken fmt/check/build
```

## Contributing

Contributions are welcome — please read [CONTRIBUTING.md](./CONTRIBUTING.md).

## Security

This is unaudited testnet software. Never commit a `config.json`, seed phrase,
or API key. To report a vulnerability, see [SECURITY.md](./SECURITY.md).

## License

Licensed under the [Apache License 2.0](./LICENSE).
