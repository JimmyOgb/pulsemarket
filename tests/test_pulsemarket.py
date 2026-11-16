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
    direct_vm.warp("2026-01-01T00:00:00Z")

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
    assert market["is_betting_open"] is True
    assert "refund_deadline_iso" in market

    # Verify get_all_markets
    all_markets = contract.get_all_markets()
    assert len(all_markets) == 1
    assert all_markets[0]["id"] == 0

    # Verify stats
    stats = contract.get_stats()
    assert stats["total_markets"] == 1
    assert stats["open_markets"] == 1
    assert stats["resolved_markets"] == 0
    assert stats["voided_markets"] == 0
    assert stats["total_volume_locked"] == "1000"


def test_create_market_rejects_past_cutoff(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/pulsemarket.py")
    direct_vm.warp("2026-06-01T12:00:00Z")
    direct_vm.sender = direct_alice
    direct_vm.value = 0

    # Cutoff in the past
    with pytest.raises(Exception) as exc_info:
        contract.create_market(
            "Past deadline market?",
            "https://ethereum.org",
            "Rules here",
            "2026-05-31T23:59:59Z",
        )
    assert "cutoff must be in the future" in str(exc_info.value).lower()

    # Cutoff exactly at current time
    with pytest.raises(Exception) as exc_info2:
        contract.create_market(
            "Exact current time market?",
            "https://ethereum.org",
            "Rules here",
            "2026-06-01T12:00:00Z",
        )
    assert "cutoff must be in the future" in str(exc_info2.value).lower()

    # Cutoff in future succeeds
    mid = contract.create_market(
        "Valid future market?",
        "https://ethereum.org",
        "Rules here",
        "2026-06-02T12:00:00Z",
    )
    assert mid == 0


def test_post_cutoff_wagers_rejected(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/pulsemarket.py")
    direct_vm.warp("2026-01-01T00:00:00Z")

    direct_vm.sender = direct_alice
    direct_vm.value = 0
    market_id = contract.create_market(
        "Will BTC hit 200k?",
        "https://coingecko.com",
        "Rules",
        "2026-02-01T00:00:00Z",
    )

    # Bob bets before cutoff -> succeeds
    direct_vm.warp("2026-01-15T00:00:00Z")
    direct_vm.sender = direct_bob
    direct_vm.value = 500
    contract.place_bet(market_id, "YES")

    # Warp to exact cutoff -> place_bet must fail
    direct_vm.warp("2026-02-01T00:00:00Z")
    with pytest.raises(Exception) as exc_info:
        contract.place_bet(market_id, "YES")
    assert "betting cutoff has passed" in str(exc_info.value).lower()

    # Warp past cutoff -> place_bet must fail
    direct_vm.warp("2026-02-02T00:00:00Z")
    with pytest.raises(Exception) as exc_info2:
        contract.place_bet(market_id, "NO")
    assert "betting cutoff has passed" in str(exc_info2.value).lower()

    # Verify is_betting_open is False now
    m = contract.get_market(market_id)
    assert m["is_betting_open"] is False


def test_standard_two_sided_resolution_and_payout(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/pulsemarket.py")
    direct_vm.warp("2026-01-01T00:00:00Z")

    # Creator seed: 1000 wei (500 YES / 500 NO)
    direct_vm.sender = direct_alice
    direct_vm.value = 1000
    market_id = contract.create_market(
        "Will Ethereum Dencun upgrade activate before June 2026?",
        "https://github.com/ethereum/execution-specs/releases",
        "Resolves YES if Dencun mainnet activated before June 2026.",
        "2026-06-01T00:00:00Z",
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

    # Warp past cutoff
    direct_vm.warp("2026-06-02T00:00:00Z")

    # Mock web response
    direct_vm.mock_web(
        r".*github\.com.*",
        {
            "status": 200,
            "body": "Ethereum Dencun network upgrade was successfully activated on mainnet.",
        },
    )

    # Mock LLM evaluation: YES
    direct_vm.mock_llm(
        r".*prediction market resolver.*",
        json.dumps({
            "outcome": "YES",
            "rationale": "Official release confirms Dencun activated prior to deadline.",
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
    # Expected payout = (1500 * 3500) // 2000 = 2625 wei.
    bob_pos = contract.get_user_position(market_id, to_hex_addr(direct_bob))
    assert bob_pos["claimable_payout"] == "2625"
    assert bob_pos["refundable_amount"] == "0"
    assert bob_pos["claimed"] is False

    # Charlie staked on NO, winning outcome is YES -> claimable = 0, refundable = 0
    charlie_pos = contract.get_user_position(market_id, to_hex_addr(direct_charlie))
    assert charlie_pos["claimable_payout"] == "0"
    assert charlie_pos["refundable_amount"] == "0"

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

    # Charlie claiming winnings should fail (no winning stake)
    direct_vm.sender = direct_charlie
    with pytest.raises(Exception) as exc_info2:
        contract.claim_winnings(market_id)
    assert "no winning stake" in str(exc_info2.value).lower()

    # Charlie claiming refund should fail (market is not voided)
    with pytest.raises(Exception) as exc_info3:
        contract.claim_refund(market_id)
    assert "not voided" in str(exc_info3.value).lower()

    direct_vm.clear_mocks()


def test_zero_stake_on_winning_side_triggers_refund(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/pulsemarket.py")
    direct_vm.warp("2026-01-01T00:00:00Z")

    # Clean zero-seed market creation
    direct_vm.sender = direct_alice
    direct_vm.value = 0
    market_id = contract.create_market(
        "Will an unpredicted black swan event occur?",
        "https://news.ycombinator.com",
        "Resolves YES if event confirmed, otherwise NO.",
        "2026-03-01T00:00:00Z",
    )

    # Bob and Charlie bet ONLY on NO (yes_pool remains 0)
    direct_vm.sender = direct_bob
    direct_vm.value = 1000
    contract.place_bet(market_id, "NO")

    direct_vm.sender = direct_charlie
    direct_vm.value = 500
    contract.place_bet(market_id, "NO")

    m = contract.get_market(market_id)
    assert m["yes_pool"] == "0"
    assert m["no_pool"] == "1500"

    # Warp past deadline
    direct_vm.warp("2026-03-01T01:00:00Z")

    # Oracle resolves YES (event did occur), but YES pool has 0 stake!
    direct_vm.mock_web(
        r".*news\.ycombinator\.com.*",
        {"status": 200, "body": "Black swan event verified across all major outlets."},
    )
    direct_vm.mock_llm(
        r".*prediction market resolver.*",
        json.dumps({
            "outcome": "YES",
            "rationale": "Event confirmed by multiple sources.",
        }),
    )

    contract.resolve_market(market_id)

    # Market must enter VOIDED terminal state
    m_resolved = contract.get_market(market_id)
    assert m_resolved["status"] == "VOIDED"
    assert m_resolved["outcome"] == "YES"
    assert "zero stake on the winning side" in m_resolved["resolution_rationale"].lower()
    assert "full principal refunds enabled" in m_resolved["resolution_rationale"].lower()

    # Both Bob and Charlie should see 100% refundable amounts
    bob_pos = contract.get_user_position(market_id, to_hex_addr(direct_bob))
    assert bob_pos["refundable_amount"] == "1000"
    assert bob_pos["claimable_payout"] == "0"

    charlie_pos = contract.get_user_position(market_id, to_hex_addr(direct_charlie))
    assert charlie_pos["refundable_amount"] == "500"
    assert charlie_pos["claimable_payout"] == "0"

    # Bob claims refund
    direct_vm.sender = direct_bob
    direct_vm.value = 0
    refund_bob = contract.claim_refund(market_id)
    assert refund_bob == 1000

    # Charlie claims refund
    direct_vm.sender = direct_charlie
    refund_charlie = contract.claim_refund(market_id)
    assert refund_charlie == 500

    # Verify zero trapped funds: sum of refunds (1500) == total pool (1500)
    assert refund_bob + refund_charlie == 1500

    # Double-refund attempt must revert
    with pytest.raises(Exception) as exc_info:
        contract.claim_refund(market_id)
    assert "refund already claimed" in str(exc_info.value).lower()

    direct_vm.clear_mocks()


def test_inconclusive_past_resolution_window_triggers_refund(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/pulsemarket.py")
    direct_vm.warp("2026-01-01T00:00:00Z")

    # Create market with 48h resolution window
    direct_vm.sender = direct_alice
    direct_vm.value = 0
    market_id = contract.create_market(
        "Will quantum supremacy with 10k qubits be proven by Q1 2026?",
        "https://nature.com/articles/quantum",
        "Resolves YES if certified paper published, NO if deadline passed without publication.",
        "2026-03-31T00:00:00Z",
        48,
    )

    # Bob bets 2000 on YES, Charlie bets 1000 on NO
    direct_vm.sender = direct_bob
    direct_vm.value = 2000
    contract.place_bet(market_id, "YES")

    direct_vm.sender = direct_charlie
    direct_vm.value = 1000
    contract.place_bet(market_id, "NO")

    # Case A: Before refund deadline (e.g. 2026-04-01T00:00:00Z, which is within the 48h window),
    # an INCONCLUSIVE or NOT_YET outcome keeps market OPEN
    direct_vm.warp("2026-04-01T00:00:00Z")
    direct_vm.mock_web(
        r".*nature\.com.*",
        {"status": 200, "body": "Paper retracted for peer re-evaluation; data ambiguous."},
    )
    direct_vm.mock_llm(
        r".*prediction market resolver.*",
        json.dumps({
            "outcome": "INCONCLUSIVE",
            "rationale": "Results under peer review re-evaluation.",
        }),
    )

    contract.resolve_market(market_id)
    m_mid = contract.get_market(market_id)
    assert m_mid["status"] == "OPEN"

    # Case B: Warp past refund deadline (deadline is 2026-03-31 + 48h = 2026-04-02T00:00:00)
    direct_vm.warp("2026-04-02T01:00:00Z")
    contract.resolve_market(market_id)

    m_voided = contract.get_market(market_id)
    assert m_voided["status"] == "VOIDED"
    assert m_voided["outcome"] == "INCONCLUSIVE"
    assert "expired past resolution window" in m_voided["resolution_rationale"].lower()

    # Both YES and NO bettors recover 100% of their funds
    bob_pos = contract.get_user_position(market_id, to_hex_addr(direct_bob))
    assert bob_pos["refundable_amount"] == "2000"

    charlie_pos = contract.get_user_position(market_id, to_hex_addr(direct_charlie))
    assert charlie_pos["refundable_amount"] == "1000"

    direct_vm.sender = direct_bob
    assert contract.claim_refund(market_id) == 2000

    direct_vm.sender = direct_charlie
    assert contract.claim_refund(market_id) == 1000

    direct_vm.clear_mocks()


def test_void_expired_market_when_source_unreachable(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/pulsemarket.py")
    direct_vm.warp("2026-01-01T00:00:00Z")

    # Alice creates market with 24h window
    direct_vm.sender = direct_alice
    direct_vm.value = 0
    market_id = contract.create_market(
        "Will abandoned site post an update?",
        "https://defunct-domain-404.org/feed",
        "Rules",
        "2026-02-01T00:00:00Z",
        24,
    )

    # Bob bets 1200 on YES
    direct_vm.sender = direct_bob
    direct_vm.value = 1200
    contract.place_bet(market_id, "YES")

    # Calling void_expired_market before refund deadline fails
    direct_vm.warp("2026-02-01T12:00:00Z")
    with pytest.raises(Exception) as exc_info:
        contract.void_expired_market(market_id)
    assert "not yet reached refund deadline" in str(exc_info.value).lower()

    # Warp past refund deadline (2026-02-01 + 24h = 2026-02-02T00:00:00)
    direct_vm.warp("2026-02-02T00:01:00Z")

    # Even with source unreachable/down, permissionless void succeeds
    status = contract.void_expired_market(market_id)
    assert status == "VOIDED"

    m = contract.get_market(market_id)
    assert m["status"] == "VOIDED"
    assert m["outcome"] == "EXPIRED_UNRESOLVED"

    # Bob claims refund
    direct_vm.sender = direct_bob
    refunded = contract.claim_refund(market_id)
    assert refunded == 1200
