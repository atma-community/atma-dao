# Contributing to ATMA DAO

Thanks for your interest in contributing! This guide covers how to get set up
and the expectations for changes.

## Getting started

See the [README](./README.md) for prerequisites and build instructions. In
short:

```sh
# On-chain
cd onchain && aiken check && aiken build

# Off-chain
cd offchain && npm install && cp config.example.json config.json
```

## Development workflow

1. Fork the repository and create a feature branch off `main`.
2. Make your change with focused, well-described commits.
3. Ensure everything passes locally before opening a PR (see below).
4. Open a pull request describing **what** changed and **why**.

## Before you open a PR

On-chain changes must pass the same checks as CI:

```sh
cd onchain
aiken fmt --check   # formatting
aiken check -D      # tests, with warnings treated as errors
aiken build         # compilation
```

Off-chain changes:

```sh
cd offchain
npm test
```

If you change a validator, rebuild the blueprint and update the copy the
off-chain code consumes (`offchain/src/plutus.json`).

## Conventions

- Keep validator logic in `onchain/validators/`; shared code and tests in
  `onchain/lib/dao/` (tests in `test_*.ak`).
- Add or update tests alongside behavior changes — prefer property-based tests
  for validator invariants.
- Never commit secrets. `config.json`, seed phrases, and API keys are
  git-ignored for a reason.

## Reporting bugs

Open a GitHub issue with steps to reproduce, the network you were on, and any
relevant transaction hashes or error output. For security issues, follow
[SECURITY.md](./SECURITY.md) instead of filing a public issue.

## License

By contributing, you agree that your contributions will be licensed under the
[Apache License 2.0](./LICENSE).
