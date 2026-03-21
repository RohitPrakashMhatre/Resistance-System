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


def _extract_trade_returns_no_overlap(
    working: pd.DataFrame,
    hold_days: int,
    transaction_cost_pct: float,
    stop_loss_pct: float,
):
    date_to_index = {date_value: idx for idx, date_value in enumerate(working["date"])}

    high_buy_dates = working.loc[working["high_signal"] == True, "high_date"].dropna().tolist()
    low_buy_dates = working.loc[working["low_signal"] == True, "low_date"].dropna().tolist()
    buy_dates = sorted(set(high_buy_dates + low_buy_dates))

    trade_returns = []
    next_available_buy_idx = 0

    for buy_date in buy_dates:
        buy_idx = date_to_index.get(buy_date)
        if buy_idx is None:
            continue
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
