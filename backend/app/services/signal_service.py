from fastapi.concurrency import run_in_threadpool
from app.core.cache import signal_cache
from app.engine.run_signal_engine import run_signal_engine

from app.core.logging import setup_logger
import logging

logger = setup_logger(__name__)

def _normalize_cache_symbol(symbol: str) -> str:
    raw = (symbol or "").strip().upper()
    raw = raw.split("?")[0].strip()
    raw = raw.replace(" ", "")

    if ":" not in raw:
        return raw

    base, exchange = raw.split(":", 1)
    base = "".join(ch for ch in base if ch.isalnum() or ch in {"^", "-", "."})
    exchange = "".join(ch for ch in exchange if ch.isalnum() or ch in {"."})

    if base.startswith("^"):
        return base
    if exchange in {"NS", "NSE"}:
        return f"{base}.NS"
    if exchange in {"BO", "BSE"}:
        return f"{base}.BO"
    return f"{base}.{exchange}" if exchange else base

async def get_signal_data(symbol: str, window: int):
    normalized_symbol = _normalize_cache_symbol(symbol)
    key = (normalized_symbol, window)

    logger.info(f"Cache object id: {id(signal_cache)}")

    if key in signal_cache:
        logger.info("Loaded data from cache")
        return signal_cache[key]

    df = await run_in_threadpool(run_signal_engine, normalized_symbol, window)

    signal_cache[key] = df
    return df
