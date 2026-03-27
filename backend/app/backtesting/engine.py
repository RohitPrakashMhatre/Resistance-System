import pandas as pd

from app.backtesting.performance import calculate_performance_metrics
from app.services.signal_service import get_signal_data


def _prepare_dataframe(df: pd.DataFrame):
    if df.empty:
        return None

    required_cols = {"date", "close", "high", "low", "high_signal", "low_signal", "high_date", "low_date"}
    if not required_cols.issubset(df.columns):
        return None

    working = df.copy()
    working["date"] = pd.to_datetime(working["date"], errors="coerce")
    working["high_date"] = pd.to_datetime(working["high_date"], errors="coerce")
    working["low_date"] = pd.to_datetime(working["low_date"], errors="coerce")
    working["close"] = pd.to_numeric(working["close"], errors="coerce")
    working = working.sort_values("date").reset_index(drop=True)
    working = working.dropna(subset=["date", "close"])

    if working.empty:
        return None

    return working


def _candidate_buy_dates_sorted(working: pd.DataFrame):
    """
    Unique signal buy dates from high/low, sorted chronologically (by bar index).
    Deduplicates by bar index so two signals on the same bar only create one candidate.
    """
    high_buy_dates = working.loc[working["high_signal"] == True, "high_date"].dropna().tolist()
    low_buy_dates = working.loc[working["low_signal"] == True, "low_date"].dropna().tolist()
    date_to_index = {date_value: idx for idx, date_value in enumerate(working["date"])}

    entries = []
    seen_idx = set()
    for buy_date in set(high_buy_dates + low_buy_dates):
        buy_idx = date_to_index.get(buy_date)
        if buy_idx is None or buy_idx in seen_idx:
            continue
        seen_idx.add(buy_idx)
        entries.append((buy_idx, buy_date))

    entries.sort(key=lambda x: x[0])
    return entries


def _extract_trade_returns_no_overlap(
    working: pd.DataFrame,
    hold_days: int,
    transaction_cost_pct: float,
    stop_loss_pct: float,
):
    buy_entries = _candidate_buy_dates_sorted(working)

    trade_returns = []
    # Next buy may only occur on the bar *after* the previous position is fully closed (no pyramiding).
    next_available_buy_idx = 0

    for buy_idx, _ in buy_entries:
        if buy_idx < next_available_buy_idx:
            continue

        sell_idx = min(buy_idx + hold_days, len(working) - 1)
        if sell_idx <= buy_idx:
            continue

        buy_price = float(working.at[buy_idx, "close"])
        if buy_price <= 0:
            continue

        stop_loss_price = buy_price * (1 - (stop_loss_pct / 100))
        actual_sell_price = float(working.at[sell_idx, "close"])
        actual_sell_idx = sell_idx

        if stop_loss_pct > 0:
            for idx in range(buy_idx + 1, sell_idx + 1):
                candle_low = float(working.at[idx, "low"])
                if candle_low <= stop_loss_price:
                    actual_sell_price = stop_loss_price
                    actual_sell_idx = idx
                    break

        gross_return_pct = ((actual_sell_price - buy_price) / buy_price) * 100
        net_return_pct = gross_return_pct - transaction_cost_pct
        trade_returns.append(net_return_pct)

        # Prevent overlap: next trade can only start after this sell index.
        next_available_buy_idx = actual_sell_idx + 1

    return trade_returns


def _extract_trades_detail_no_overlap(
    working: pd.DataFrame,
    hold_days: int,
    transaction_cost_pct: float,
    stop_loss_pct: float,
):
    """
    Same rules as _extract_trade_returns_no_overlap, but returns per-trade records
    for visualization (buy/sell dates, prices, exit type).
    """
    buy_entries = _candidate_buy_dates_sorted(working)

    trades = []
    next_available_buy_idx = 0

    for buy_idx, buy_date in buy_entries:
        if buy_idx < next_available_buy_idx:
            continue

        sell_idx = min(buy_idx + hold_days, len(working) - 1)
        if sell_idx <= buy_idx:
            continue

        buy_price = float(working.at[buy_idx, "close"])
        if buy_price <= 0:
            continue

        stop_loss_price = buy_price * (1 - (stop_loss_pct / 100))
        actual_sell_price = float(working.at[sell_idx, "close"])
        actual_sell_idx = sell_idx
        exit_reason = "scheduled"

        if stop_loss_pct > 0:
            for idx in range(buy_idx + 1, sell_idx + 1):
                candle_low = float(working.at[idx, "low"])
                if candle_low <= stop_loss_price:
                    actual_sell_price = stop_loss_price
                    actual_sell_idx = idx
                    exit_reason = "stop_loss"
                    break

        gross_return_pct = ((actual_sell_price - buy_price) / buy_price) * 100
        net_return_pct = gross_return_pct - transaction_cost_pct

        buy_ts = working.at[buy_idx, "date"]
        sell_ts = working.at[actual_sell_idx, "date"]
        buy_date_str = buy_ts.strftime("%Y-%m-%d") if pd.notna(buy_ts) else None
        sell_date_str = sell_ts.strftime("%Y-%m-%d") if pd.notna(sell_ts) else None

        trades.append(
            {
                "buy_date": buy_date_str,
                "sell_date": sell_date_str,
                "buy_price": round(buy_price, 4),
                "sell_price": round(actual_sell_price, 4),
                "gross_return_pct": round(float(gross_return_pct), 4),
                "net_return_pct": round(float(net_return_pct), 4),
                "exit": exit_reason,
            }
        )

        next_available_buy_idx = actual_sell_idx + 1

    return trades


def _equity_curve_points_from_trades(trades: list) -> list:
    """Points aligned with compounded equity after each trade; first point at first buy."""
    if not trades:
        return []

    equity = 1.0
    points = [{"date": trades[0]["buy_date"], "equity": round(equity, 6)}]
    for t in trades:
        r = float(t["net_return_pct"])
        equity = equity * (1 + r / 100.0)
        points.append({"date": t["sell_date"], "equity": round(equity, 6)})
    return points


def build_trade_detail_from_dataframe(
    df: pd.DataFrame,
    symbol: str,
    window: int,
    hold_days: int = 30,
    transaction_cost_pct: float = 0.2,
    stop_loss_pct: float = 0.0,
):
    """
    Build trade list + metrics + equity curve from a raw signal dataframe (single fetch).
    """
    hold_days = max(1, int(hold_days or 30))
    window = max(2, int(window or 2))
    transaction_cost_pct = max(0.0, float(transaction_cost_pct or 0.0))
    stop_loss_pct = max(0.0, float(stop_loss_pct or 0.0))

    working = _prepare_dataframe(df)
    if working is None:
        return None

    trades = _extract_trades_detail_no_overlap(
        working=working,
        hold_days=hold_days,
        transaction_cost_pct=transaction_cost_pct,
        stop_loss_pct=stop_loss_pct,
    )

    net_returns = [float(t["net_return_pct"]) for t in trades]
    metrics = calculate_performance_metrics(net_returns)
    equity_curve = _equity_curve_points_from_trades(trades)

    data_last = working["date"].max()
    data_last_str = data_last.strftime("%Y-%m-%d") if pd.notna(data_last) else None

    return {
        "symbol": symbol,
        "window": window,
        "hold_days": hold_days,
        "transaction_cost_pct": transaction_cost_pct,
        "stop_loss_pct": stop_loss_pct,
        "trades": trades,
        "metrics": metrics,
        "equity_curve": equity_curve,
        "data_last_date": data_last_str,
    }


async def get_trade_detail_for_window(
    symbol: str,
    window: int,
    hold_days: int = 30,
    transaction_cost_pct: float = 0.2,
    stop_loss_pct: float = 0.0,
):
    df = await get_signal_data(symbol, window)
    return build_trade_detail_from_dataframe(
        df,
        symbol=symbol,
        window=window,
        hold_days=hold_days,
        transaction_cost_pct=transaction_cost_pct,
        stop_loss_pct=stop_loss_pct,
    )


async def run_backtest_for_symbol(
    symbol: str,
    hold_days: int = 30,
    min_window: int = 8,
    max_window: int = 120,
    transaction_cost_pct: float = 0.2,
    stop_loss_pct: float = 0.0,
    top_n: int = 20,
):
    hold_days = max(1, int(hold_days or 30))
    min_window = max(2, int(min_window or 8))
    max_window = max(min_window, int(max_window or 120))
    transaction_cost_pct = max(0.0, float(transaction_cost_pct or 0.0))
    stop_loss_pct = max(0.0, float(stop_loss_pct or 0.0))
    top_n = max(1, int(top_n or 20))

    all_results = []
    latest_data_date = None

    for window in range(min_window, max_window + 1):
        df = await get_signal_data(symbol, window)
        working = _prepare_dataframe(df)
        if working is None:
            continue

        current_last_date = working["date"].max()
        if pd.notna(current_last_date):
            date_str = current_last_date.strftime("%Y-%m-%d")
            if latest_data_date is None or date_str > latest_data_date:
                latest_data_date = date_str

        trade_returns = _extract_trade_returns_no_overlap(
            working=working,
            hold_days=hold_days,
            transaction_cost_pct=transaction_cost_pct,
            stop_loss_pct=stop_loss_pct,
        )
        metrics = calculate_performance_metrics(trade_returns)
        all_results.append({"window": window, **metrics})

    top_windows = sorted(
        all_results,
        key=lambda item: (item["total_return_pct"], item["win_rate_pct"], item["total_trades"]),
        reverse=True,
    )[:top_n]

    return {
        "symbol": symbol,
        "hold_days": hold_days,
        "transaction_cost_pct": transaction_cost_pct,
        "stop_loss_pct": stop_loss_pct,
        "top_n": top_n,
        "top_windows": top_windows,
        "window_range": {"min": min_window, "max": max_window},
        "data_last_date": latest_data_date,
    }


async def get_latest_available_data_date(symbol: str, window: int = 8):
    df = await get_signal_data(symbol, window)
    working = _prepare_dataframe(df)
    if working is None or working.empty:
        return None
    latest_date = working["date"].max()
    if pd.isna(latest_date):
        return None
    return latest_date.strftime("%Y-%m-%d")
