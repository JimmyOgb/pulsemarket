# PulseMarket ⚡

> **Oracle-Free Real-World Prediction Market powered by GenLayer Intelligent Contracts & Optimistic Democracy.**

PulseMarket is a decentralized, oracle-free pari-mutuel prediction market built on **GenLayer**. Unlike legacy prediction platforms that rely on centralized price feeds, multi-sig administrators, or slow multi-day dispute committees (e.g. UMA), PulseMarket delegates event resolution directly to GenLayer's decentralized validator network.

When a market is resolved, GenLayer validators independently fetch the authoritative live HTTPS webpage (`gl.nondet.web.get`), extract the factual context, and prompt an LLM (`gl.nondet.exec_prompt`) to determine the outcome according to strict unambiguous resolution rules — reaching cryptographic consensus under GenLayer's **Equivalence Principle**.

---

## 🌟 Key Features

- **True Oracle-Free Settlement:** No Chainlink oracles, no centralized API relayers, and no human dispute committees. Validators fetch and evaluate real-world web truth directly on-chain.
- **Optimistic Democracy & Equivalence Principle:** Multi-validator non-deterministic consensus ensures that subjective web data and LLM outputs reach strict deterministic state agreement.
- **Pari-Mutuel Prediction Pools:** Continuous liquidity pools where odds automatically update based on real stake ratios (`YES %` vs `NO %`), ensuring proportional fair payouts to winning stakers.
- **Zero Mocks & Zero Hardcoding:** 100% of telemetry, markets, probability bars, and rationales flow dynamically from live GenLayer Studionet contract storage.
- **4-Stage Consensus Lifecycle Tracker:** Transparent, live UI feedback tracking transactions through `SUBMITTING` → `PROPOSING` → `COMMITTING` → `FINALIZED`.
- **Permissionless Market Creation & Resolution:** Any user can create real-world prediction markets by specifying a question, authoritative HTTPS URL, and resolution criteria, or trigger AI validator settlement once the event concludes.

---

## 🔗 Live On-Chain Deployments (GenLayer Studionet)

| Parameter | Value |
| :--- | :--- |
| **Live Web App (Vercel)** | [https://frontend-seven-hazel-21.vercel.app](https://frontend-seven-hazel-21.vercel.app) |
| **GitHub Repository** | [https://github.com/JimmyOgb/pulsemarket](https://github.com/JimmyOgb/pulsemarket) |
| **Network** | GenLayer Studionet |
| **Chain ID** | `61999` (`0xf22f`) |
| **RPC Endpoint** | `https://studio.genlayer.com/api` |
| **Intelligent Contract Address** | `0xbB14bFF145C3422f05a51ccD515dbeF770435815` |
| **Deployment Transaction Hash** | `0x759af5933f3f6c93971490f790be8f5e4d25d88b48f758a07902fdd307432526` |
| **Deployer Account** | `0xE4220c4b71877bb94EB173f467ef5c5557017085` |

### Active Seeded Markets on Studionet

1. **Market #0:** *"Will Ethereum mainnet activate the Pectra upgrade before Q3 2026?"*
   - **Source URL:** [https://eips.ethereum.org/EIPS/eip-7600](https://eips.ethereum.org/EIPS/eip-7600)
   - **Creation Tx:** `0x557ab46dcaf3ca3ae86cbcd9d91570ff8b3aa4568f470e01c9904e928de2b465`
   - **Initial Seed:** 1.0 GEN + 0.5 GEN Bet on YES (`0x35901dc78b6f9cbdfc08a30e8c678a3ac9bd74a2c104eb5639745c8b7eb523f0`)
2. **Market #1:** *"Will Bitcoin reach a new all-time high above $150,000 USD before end of 2026?"*
   - **Source URL:** [https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd](https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd)
   - **Creation Tx:** `0x1783c1c9787d35ccee852f9aae1c86b2cf7ca9f8d60f5fdc286e6a26d158f5c8`
   - **Initial Seed:** 2.0 GEN (1.0 GEN YES / 1.0 GEN NO)
3. **Market #2:** *"Will SpaceX complete an uncrewed Starship landing on Mars before November 2026?"*
   - **Source URL:** [https://en.wikipedia.org/wiki/SpaceX_Starship](https://en.wikipedia.org/wiki/SpaceX_Starship)
   - **Creation Tx:** `0x9fff45b9d2f4dd4d31ea391dde2c713674eb4d4bcb5bd102d045708601988601`
   - **Initial Seed:** 1.0 GEN (0.5 GEN YES / 0.5 GEN NO)

---

## 📐 Pari-Mutuel Mathematical Model

When users place stakes on `YES` or `NO`, their funds enter the market's pooled liquidity. Implied probabilities and payouts are computed dynamically:

1. **Implied Probabilities:**
   $$\text{YES Probability} = \frac{\text{YES Pool}}{\text{YES Pool} + \text{NO Pool}} \times 100\%$$
   $$\text{NO Probability} = \frac{\text{NO Pool}}{\text{YES Pool} + \text{NO Pool}} \times 100\%$$

2. **Payout Calculation (Post-Resolution):**
   $$\text{Payout} = \frac{\text{User Winning Stake} \times (\text{YES Pool} + \text{NO Pool})}{\text{Winning Pool}}$$

---

## 🏛️ GenLayer Intelligent Contract (`contracts/pulsemarket.py`)

The contract is written in Python for the GenVM runner:
```python
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import genlayer.gl as gl
from genlayer.gl import TreeMap, u256, Address
# ...
```

### Settlement under Equivalence Principle:
```python
def resolve_nondet() -> str:
    # 1. Fetch live public webpage
    response = gl.nondet.web.get(market.resolution_source_url)
    text_content = response.text[:8000]

    # 2. Prevent prompt injection via XML framing
    prompt = f"""
    You are an impartial decentralized consensus judge evaluating a prediction market.
    Question: {market.question}
    Criteria: {market.resolution_rules}
    <web_content>{text_content}</web_content>
    Evaluate strictly and return JSON: {{"outcome": "YES"|"NO"|"NOT_YET", "rationale": "..."}}
    """
    return gl.nondet.exec_prompt(prompt)

# Multi-validator consensus enforcement
raw_result = gl.vm.run_nondet_unsafe(resolve_nondet)
```

---

## 🧪 Testing Suite (`tests/test_pulsemarket.py`)

PulseMarket includes a full Direct Mode test suite using pytest and `genlayer:test`:
- ✅ Market creation with initial payable liquidity seeding.
- ✅ Dynamic odds calculations across multiple betting participants.
- ✅ Non-deterministic evaluation resulting in `NOT_YET` (ensuring market stays `OPEN` with explanation recorded).
- ✅ Non-deterministic evaluation resulting in `YES`/`NO` resolution, accurate pari-mutuel payouts, balance transfers, and double-claim prevention.

To run tests:
```bash
pytest tests/test_pulsemarket.py -v
```

---

## 💻 Frontend Application (`frontend/`)

Built with Next.js 15 (App Router), TypeScript, Tailwind CSS, Lucide Icons, and `@genlayer/js`:
- Direct read-only RPC connection to Studionet on load (no wallet required to view markets, real-time odds, or AI rationales).
- Dual wallet connectivity: EIP-1193 Web3 Wallets (MetaMask, Rabby) with automatic network addition/switching to Studionet, plus developer private key authentication.
- Live 4-Stage visual consensus tracker for all transactions.

### Running Locally:
```bash
cd frontend
npm install
npm run dev
```

---

## 📜 License
MIT License. Built with ❤️ for the GenLayer Intelligent Contract ecosystem.
