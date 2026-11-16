# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
from dataclasses import dataclass
import json
from datetime import datetime, timezone, timedelta

# Ensure gl.message.datetime maps to GenVM transaction timestamp
try:
    if hasattr(gl, "message") and not hasattr(gl.message, "datetime"):
        setattr(
            type(gl.message),
            "datetime",
            property(lambda self: getattr(gl, "message_raw", {}).get("datetime", "")),
        )
except Exception:
    pass


@allow_storage
@dataclass
class Market:
    id: u256
    creator: Address
    question: str
    resolution_source_url: str
    resolution_rules: str
    deadline_iso: str
    refund_deadline_iso: str
    yes_pool: u256
    no_pool: u256
    status: str  # "OPEN" | "RESOLVED" | "VOIDED"
    outcome: str  # "PENDING" | "YES" | "NO" | "INCONCLUSIVE" | "EXPIRED_UNRESOLVED"
    resolution_rationale: str
    total_positions: u256


class PulseMarket(gl.Contract):
    market_count: u256
    markets: TreeMap[u256, Market]
    yes_stakes: TreeMap[str, u256]
    no_stakes: TreeMap[str, u256]
    claimed: TreeMap[str, bool]

    def __init__(self):
        self.market_count = u256(0)

    def _parse_utc(self, iso_str: str) -> datetime:
        if not iso_str or not isinstance(iso_str, str):
            if hasattr(gl, "message_raw") and isinstance(gl.message_raw, dict) and "datetime" in gl.message_raw:
                iso_str = str(gl.message_raw["datetime"])
            else:
                raise gl.vm.UserError("Invalid ISO-8601 datetime format")
        cleaned = str(iso_str).strip()
        if cleaned.endswith("Z") or cleaned.endswith("z"):
            cleaned = cleaned[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(cleaned)
        except Exception as e:
            raise gl.vm.UserError(f"Invalid ISO-8601 datetime format: {e}")
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    def _get_current_time(self) -> datetime:
        try:
            val = gl.message.datetime
            if val:
                return self._parse_utc(str(val))
        except Exception:
            pass
        if hasattr(gl, "message_raw") and isinstance(gl.message_raw, dict) and "datetime" in gl.message_raw:
            return self._parse_utc(str(gl.message_raw["datetime"]))
        return self._parse_utc("")

    @gl.public.write.payable
    def create_market(
        self,
        question: str,
        resolution_source_url: str,
        resolution_rules: str,
        deadline_iso: str,
        resolution_window_hours: u256 = u256(72),
    ) -> u256:
        if not question or not question.strip():
            raise gl.vm.UserError("Question cannot be empty")
        if not resolution_rules or not resolution_rules.strip():
            raise gl.vm.UserError("Resolution rules cannot be empty")
        if not deadline_iso or not deadline_iso.strip():
            raise gl.vm.UserError("Deadline ISO cannot be empty")
        if not resolution_source_url or not resolution_source_url.startswith("https://"):
            raise gl.vm.UserError("Resolution source URL must start with https://")

        current_time = self._get_current_time()
        deadline_dt = self._parse_utc(deadline_iso)
        if deadline_dt <= current_time:
            raise gl.vm.UserError("Market cutoff must be in the future")

        window_hours = int(resolution_window_hours)
        if window_hours < 1:
            window_hours = 1

        refund_deadline_dt = deadline_dt + timedelta(hours=window_hours)
        refund_deadline_iso = refund_deadline_dt.isoformat()

        market_id = self.market_count
        creator = gl.message.sender_address
        creator_key = f"{int(market_id)}:{creator.as_hex.lower()}"

        yes_seed = u256(0)
        no_seed = u256(0)
        total_positions = u256(0)

        val = gl.message.value
        if val > 0:
            half = u256(int(val) // 2)
            yes_seed = half
            no_seed = half
            self.yes_stakes[creator_key] = half
            self.no_stakes[creator_key] = half
            total_positions = u256(2)

        new_market = Market(
            id=market_id,
            creator=creator,
            question=question.strip(),
            resolution_source_url=resolution_source_url.strip(),
            resolution_rules=resolution_rules.strip(),
            deadline_iso=deadline_iso.strip(),
            refund_deadline_iso=refund_deadline_iso,
            yes_pool=yes_seed,
            no_pool=no_seed,
            status="OPEN",
            outcome="PENDING",
            resolution_rationale="",
            total_positions=total_positions,
        )

        self.markets[market_id] = new_market
        self.market_count = market_id + u256(1)
        return market_id

    @gl.public.write.payable
    def place_bet(self, market_id: u256, side: str) -> None:
        if market_id >= self.market_count:
            raise gl.vm.UserError("Market does not exist")

        market = self.markets[market_id]
        if market.status != "OPEN":
            raise gl.vm.UserError("Market is not open for betting")

        current_time = self._get_current_time()
        deadline_dt = self._parse_utc(market.deadline_iso)
        if current_time >= deadline_dt:
            raise gl.vm.UserError("Betting cutoff has passed; wagers are closed")

        bet_val = gl.message.value
        if bet_val <= 0:
            raise gl.vm.UserError("Bet amount must be greater than zero")

        normalized_side = side.strip().upper()
        if normalized_side not in ("YES", "NO"):
            raise gl.vm.UserError("Side must be either YES or NO")

        sender_addr = gl.message.sender_address.as_hex.lower()
        stake_key = f"{int(market_id)}:{sender_addr}"

        if normalized_side == "YES":
            market.yes_pool = market.yes_pool + u256(bet_val)
            existing = self.yes_stakes.get(stake_key, u256(0))
            self.yes_stakes[stake_key] = existing + u256(bet_val)
        else:
            market.no_pool = market.no_pool + u256(bet_val)
            existing = self.no_stakes.get(stake_key, u256(0))
            self.no_stakes[stake_key] = existing + u256(bet_val)

        market.total_positions = market.total_positions + u256(1)
        self.markets[market_id] = market

    @gl.public.write
    def resolve_market(self, market_id: u256) -> str:
        if market_id >= self.market_count:
            raise gl.vm.UserError("Market does not exist")

        market = self.markets[market_id]
        if market.status != "OPEN":
            raise gl.vm.UserError("Market is already resolved")

        source_url = market.resolution_source_url
        question = market.question
        rules = market.resolution_rules
        deadline = market.deadline_iso

        def leader_fn() -> dict:
            web_res = gl.nondet.web.get(source_url)
            content_text = ""
            if web_res and web_res.body:
                try:
                    content_text = web_res.body.decode("utf-8", errors="replace")
                except Exception:
                    content_text = str(web_res.body)

            safe_content = content_text[:4000]

            prompt = (
                f"You are an impartial, truth-seeking decentralized prediction market resolver.\n"
                f"Carefully evaluate whether the following market question has resolved to YES or NO,\n"
                f"or if it is INCONCLUSIVE, or still ongoing / pending (NOT_YET), based strictly on the authoritative web source content provided below.\n\n"
                f"Market Question: {question}\n"
                f"Resolution Rules: {rules}\n"
                f"Deadline ISO: {deadline}\n\n"
                f"Authoritative Web Source Content (wrapped in strict XML tags):\n"
                f"<source_content>\n{safe_content}\n</source_content>\n\n"
                f"Resolution Instructions:\n"
                f"1. Evaluate the content against the exact resolution rules.\n"
                f"2. Return 'YES' if the criteria for YES are met.\n"
                f"3. Return 'NO' if the criteria for NO are met or the deadline has passed without meeting criteria.\n"
                f"4. Return 'INCONCLUSIVE' if the source is contradictory, inaccessible, ambiguous, or cannot verify the outcome.\n"
                f"5. Return 'NOT_YET' if the event is pending, in the future, or not yet determined.\n"
                f"6. Provide a 1-2 sentence concise factual rationale citing the source.\n\n"
                f"You MUST output valid JSON strictly with this schema:\n"
                f'{{"outcome": "YES" | "NO" | "INCONCLUSIVE" | "NOT_YET", "rationale": "<concise justification>"}}'
            )

            llm_raw = gl.nondet.exec_prompt(prompt, response_format="json")

            decision = "NOT_YET"
            rationale = "Pending resolution"

            if isinstance(llm_raw, dict):
                raw_out = str(llm_raw.get("outcome", "")).strip().upper()
                if raw_out in ("YES", "NO", "INCONCLUSIVE", "NOT_YET"):
                    decision = raw_out
                rationale = str(llm_raw.get("rationale", "")).strip()
            elif isinstance(llm_raw, str):
                try:
                    parsed = json.loads(llm_raw)
                    raw_out = str(parsed.get("outcome", "")).strip().upper()
                    if raw_out in ("YES", "NO", "INCONCLUSIVE", "NOT_YET"):
                        decision = raw_out
                    rationale = str(parsed.get("rationale", "")).strip()
                except Exception:
                    pass

            if not rationale:
                rationale = f"Evaluated outcome as {decision}"

            return {"outcome": decision, "rationale": rationale}

        def validator_fn(leaders_res: gl.vm.Result) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return False
            val_eval = leader_fn()
            return str(leaders_res.calldata.get("outcome")) == str(val_eval.get("outcome"))

        consensus_res = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        outcome = str(consensus_res.get("outcome", "NOT_YET"))
        rationale = str(consensus_res.get("rationale", ""))

        current_time = self._get_current_time()
        refund_deadline_dt = self._parse_utc(market.refund_deadline_iso)

        if outcome in ("YES", "NO"):
            winning_pool = market.yes_pool if outcome == "YES" else market.no_pool
            if winning_pool == u256(0):
                market.status = "VOIDED"
                market.outcome = outcome
                market.resolution_rationale = (
                    f"Resolved {outcome} with zero stake on the winning side — full principal refunds enabled. {rationale}"
                )
            else:
                market.status = "RESOLVED"
                market.outcome = outcome
                market.resolution_rationale = rationale
        elif outcome in ("INCONCLUSIVE", "NOT_YET"):
            if current_time >= refund_deadline_dt:
                market.status = "VOIDED"
                market.outcome = "INCONCLUSIVE"
                market.resolution_rationale = (
                    f"Market expired past resolution window without conclusive outcome — full principal refunds enabled. {rationale}"
                )
            else:
                market.status = "OPEN"
                market.resolution_rationale = rationale
        else:
            if current_time >= refund_deadline_dt:
                market.status = "VOIDED"
                market.outcome = "INCONCLUSIVE"
                market.resolution_rationale = (
                    f"Market expired past resolution window without conclusive outcome — full principal refunds enabled. {rationale}"
                )
            else:
                market.status = "OPEN"
                market.resolution_rationale = rationale

        self.markets[market_id] = market
        return json.dumps({
            "outcome": market.outcome,
            "status": market.status,
            "rationale": market.resolution_rationale,
        })

    @gl.public.write
    def void_expired_market(self, market_id: u256) -> str:
        if market_id >= self.market_count:
            raise gl.vm.UserError("Market does not exist")

        market = self.markets[market_id]
        if market.status != "OPEN":
            raise gl.vm.UserError(f"Market is not OPEN (current status: {market.status})")

        current_time = self._get_current_time()
        refund_deadline_dt = self._parse_utc(market.refund_deadline_iso)
        if current_time < refund_deadline_dt:
            raise gl.vm.UserError("Market has not yet reached refund deadline")

        market.status = "VOIDED"
        market.outcome = "EXPIRED_UNRESOLVED"
        market.resolution_rationale = (
            "Market expired past resolution window without conclusive outcome — full principal refunds enabled."
        )
        self.markets[market_id] = market
        return "VOIDED"

    @gl.public.write
    def claim_winnings(self, market_id: u256) -> u256:
        if market_id >= self.market_count:
            raise gl.vm.UserError("Market does not exist")

        market = self.markets[market_id]
        if market.status != "RESOLVED":
            raise gl.vm.UserError("Market is not resolved yet")

        sender_addr = gl.message.sender_address.as_hex.lower()
        claim_key = f"{int(market_id)}:{sender_addr}"

        if self.claimed.get(claim_key, False):
            raise gl.vm.UserError("Winnings already claimed")

        winning_outcome = market.outcome
        winning_stake = u256(0)
        winning_pool = u256(0)

        if winning_outcome == "YES":
            winning_stake = self.yes_stakes.get(claim_key, u256(0))
            winning_pool = market.yes_pool
        elif winning_outcome == "NO":
            winning_stake = self.no_stakes.get(claim_key, u256(0))
            winning_pool = market.no_pool
        else:
            raise gl.vm.UserError("Invalid winning outcome")

        if winning_stake <= 0:
            raise gl.vm.UserError("No winning stake on this market")
        if winning_pool <= 0:
            raise gl.vm.UserError("Winning pool is empty")

        total_pool = market.yes_pool + market.no_pool
        payout = (winning_stake * total_pool) // winning_pool

        if payout <= 0:
            raise gl.vm.UserError("Payout amount is zero")

        self.claimed[claim_key] = True

        gl.get_contract_at(gl.message.sender_address).emit_transfer(value=payout, on="finalized")

        return payout

    @gl.public.write
    def claim_refund(self, market_id: u256) -> u256:
        if market_id >= self.market_count:
            raise gl.vm.UserError("Market does not exist")

        market = self.markets[market_id]
        if market.status != "VOIDED":
            raise gl.vm.UserError("Market is not voided; refunds only available for voided markets")

        sender_addr = gl.message.sender_address.as_hex.lower()
        claim_key = f"{int(market_id)}:{sender_addr}"

        if self.claimed.get(claim_key, False):
            raise gl.vm.UserError("Refund already claimed")

        yes_stk = self.yes_stakes.get(claim_key, u256(0))
        no_stk = self.no_stakes.get(claim_key, u256(0))
        refund_amount = yes_stk + no_stk

        if refund_amount <= u256(0):
            raise gl.vm.UserError("No refundable stake on this market")

        self.claimed[claim_key] = True

        gl.get_contract_at(gl.message.sender_address).emit_transfer(value=refund_amount, on="finalized")

        return refund_amount

    @gl.public.view
    def get_market(self, market_id: u256) -> dict:
        if market_id >= self.market_count:
            raise gl.vm.UserError("Market does not exist")

        m = self.markets[market_id]
        yes_val = int(m.yes_pool)
        no_val = int(m.no_pool)
        total_val = yes_val + no_val

        yes_prob = 50
        no_prob = 50
        if total_val > 0:
            yes_prob = (yes_val * 100) // total_val
            no_prob = (no_val * 100) // total_val

        is_open = False
        try:
            now_dt = self._get_current_time()
            deadline_dt = self._parse_utc(m.deadline_iso)
            is_open = (m.status == "OPEN") and (now_dt < deadline_dt)
        except Exception:
            is_open = (m.status == "OPEN")

        return {
            "id": int(m.id),
            "creator": m.creator.as_hex,
            "question": m.question,
            "resolution_source_url": m.resolution_source_url,
            "resolution_rules": m.resolution_rules,
            "deadline_iso": m.deadline_iso,
            "refund_deadline_iso": m.refund_deadline_iso,
            "is_betting_open": is_open,
            "yes_pool": str(m.yes_pool),
            "no_pool": str(m.no_pool),
            "status": m.status,
            "outcome": m.outcome,
            "resolution_rationale": m.resolution_rationale,
            "total_positions": int(m.total_positions),
            "yes_probability": yes_prob,
            "no_probability": no_prob,
        }

    @gl.public.view
    def get_all_markets(self) -> list:
        count = int(self.market_count)
        res = []
        for i in range(count):
            res.append(self.get_market(u256(i)))
        return res

    @gl.public.view
    def get_user_position(self, market_id: u256, user_address: str) -> dict:
        if market_id >= self.market_count:
            raise gl.vm.UserError("Market does not exist")

        m = self.markets[market_id]
        normalized_addr = user_address.strip().lower()
        key = f"{int(market_id)}:{normalized_addr}"

        yes_stk = self.yes_stakes.get(key, u256(0))
        no_stk = self.no_stakes.get(key, u256(0))
        is_claimed = self.claimed.get(key, False)

        claimable = u256(0)
        if m.status == "RESOLVED" and not is_claimed:
            winning_stake = u256(0)
            winning_pool = u256(0)
            if m.outcome == "YES":
                winning_stake = yes_stk
                winning_pool = m.yes_pool
            elif m.outcome == "NO":
                winning_stake = no_stk
                winning_pool = m.no_pool

            if winning_stake > 0 and winning_pool > 0:
                total_pool = m.yes_pool + m.no_pool
                claimable = (winning_stake * total_pool) // winning_pool

        refundable = u256(0)
        if m.status == "VOIDED" and not is_claimed:
            refundable = yes_stk + no_stk

        return {
            "market_id": int(market_id),
            "user_address": user_address,
            "yes_stake": str(yes_stk),
            "no_stake": str(no_stk),
            "claimed": is_claimed,
            "claimable_payout": str(claimable),
            "refundable_amount": str(refundable),
        }

    @gl.public.view
    def get_stats(self) -> dict:
        total = int(self.market_count)
        open_count = 0
        resolved_count = 0
        voided_count = 0
        total_volume = 0

        for i in range(total):
            m = self.markets[u256(i)]
            if m.status == "OPEN":
                open_count += 1
            elif m.status == "RESOLVED":
                resolved_count += 1
            elif m.status == "VOIDED":
                voided_count += 1
            total_volume += int(m.yes_pool) + int(m.no_pool)

        return {
            "total_markets": total,
            "open_markets": open_count,
            "resolved_markets": resolved_count,
            "voided_markets": voided_count,
            "total_volume_locked": str(total_volume),
        }
