import os
import sys
import time
from eth_account import Account
from genlayer_py import create_client, studionet

CONTRACT_ADDRESS = "0xbB14bFF145C3422f05a51ccD515dbeF770435815"
PRIVATE_KEY = os.environ.get(
    "GENLAYER_PRIVATE_KEY",
    "0xf4bfb7f98529b7acf3ec1e9fc2fcf1d573d15d7485163dc35df4ecf4cc695b0f",
)

MARKETS_TO_SEED = [
    {
        "question": "Will Ethereum mainnet activate the Pectra upgrade before Q3 2026?",
        "source_url": "https://eips.ethereum.org/EIPS/eip-7600",
        "rules": (
            "Resolves to YES if Ethereum consensus specifications confirm that the Pectra network "
            "upgrade (EIP-7600) has been activated on Ethereum mainnet prior to July 1, 2026. "
            "Resolves to NO if officially abandoned or deadline passes without activation. "
            "Returns NOT_YET if the event is pending."
        ),
        "deadline": "2026-07-01T00:00:00Z",
        "seed_liquidity_wei": 1_000_000_000_000_000_000,  # 1 GEN
    },
    {
        "question": "Will Bitcoin reach a new all-time high above $150,000 USD before end of 2026?",
        "source_url": "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
        "rules": (
            "Resolves to YES if CoinGecko official price data verifies Bitcoin traded at or above "
            "$150,000.00 USD at any point prior to December 31, 2026. "
            "Resolves to NO if the deadline passes without reaching this price. "
            "Returns NOT_YET if ongoing below target."
        ),
        "deadline": "2026-12-31T23:59:59Z",
        "seed_liquidity_wei": 2_000_000_000_000_000_000,  # 2 GEN
    },
    {
        "question": "Will SpaceX complete an uncrewed Starship landing on Mars before November 2026?",
        "source_url": "https://en.wikipedia.org/wiki/SpaceX_Starship",
        "rules": (
            "Resolves to YES if SpaceX officially confirms a successful uncrewed Starship landing on the "
            "surface of Mars before November 1, 2026. "
            "Resolves to NO if the deadline passes without confirmation. "
            "Returns NOT_YET if mission is scheduled or ongoing."
        ),
        "deadline": "2026-11-01T00:00:00Z",
        "seed_liquidity_wei": 1_000_000_000_000_000_000,  # 1 GEN
    },
]


def main():
    rpc_endpoint = studionet.rpc_urls["default"]["http"][0]
    print(f"Connecting to Studionet (RPC: {rpc_endpoint})...")
    client = create_client(studionet)
    account = Account.from_key(PRIVATE_KEY)
    print(f"Deployer account: {account.address}")
    print(f"Contract address: {CONTRACT_ADDRESS}")

    seeded_txs = []

    for i, m in enumerate(MARKETS_TO_SEED):
        print(f"\n--- Seeding Market {i + 1}: {m['question']} ---")
        print(f"Initial seed liquidity: {m['seed_liquidity_wei']} wei ({m['seed_liquidity_wei'] / 1e18} GEN)")

        args = [
            m["question"],
            m["source_url"],
            m["rules"],
            m["deadline"],
        ]

        try:
            tx_hash = client.write_contract(
                address=CONTRACT_ADDRESS,
                function_name="create_market",
                account=account,
                value=m["seed_liquidity_wei"],
                args=args,
            )
            print(f"Tx submitted: {tx_hash}")
            print("Waiting for consensus acceptance...")
            receipt = client.wait_for_transaction_receipt(tx_hash, wait_until="decided", retries=30, interval=3000)
            status_name = getattr(receipt, "status_name", "ACCEPTED")
            print(f"Market {i + 1} accepted! Status: {status_name}")
            seeded_txs.append({
                "action": f"create_market_{i}",
                "market": m["question"],
                "tx_hash": str(tx_hash),
                "liquidity_gen": m["seed_liquidity_wei"] / 1e18,
            })
            time.sleep(2)
        except Exception as e:
            print(f"Error creating market {i + 1}: {e}")
            raise

    # Place a live bet on Market 0 (0.5 GEN on YES)
    print("\n--- Placing live bet on Market 0 (0.5 GEN on YES) ---")
    try:
        bet_wei = 500_000_000_000_000_000  # 0.5 GEN
        bet_tx = client.write_contract(
            address=CONTRACT_ADDRESS,
            function_name="place_bet",
            account=account,
            value=bet_wei,
            args=[0, "YES"],
        )
        print(f"Bet tx submitted: {bet_tx}")
        client.wait_for_transaction_receipt(bet_tx, wait_until="decided", retries=30, interval=3000)
        print("Bet accepted!")
        seeded_txs.append({
            "action": "bet_market_0_yes",
            "market": MARKETS_TO_SEED[0]["question"],
            "tx_hash": str(bet_tx),
            "bet_gen": 0.5,
        })
    except Exception as e:
        print(f"Error placing bet: {e}")

    # Read back current stats & markets
    print("\n--- Verifying Deployed State ---")
    stats = client.read_contract(
        address=CONTRACT_ADDRESS,
        function_name="get_stats",
        args=[],
    )
    print(f"Protocol Stats: {stats}")

    all_markets = client.read_contract(
        address=CONTRACT_ADDRESS,
        function_name="get_all_markets",
        args=[],
    )
    print(f"Total seeded markets: {len(all_markets)}")
    for m in all_markets:
        print(f"ID {m['id']}: {m['question']}")
        print(f"   YES: {m['yes_pool']} ({m['yes_probability']}%) | NO: {m['no_pool']} ({m['no_probability']}%)")

    import json
    with open("seeded_markets.json", "w") as f:
        json.dump(seeded_txs, f, indent=2)
    print("\nSaved seeded transaction details to seeded_markets.json")


if __name__ == "__main__":
    main()
