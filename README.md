# PulseMarket ⚡

> **Oracle-Free Real-World Prediction Market powered by GenLayer Intelligent Contracts & Optimistic Democracy.**

PulseMarket is a decentralized, oracle-free pari-mutuel prediction market built on **GenLayer**. Unlike legacy prediction platforms that rely on centralized price feeds, multi-sig administrators, or slow multi-day dispute committees (e.g. UMA), PulseMarket delegates event resolution directly to GenLayer's decentralized validator network.

When a market is resolved, GenLayer validators independently fetch the authoritative live HTTPS webpage (`gl.nondet.web.get`), extract the factual context, and prompt an LLM (`gl.nondet.exec_prompt`) to determine the outcome according to strict unambiguous resolution rules — reaching cryptographic consensus under GenLayer's **Equivalence Principle**.

---

## 🛡️ Steward Review Upgrades & Security Invariants

In accordance with official GenLayer Steward architectural reviews, PulseMarket implements deterministic on-chain cutoff enforcement and a trustless refund/recovery protocol guaranteeing that **zero user funds can ever be trapped**:

1. **Deterministic Cutoff Enforcement (`gl.message.datetime`):**
   - Market creation strictly requires `deadline_iso > current_time` (using GenVM's deterministic transaction timestamp), preventing retroactive market initialization.
   - Wagers via `place_bet` are strictly rejected once `gl.message.datetime >= market.deadline_iso`, protecting participants against post-event exploitation.
2. **Zero-Winner Pool Trustless Refunds:**
   - If a market resolves to an outcome where the winning side has zero stake (`winning_pool == 0`, e.g. all bets were placed on the losing side), the market transitions to the terminal `"VOIDED"` state rather than trapping liquidity.
   - 100% of staked capital is unlocked for full principal refund via `claim_refund()`.
3. **Inconclusive & Expired Market Recovery:**
   - Markets track a deterministic `refund_deadline_iso` (default 72 hours post-cutoff).
   - If an oracle resolution returns `INCONCLUSIVE` past `refund_deadline_iso`, the market transitions to `"VOIDED"`, enabling full refund for both sides.
4. **Permissionless `void_expired_market` Guarantee:**
   - If an external source URL permanently goes offline or 404s past `refund_deadline_iso`, any network participant can call `void_expired_market(market_id)` to void the market and release trapped funds without relying on an external oracle.

---

## 🌟 Key Features

- **True Oracle-Free Settlement:** No Chainlink oracles, no centralized API relayers, and no human dispute committees. Validators fetch and evaluate real-world web truth directly on-chain.
- **Optimistic Democracy & Equivalence Principle:** Multi-validator non-deterministic consensus ensures that subjective web data and LLM outputs reach strict deterministic state agreement.
- **Pari-Mutuel Prediction Pools:** Continuous liquidity pools where odds automatically update based on real stake ratios (`YES %` vs `NO %`), ensuring proportional fair payouts to winning stakers.
- **Trustless Principal Refunds:** Fully automated, deterministic `claim_refund()` mechanism for voided, inconclusive, or zero-winner markets.
- **Zero Mocks & Zero Hardcoding:** 100% of telemetry, markets, probability bars, and rationales flow dynamically from live GenLayer Studionet contract storage.
- **4-Stage Consensus Lifecycle Tracker:** Transparent, live UI feedback tracking transactions through `SUBMITTING` → `PROPOSING` → `COMMITTING` → `FINALIZED`.

---

## 🔗 Live On-Chain Deployments (GenLayer Studionet)

| Parameter | Value |
| :--- | :--- |
| **Live Web App (Vercel)** | [https://pulsemarket-genlayer.vercel.app](https://pulsemarket-genlayer.vercel.app) |
| **GitHub Repository** | [https://github.com/JimmyOgb/pulsemarket](https://github.com/JimmyOgb/pulsemarket) |
| **Network** | GenLayer Studionet |
| **Chain ID** | `61999` (`0xf22f`) |
| **RPC Endpoint** | `https://studio.genlayer.com/api` |
| **Upgraded Intelligent Contract Address** | `0x4f5b23c365fa4d93E2878d6537D4eCA90Ec4F451` |
| **Deployment Transaction Hash** | `0x718d8b58bae1a4c2b61f42531767cd93a0c01ef30e10a36100c96287af7c75a7` |
| **Deployer Account** | `0xE4220c4b71877bb94EB173f467ef5c5557017085` |

### Active Seeded Markets on Studionet

1. **Market #0:** *"Will Ethereum mainnet activate the Pectra upgrade before Q3 2027?"*
   - **Source URL:** [https://eips.ethereum.org/EIPS/eip-7600](https://eips.ethereum.org/EIPS/eip-7600)
   - **Cutoff:** `2027-07-01T00:00:00Z` | **Refund Expiry:** `2027-07-04T00:00:00+00:00`
   - **Creation Tx:** `0xecbd9a10c3c0043f303b2a83a1cde2823b8c970529e98675cec73999242b0b84`
   - **Initial Seed:** 1.0 GEN + 0.5 GEN Bet on YES (`0xb94c40c0cd43bbf7f40fd75895bf3d57a9bb9aff627ec6949b671a90bdb991e1`)
2. **Market #1:** *"Will Bitcoin reach a new all-time high above $150,000 USD before end of 2027?"*
   - **Source URL:** [https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd](https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd)
   - **Cutoff:** `2027-12-31T23:59:59Z` | **Refund Expiry:** `2028-01-03T23:59:59+00:00`
   - **Creation Tx:** `0x42c5e1b44674fb24da8c61d4ea2989957384fc78d3f9b66f149667c486387c83`
   - **Initial Seed:** 2.0 GEN (1.0 GEN YES / 1.0 GEN NO)
3. **Market #2:** *"Will SpaceX complete an uncrewed Starship landing on Mars before November 2027?"*
   - **Source URL:** [https://en.wikipedia.org/wiki/SpaceX_Starship](https://en.wikipedia.org/wiki/SpaceX_Starship)
   - **Cutoff:** `2027-11-01T00:00:00Z` | **Refund Expiry:** `2027-11-04T00:00:00+00:00`
   - **Creation Tx:** `0x202359b0c9d6978779068ebe5588a29dd4901a248248bffd2f2068bed3f94f59`
   - **Initial Seed:** 1.0 GEN (0.5 GEN YES / 0.5 GEN NO)

---

## 🧪 Direct Mode Test Verification (`tests/test_pulsemarket.py`)

Every required edge case is strictly proven with 100% pass rate in Direct Mode using `vm.warp(...)`:
- `test_market_creation_and_stats`: Initial seed liquidity, statistics tracking, and cutoff exposure.
- `test_create_market_rejects_past_cutoff`: Reverts deterministically if `deadline_iso <= current_time`.
- `test_post_cutoff_wagers_rejected`: Wagers before cutoff succeed; wagers at or after `deadline_iso` fail.
- `test_standard_two_sided_resolution_and_payout`: Standard two-sided market resolves, pays winner, prevents double claims.
- `test_zero_stake_on_winning_side_triggers_refund`: Users bet ONLY on losing side (`winning_pool == 0`) -> market enters `"VOIDED"` terminal state -> all bettors recover 100% of their funds with zero trapped liquidity.
- `test_inconclusive_past_resolution_window_triggers_refund`: Inconclusive outcome past `refund_deadline_iso` transitions to `"VOIDED"` and enables full refunds.
- `test_void_expired_market_when_source_unreachable`: Permissionless void triggers when source is unreachable past refund expiry.

Run tests locally:
```bash
pytest tests/test_pulsemarket.py -v
```

---

## 💻 Frontend Application (`frontend/`)

Built with Next.js 16 (Turbopack), TypeScript, Tailwind CSS, Lucide Icons, and `@genlayer/js`:
- Real-time display of **Betting Cutoff (`deadline_iso`)** and **Refund Expiry (`refund_deadline_iso`)**.
- Automatic frontend disablement with `"Betting Closed (Cutoff Passed)"` badge when `Date.now() >= deadline_iso`.
- `"VOIDED / REFUNDABLE"` badge with one-click **"Claim Full Refund"** button whenever markets are voided.
- Permissionless **"Void Expired Market"** action when markets exceed refund deadlines.
- Direct read-only RPC connection to Studionet on load (no wallet required to view markets, odds, or rationales).
- Dual wallet connectivity: EIP-1193 Web3 Wallets (MetaMask, Rabby) with automatic network addition/switching, plus private key authentication.
- Live 4-Stage visual consensus tracker for all transactions.

---

## 📜 License
MIT License. Built with ❤️ for the GenLayer Intelligent Contract ecosystem.
