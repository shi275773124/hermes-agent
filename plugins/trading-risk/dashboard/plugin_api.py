"""Trading Risk dashboard plugin — read-only backend API routes.

Mounted at /api/plugins/trading-risk/ by the Hermes dashboard plugin system.

Design rule for v0: this plugin is read-only. It aggregates local JSON
artifacts when present and falls back to explicit mock/demo data. It must not
place orders, restart services, mutate bot state, or write trading config.
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter

router = APIRouter()

DATA_DIR = Path(os.environ.get("TRADING_RISK_DATA_DIR", "/var/lib/trading-risk"))
ARTIFACTS = {
    "risk_state": "risk_state.json",
    "authority_map": "authority_map.json",
    "counterparty_score": "counterparty_score.json",
    "portfolio_exposure": "portfolio_exposure.json",
    "execution_health": "execution_health.json",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _age_seconds(path: Path) -> float | None:
    try:
        return max(0.0, time.time() - path.stat().st_mtime)
    except FileNotFoundError:
        return None


def _freshness(age: float | None) -> str:
    if age is None:
        return "missing"
    if age <= 60:
        return "fresh"
    if age <= 300:
        return "stale"
    return "dead"


def _read_json(name: str) -> dict[str, Any] | None:
    path = DATA_DIR / ARTIFACTS[name]
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
        return {"value": data}
    except Exception as exc:
        return {"error": f"failed to parse {path}: {exc}"}


def _artifact_meta(name: str) -> dict[str, Any]:
    path = DATA_DIR / ARTIFACTS[name]
    age = _age_seconds(path)
    return {
        "name": name,
        "path": str(path),
        "exists": path.exists(),
        "age_seconds": age,
        "freshness": _freshness(age),
    }


def _mock_status() -> dict[str, Any]:
    """Explicit demo payload used before real collectors are wired."""
    now = _now_iso()
    return {
        "mode": "mock",
        "generated_at": now,
        "global_state": "CAUTION",
        "summary": {
            "state": "CAUTION",
            "reason": "Demo data: one venue exposure watch, one muted degraded data source, live writers registered.",
            "allowed_actions": ["hold", "reduce-only", "cancel stale orders"],
            "blocked_actions": ["unknown live writer", "new entry on blocked venue"],
        },
        "metrics": {
            "live_writers": 2,
            "venues": 4,
            "open_positions": 3,
            "alerts_24h": 2,
        },
        "bots": [
            {
                "name": "Pacifica breakout20",
                "platform": "Pacifica",
                "strategy": "breakout / switched_kill",
                "authority": "LIVE_AUTO",
                "state": "CAUTION",
                "last_signal": "12m ago",
                "last_order": "2h ago",
                "last_fill": "2h ago",
                "position_match": True,
                "stop_coverage": True,
                "notes": "Demo: venue exposure requires watch; no dashboard control enabled.",
            },
            {
                "name": "Lighter KPool copy",
                "platform": "Lighter",
                "strategy": "copy / execution follower",
                "authority": "LIVE_AUTO",
                "state": "NORMAL",
                "last_signal": "4m ago",
                "last_order": "4m ago",
                "last_fill": "4m ago",
                "position_match": True,
                "stop_coverage": True,
                "notes": "Demo: source/follower chain matched.",
            },
            {
                "name": "Arkham V reversal",
                "platform": "Arkham + Binance",
                "strategy": "stablecoin/CEX flow watcher",
                "authority": "WATCHDOG_ONLY",
                "state": "DEGRADED",
                "last_signal": "n/a",
                "last_order": "never",
                "last_fill": "never",
                "position_match": None,
                "stop_coverage": None,
                "notes": "Demo: Arkham 429 muted to local-only; non-trading data source.",
            },
        ],
        "venues": [
            {"name": "Pacifica", "state": "CAUTION", "exposure": "$--", "private_read": "mock", "freshness": "demo"},
            {"name": "Lighter", "state": "NORMAL", "exposure": "$--", "private_read": "mock", "freshness": "demo"},
            {"name": "Polymarket", "state": "WATCH", "exposure": "$--", "private_read": "mock", "freshness": "demo"},
            {"name": "Binance", "state": "DATA_ONLY", "exposure": "$0", "private_read": "public/market-data", "freshness": "demo"},
        ],
        "authority_map": {
            "can_place_orders": ["pacifica_executor.py", "lighter_kpool_runner.service"],
            "watchdog_only": ["arkham_v_reversal_watchdog.py"],
            "unknown_live_writers": [],
        },
        "events": [
            {"ts": now, "level": "CAUTION", "message": "Demo: Pacifica venue exposure watch"},
            {"ts": now, "level": "DEGRADED", "message": "Demo: Arkham API 429 muted local-only"},
            {"ts": now, "level": "NORMAL", "message": "Demo: KPool execution chain matched"},
        ],
    }


def _merge_real_artifacts(base: dict[str, Any]) -> dict[str, Any]:
    artifacts = {name: _read_json(name) for name in ARTIFACTS}
    metas = {name: _artifact_meta(name) for name in ARTIFACTS}
    if any(value is not None for value in artifacts.values()):
        base["mode"] = "artifacts"
    base["artifacts"] = metas
    base["raw"] = {name: value for name, value in artifacts.items() if value is not None}

    risk_state = artifacts.get("risk_state") or {}
    if isinstance(risk_state, dict) and risk_state:
        state = risk_state.get("state") or risk_state.get("global_state")
        if state:
            base["global_state"] = str(state)
            base["summary"]["state"] = str(state)
        if risk_state.get("reason"):
            base["summary"]["reason"] = risk_state["reason"]
        if isinstance(risk_state.get("allowed_actions"), list):
            base["summary"]["allowed_actions"] = risk_state["allowed_actions"]
        if isinstance(risk_state.get("blocked_actions"), list):
            base["summary"]["blocked_actions"] = risk_state["blocked_actions"]

    authority = artifacts.get("authority_map")
    if isinstance(authority, dict) and authority:
        base["authority_map"] = authority

    execution = artifacts.get("execution_health")
    if isinstance(execution, dict):
        bots = execution.get("bots")
        if isinstance(bots, list):
            base["bots"] = bots

    counterparty = artifacts.get("counterparty_score")
    if isinstance(counterparty, dict):
        venues = counterparty.get("venues")
        if isinstance(venues, list):
            base["venues"] = venues

    portfolio = artifacts.get("portfolio_exposure")
    if isinstance(portfolio, dict):
        metrics = portfolio.get("metrics")
        if isinstance(metrics, dict):
            base["metrics"].update(metrics)
        events = portfolio.get("events")
        if isinstance(events, list):
            base["events"] = events

    if isinstance(execution, dict):
        metrics = execution.get("metrics")
        if isinstance(metrics, dict):
            base["metrics"].update(metrics)
        events = execution.get("events")
        if isinstance(events, list):
            base["events"] = events

    return base


@router.get("/status")
async def status() -> dict[str, Any]:
    """Return the read-only risk dashboard state."""
    return _merge_real_artifacts(_mock_status())


@router.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "read_only": True,
        "data_dir": str(DATA_DIR),
        "artifacts": [_artifact_meta(name) for name in ARTIFACTS],
    }
