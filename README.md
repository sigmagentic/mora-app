# 🔐 MORA App

**MORA exists to capture human values the world cannot see — without ever revealing the people behind them.**

AI already owns almost all human data — behavior, language, preferences, and soon, even synthetic reasoning. But there is one dataset AI cannot access at scale: **authentic human morality.** But when moral decisions are made public, people self-censor.

**So, we are building a zero-knowledge system that captures how humans actually resolve moral dilemmas, without revealing who they are or what they chose.**

This creates a new class of data:

- Non-synthetic
- Non-performative
- Non-attributable
- Verifiably aggregated

We believe this “morality" dataset will become one of the most valuable datasets for AI alignment, safety, and reasoning — precisely because it cannot be extracted any other way.

**MORA is built as a fun and addictive game.** <a href="https://youtu.be/k-jo_bZvu6c" target="_blank">Watch a 3 Min Pitch on how it works</a>

## ✨ Features

- **🔑 Passwordless Authentication**: Secure login biometric passkeys (Face ID, Touch ID, Windows Hello) for Sybil protection and preventing of social engineering / phishing attacks
- **🔑 End-to-End Zero Knowledge Design**: Frontend and backend built with zero-knowledge principles (NO ONE can see your data EVER!)
- **🔑 PRF Key Derivation**: Biometrics passkeys used to generate data encryption keys on all modern browsers (PRF is the very latest in biometric-powered deterministic key generation and only available in modern devices and browsers)
- **🔑 Arcium Integration**: Random "morality polls" are aggregated via the decentralized Arcium Network, which has the ability to operate on encrypted data. These aggregations are private and yet verifiable, enabling us to build monetization strategies like private prediction markets that let the world bet on the collective human morality signals
- **🔑 Quantum Resistant data encryption**: from day 1, all data is protected from future quantum attacks (i.e. prevents harvest now-decrypt later attacks)
- **🔑 Bot Protection**: Integrated Cap.js CAPTCHA system
- **🔑 Cross-Platform**: Works across devices and browsers and soon to become a progressive web app (PWA) for mobile-native type access

## ✨ Arcium MXE (Private Aggregation of Sensitive Morality Data)

As mentioned above, this MORA app is connected to a 'backend' <a href="https://docs.arcium.com/multi-party-execution-environments-mxes/overview" target="_blank">Arcium MXE</a>. This MXE allows us to store encrypted private data in a `Solana Program` that then interfaces with the `Arcium Network`. The system can aggregate encrypted private data and then "reveal" the winning answers for each morality question. As everything is "encrypted and private", no data or identity is EVER leaked. And yet, we are able to use this private and verifiable aggregation to compose other monetization layers on top of MORA. For e.g., we are working on integrating a "morality prediction market" where people can bet on certain moral signals of the collective MORA userbase who answer highly sensitive moral questions. As the "winning" answers are private and yet provable, this allows the entire MORA stack to be private, zero-knowledge but yet be able to monetize with a fun game-type offering. The Arcium MXE has been deployed to devnet and is being upgraded soon to support future integration with production market. The MORA MXE is also open-source: <a href="https://github.com/sigmagentic/mora-mxe" target="_blank">https://github.com/sigmagentic/mora-mxe</a>

### Prerequisites

- Node.js 20+
- pnpm (recommended) or npm

### Error Codes

```
API:
ERR-ARCIUM-001: Missing SOLANA_PRC_URL_PRIVATE
ERR-ARCIUM-002: Missing ARCIUM_POLL_AUTHORITY_WALLET
ERR-ARCIUM-003: Failed to decode wallet from base64
ERR-ARCIUM-004: Invalid wallet secret key length
ERR-ARCIUM-005: General initialization error
ERR-ARCIUM-006: Failed to initialize cluster or MXE
ERR-ARCIUM-007: Failed to fetch MXE public key after retries
ERR-ARCIUM-008 through ERR-ARCIUM-010: Database query errors
ERR-ARCIUM-011: Interface not properly initialized
ERR-ARCIUM-012: Error creating on-chain poll
```

---

**Built with ❤️ for the ethical AI future**
