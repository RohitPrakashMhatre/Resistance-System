from fastapi import APIRouter, HTTPException
import pandas as pd
import numpy as np
from pydantic import BaseModel

from app.backtesting.engine import (
    build_trade_detail_from_dataframe,
    get_latest_available_data_date,
    run_backtest_for_symbol,
)
from app.backtesting.storage import (
    delete_backtest_result,
    get_backtest_result,
    get_latest_backtest_result_for_symbol,
    list_backtest_results_for_symbol,
    save_backtest_result,
)
from app.core.logging import setup_logger
from app.services.signal_service import get_signal_data

logger = setup_logger(__name__)

plot_router = APIRouter(prefix="/generate",tags=["Generate Signals Plot"])

EXCEL_PATH = "data/signals.csv"

class BacktestRequest(BaseModel):
    symbol: str
    hold_days: int = 30
    min_window: int = 8
    max_window: int = 120
    transaction_cost_pct: float = 0.2
    stop_loss_pct: float = 0.0
    top_n: int = 20


class BacktestDeleteRequest(BaseModel):
    symbol: str
    hold_days: int
    min_window: int
    max_window: int
    transaction_cost_pct: float = 0.2
    stop_loss_pct: float = 0.0
    top_n: int = 20

@plot_router.get("/signals")
async def get_signals(symbol: str, window: int):
    try:
        symbol = symbol.replace(".",":")
        df = await get_signal_data(symbol, window)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    df.to_csv(EXCEL_PATH, index=False)
    
    if "high_date" not in df.columns and "high_future_date" in df.columns:
        df["high_date"] = df["high_future_date"]
    if "low_date" not in df.columns and "low_future_date" in df.columns:
        df["low_date"] = df["low_future_date"]

    if "high_date" not in df.columns:
        df["high_date"] = pd.NaT
    if "low_date" not in df.columns:
        df["low_date"] = pd.NaT

    # logger.info("DF: \n%s", df.head())
    high_df = df[df["high_signal"] == True][
        ["date", "high", "low", "close", "high_signal", "high_day", "high_date"]
    ]
    low_df = df[df["low_signal"] == True][
        ["date", "high", "low", "close", "low_signal", "low_day", "low_date"]
    ]
    logger.info("High signal DataFrame: \n%s", high_df)
    logger.info("Low signal DataFrame: \n%s", low_df)
    # logger.info(f"Dtypes: \n{df.dtypes}")
    if df.empty:
        raise HTTPException(status_code=500, detail="No Data Found")

    df = df.replace([np.inf, -np.inf], pd.NA)
    df["high_date"] = pd.to_datetime(df["high_date"], errors="coerce")
    df["low_date"] = pd.to_datetime(df["low_date"], errors="coerce")

    prices = (
        df[["date", "open", "high", "low", "close"]]
        .assign(date=lambda x: x["date"].dt.strftime("%Y-%m-%d"))
        .where(pd.notna, None)
        .to_dict(orient="records")
    )
    data_start_date = prices[0]["date"] if prices else None
    data_end_date = prices[-1]["date"] if prices else None

    high_dates = (
        df.loc[df["high_signal"], "high_date"]
        .dt.strftime("%Y-%m-%d")
        .where(lambda s: s.notna(), None)
        .tolist()
    )
    low_dates = (
        df.loc[df["low_signal"], "low_date"]
        .dt.strftime("%Y-%m-%d")
        .where(lambda s: s.notna(), None)
        .tolist()
    )

    response = {
        "prices": prices,
        "markers": {
            "high_dates": high_dates,
            "low_dates": low_dates,
        },
        "data_range": {
            "start_date": data_start_date,
            "end_date": data_end_date,
            "rows": len(prices),
        },
    }

    return response

@plot_router.post("/backtest")
async def run_backtest(req: BacktestRequest):
    symbol = (req.symbol or "").strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")
    try:
        result = await run_backtest_for_symbol(
            symbol=symbol,
            hold_days=req.hold_days,
            min_window=req.min_window,
            max_window=req.max_window,
            transaction_cost_pct=req.transaction_cost_pct,
            stop_loss_pct=req.stop_loss_pct,
            top_n=req.top_n,
        )
        save_backtest_result(
            symbol=symbol,
            hold_days=req.hold_days,
            min_window=req.min_window,
            max_window=req.max_window,
            transaction_cost_pct=req.transaction_cost_pct,
            stop_loss_pct=req.stop_loss_pct,
            top_n=req.top_n,
            data_last_date=result.get("data_last_date"),
            top_windows=result.get("top_windows", []),
        )
        return {
            **result,
            "is_stale": False,
            "stale_message": None,
        }
    except Exception as exc:
        logger.exception(f"Backtest failed for symbol={symbol}: {exc}")
        raise HTTPException(status_code=500, detail="Backtest failed") from exc


@plot_router.get("/backtest/latest")
async def get_latest_backtest(
    symbol: str,
    hold_days: int = 30,
    min_window: int = 8,
    max_window: int = 120,
    transaction_cost_pct: float = 0.2,
    stop_loss_pct: float = 0.0,
    top_n: int = 20,
):
    symbol = (symbol or "").strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")

    cached = get_backtest_result(
        symbol,
        hold_days,
        min_window,
        max_window,
        transaction_cost_pct,
        stop_loss_pct,
        top_n,
    )
    used_fallback = False
    if not cached:
        cached = get_latest_backtest_result_for_symbol(symbol)
        used_fallback = cached is not None

    if not cached:
        return {
            "symbol": symbol,
            "hold_days": hold_days,
            "top_windows": [],
            "is_stale": True,
            "stale_message": "No backtest found. Please run backtest for latest data.",
            "data_last_date": None,
            "generated_at_utc": None,
            "window_range": {"min": min_window, "max": max_window},
            "transaction_cost_pct": transaction_cost_pct,
            "stop_loss_pct": stop_loss_pct,
            "top_n": top_n,
        }

    current_latest_date = await get_latest_available_data_date(symbol, window=min_window)
    data_last_date_cached = cached.get("data_last_date")

    stale_reasons = []
    if current_latest_date and data_last_date_cached and current_latest_date > data_last_date_cached:
        stale_reasons.append("New market data is available after last backtest.")
    if current_latest_date and not data_last_date_cached:
        stale_reasons.append("Backtest cache has no data date. Please rerun backtest.")
    if used_fallback:
        stale_reasons.append(
            "Showing latest cached backtest with different parameters (hold days/cost/window range)."
        )

    is_stale = len(stale_reasons) > 0
    stale_message = " ".join(stale_reasons) if is_stale else None

    return {
        "symbol": symbol,
        "hold_days": cached["hold_days"],
        "top_windows": cached["top_windows"],
        "is_stale": is_stale,
        "stale_message": stale_message,
        "data_last_date": data_last_date_cached,
        "generated_at_utc": cached.get("generated_at_utc"),
        "window_range": {"min": cached["min_window"], "max": cached["max_window"]},
        "transaction_cost_pct": cached["transaction_cost_pct"],
        "stop_loss_pct": cached["stop_loss_pct"],
        "top_n": cached["top_n"],
        "used_fallback": used_fallback,
    }


@plot_router.get("/backtest/scenarios")
async def get_backtest_scenarios(symbol: str, limit: int = 20):
    symbol = (symbol or "").strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")

    scenarios = list_backtest_results_for_symbol(symbol, limit=limit)
    if not scenarios:
        return {"symbol": symbol, "scenarios": []}

    current_latest_date = await get_latest_available_data_date(symbol, window=8)

    enriched = []
    for item in scenarios:
        stale_reasons = []
        if current_latest_date and item.get("data_last_date") and current_latest_date > item["data_last_date"]:
            stale_reasons.append("New market data is available after last backtest.")
        if current_latest_date and not item.get("data_last_date"):
            stale_reasons.append("Backtest cache has no data date. Please rerun backtest.")

        enriched.append(
            {
                **item,
                "is_stale": len(stale_reasons) > 0,
                "stale_message": " ".join(stale_reasons) if stale_reasons else None,
            }
        )

    return {"symbol": symbol, "scenarios": enriched}


@plot_router.get("/backtest/trade-detail")
async def get_backtest_trade_detail(
    symbol: str,
    window: int,
    hold_days: int = 30,
    transaction_cost_pct: float = 0.2,
    stop_loss_pct: float = 0.0,
):
    """
    Single-window backtest with full trade list, equity curve points, and OHLC for charting.
    """
    symbol = (symbol or "").strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")
    if window < 2:
        raise HTTPException(status_code=400, detail="window must be >= 2")

    try:
        df = await get_signal_data(symbol, window)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if "high_date" not in df.columns and "high_future_date" in df.columns:
        df["high_date"] = df["high_future_date"]
    if "low_date" not in df.columns and "low_future_date" in df.columns:
        df["low_date"] = df["low_future_date"]
    if "high_date" not in df.columns:
        df["high_date"] = pd.NaT
    if "low_date" not in df.columns:
        df["low_date"] = pd.NaT

    df = df.replace([np.inf, -np.inf], pd.NA)
    df["high_date"] = pd.to_datetime(df["high_date"], errors="coerce")
    df["low_date"] = pd.to_datetime(df["low_date"], errors="coerce")

    prices = (
        df[["date", "open", "high", "low", "close"]]
        .assign(date=lambda x: x["date"].dt.strftime("%Y-%m-%d"))
        .where(pd.notna, None)
        .to_dict(orient="records")
    )
    data_start_date = prices[0]["date"] if prices else None
    data_end_date = prices[-1]["date"] if prices else None

    detail = build_trade_detail_from_dataframe(
        df,
        symbol=symbol,
        window=window,
        hold_days=hold_days,
        transaction_cost_pct=transaction_cost_pct,
        stop_loss_pct=stop_loss_pct,
    )
    if detail is None:
        raise HTTPException(status_code=500, detail="No data for trade detail")

    return {
        **detail,
        "prices": prices,
        "data_range": {
            "start_date": data_start_date,
            "end_date": data_end_date,
            "rows": len(prices),
        },
    }


@plot_router.delete("/backtest")
async def delete_backtest(req: BacktestDeleteRequest):
    symbol = (req.symbol or "").strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")

    deleted_count = delete_backtest_result(
        symbol=symbol,
        hold_days=req.hold_days,
        min_window=req.min_window,
        max_window=req.max_window,
        transaction_cost_pct=req.transaction_cost_pct,
        stop_loss_pct=req.stop_loss_pct,
        top_n=req.top_n,
    )

    return {"ok": True, "deleted_count": deleted_count}
