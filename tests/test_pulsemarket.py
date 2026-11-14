import json
import pytest


def to_hex_addr(addr):
    if hasattr(addr, "as_hex"):
        return addr.as_hex.lower()
    if isinstance(addr, bytes):
        return ("0x" + addr.hex()).lower()
    return str(addr).lower()


def test_market_creation_and_stats(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/pulsemarket.py")

    # Alice creates a market with initial payable seed liquidity (1000 wei -> 500 YES, 500 NO)
    direct_vm.sender = direct_alice
    direct_vm.value = 1000

    market_id = contract.create_market(
        "Will Ethereum activate Pectra in 2026?",
        "https://eips.ethereum.org/EIPS/eip-7600",
        "Resolves YES if Pectra is live on mainnet before end of 2026, otherwise NO.",
        "2026-12-31T23:59:59Z",
    )
    assert market_id == 0

    # Verify market state
    market = contract.get_market(0)
    assert market["id"] == 0
    assert market["question"] == "Will Ethereum activate Pectra in 2026?"
    assert market["resolution_source_url"] == "https://eips.ethereum.org/EIPS/eip-7600"
    assert market["status"] == "OPEN"
    assert market["outcome"] == "PENDING"
    assert market["yes_pool"] == "500"
    assert market["no_pool"] == "500"
    assert market["total_positions"] == 2
    assert market["yes_probability"] == 50
    assert market["no_probability"] == 50

    # Verify get_all_markets
    all_markets = contract.get_all_markets()
    assert len(all_markets) == 1
    assert all_markets[0]["id"] == 0

    # Verify stats
    stats = contract.get_stats()
    assert stats["total_markets"] == 1
    assert stats["open_markets"] == 1
    assert stats["resolved_markets"] == 0
    assert stats["total_volume_locked"] == "1000"


def test_placing_bets_and_odds_update(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/pulsemarket.py")

    # Alice creates market with 1000 seed (500 YES / 500 NO)
    direct_vm.sender = direct_alice
    direct_vm.value = 1000
    market_id = contract.create_market(
        "Will BTC exceed $150k in 2026?",
        "https://coingecko.com/en/coins/bitcoin",
        "Resolves YES if BTC hits $150k before 2026 deadline.",
        "2026-12-31T23:59:59Z",
    )

    # Bob places 1500 on YES
    direct_vm.sender = direct_bob
    direct_vm.value = 1500
    contract.place_bet(market_id, "YES")

    # Charlie places 500 on NO
    direct_vm.sender = direct_charlie
    direct_vm.value = 500
    contract.place_bet(market_id, "NO")

    # Pool state: YES = 500 + 1500 = 2000, NO = 500 + 500 = 1000. Total = 3000.
    # Implied odds: YES = 2000/3000 = 66.67%, NO = 1000/3000 = 33.33%
    market = contract.get_market(market_id)
    assert market["yes_pool"] == "2000"
    assert market["no_pool"] == "1000"
    assert market["total_positions"] == 4  # 2 initial + 2 bets
    assert market["yes_probability"] == 66
    assert market["no_probability"] == 33

    # Check user positions
    bob_pos = contract.get_user_position(market_id, to_hex_addr(direct_bob))
    assert bob_pos["yes_stake"] == "1500"
    assert bob_pos["no_stake"] == "0"
    assert bob_pos["claimed"] is False

    charlie_pos = contract.get_user_position(market_id, to_hex_addr(direct_charlie))
    assert charlie_pos["yes_stake"] == "0"
    assert charlie_pos["no_stake"] == "500"
    assert charlie_pos["claimed"] is False


def test_resolve_market_not_yet(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/pulsemarket.py")

    direct_vm.sender = direct_alice
    direct_vm.value = 1000
    market_id = contract.create_market(
        "Will SpaceX land Starship on Mars by Q4 2026?",
        "https://spacex.com/launches",
        "Resolves YES if landed on Mars, NO if deadline passed without landing.",
        "2026-10-01T00:00:00Z",
    )

    # Mock web response: landing still in progress
    direct_vm.mock_web(
        r".*spacex\.com.*",
        {
            "status": 200,
            "body": "SpaceX is currently preparing Starship orbital flight tests. Mars missions planned for late 2026.",
        },
    )

    # Mock LLM evaluation: NOT_YET
    direct_vm.mock_llm(
        r".*prediction market resolver.*",
        json.dumps({
            "outcome": "NOT_YET",
            "rationale": "SpaceX Starship Mars mission has not yet launched; event is pending.",
        }),
    )

    res_str = contract.resolve_market(market_id)
    res_data = json.loads(res_str)
    assert res_data["outcome"] == "NOT_YET"
    assert "pending" in res_data["rationale"].lower()

    # Market should remain OPEN
    market = contract.get_market(market_id)
    assert market["status"] == "OPEN"
    assert market["outcome"] == "PENDING"
    assert "pending" in market["resolution_rationale"].lower()

    direct_vm.clear_mocks()


def test_resolve_market_yes_and_payout_claim(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/pulsemarket.py")

    # Creator seed: 1000 wei (500 YES / 500 NO)
    direct_vm.sender = direct_alice
    direct_vm.value = 1000
    market_id = contract.create_market(
        "Will Ethereum Dencun upgrade activate before June 2024?",
        "https://github.com/ethereum/execution-specs/releases",
        "Resolves YES if Dencun mainnet activated before June 2024.",
        "2024-06-01T00:00:00Z",
    )

    # Bob bets 1500 on YES
    direct_vm.sender = direct_bob
    direct_vm.value = 1500
    contract.place_bet(market_id, "YES")

    # Charlie bets 1000 on NO
    direct_vm.sender = direct_charlie
    direct_vm.value = 1000
    contract.place_bet(market_id, "NO")

    # Total pools:
    # YES: 500 (alice) + 1500 (bob) = 2000
    # NO:  500 (alice) + 1000 (charlie) = 1500
    # Total pool = 3500

    # Mock web response
    direct_vm.mock_web(
        r".*github\.com.*",
        {
            "status": 200,
            "body": "Ethereum Dencun network upgrade was successfully activated on mainnet on March 13, 2024 at slot 8626176.",
        },
    )

    # Mock LLM evaluation: YES
    direct_vm.mock_llm(
        r".*prediction market resolver.*",
        json.dumps({
            "outcome": "YES",
            "rationale": "Official release confirms Dencun activated on March 13, 2024, prior to the June 2024 deadline.",
        }),
    )

    res_str = contract.resolve_market(market_id)
    res_data = json.loads(res_str)
    assert res_data["outcome"] == "YES"

    # Verify market is RESOLVED to YES
    market = contract.get_market(market_id)
    assert market["status"] == "RESOLVED"
    assert market["outcome"] == "YES"

    # Check Bob's claimable position
    # Bob staked 1500 on YES. Total pool = 3500. Winning pool (YES) = 2000.
    # Expected payout = (1500 * 3500) // 2000 = 5,250,000 // 2000 = 2625 wei.
    bob_pos = contract.get_user_position(market_id, to_hex_addr(direct_bob))
    assert bob_pos["claimable_payout"] == "2625"
    assert bob_pos["claimed"] is False

    # Charlie staked on NO, winning outcome is YES -> claimable = 0
    charlie_pos = contract.get_user_position(market_id, to_hex_addr(direct_charlie))
    assert charlie_pos["claimable_payout"] == "0"

    # Bob claims payout
    direct_vm.sender = direct_bob
    direct_vm.value = 0
    payout = contract.claim_winnings(market_id)
    assert payout == 2625

    # Check Bob's position after claim
    bob_pos_after = contract.get_user_position(market_id, to_hex_addr(direct_bob))
    assert bob_pos_after["claimed"] is True
    assert bob_pos_after["claimable_payout"] == "0"

    # Bob claiming again should fail
    with pytest.raises(Exception) as exc_info:
        contract.claim_winnings(market_id)
    assert "already claimed" in str(exc_info.value).lower()

    # Charlie claiming should fail (no winning stake)
    direct_vm.sender = direct_charlie
    with pytest.raises(Exception) as exc_info2:
        contract.claim_winnings(market_id)
    assert "no winning stake" in str(exc_info2.value).lower()

    direct_vm.clear_mocks()
