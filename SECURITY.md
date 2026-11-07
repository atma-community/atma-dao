# Security Policy

## Status

ATMA DAO is **unaudited, testnet / research software**. It is intended for use
on the Cardano Preview network only. Do not use it to custody or govern real
(mainnet) funds.

## Reporting a vulnerability

If you discover a security vulnerability, please report it **privately** rather
than opening a public issue:

- Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
  for this repository, **or**
- Contact the maintainers directly.

Please include a description of the issue, the affected component
(validator, endpoint, etc.), and steps to reproduce. We will acknowledge your
report and work with you on a fix and coordinated disclosure.

## Secrets

Never commit credentials. The following are intentionally git-ignored and must
stay local to your machine:

- `offchain/config.json` — contains the admin wallet seed phrase and Blockfrost
  key. Copy it from `config.example.json`.
- Any `.env` files.

If a secret is ever committed, treat it as compromised: rotate the key and
generate a fresh wallet, since values remain recoverable from git history.
