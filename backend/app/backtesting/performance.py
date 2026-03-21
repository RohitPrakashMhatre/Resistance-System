import numpy as np


def calculate_performance_metrics(trades):
    """
    Calculate simple strategy metrics from trade returns (in percent).
    Keeps logic junior-friendly and easy to debug.
    """
    if not trades:
        return {
            "total_trades": 0,
            "win_rate_pct": 0.0,
            "avg_trade_return_pct": 0.0,
            "total_return_pct": 0.0,
            "max_drawdown_pct": 0.0,
        }

    wins = [trade_return for trade_return in trades if trade_return > 0]
    win_rate_pct = (len(wins) / len(trades)) * 100
    avg_trade_return_pct = float(np.mean(trades))

    # Compounded equity from sequential trade returns.
    equity_curve = [1.0]
    for trade_return_pct in trades:
        equity_curve.append(equity_curve[-1] * (1 + trade_return_pct / 100))

    total_return_pct = (equity_curve[-1] - 1) * 100

    peak = equity_curve[0]
    max_drawdown_pct = 0.0
    for value in equity_curve:
        peak = max(peak, value)
        drawdown_pct = ((value - peak) / peak) * 100
        max_drawdown_pct = min(max_drawdown_pct, drawdown_pct)

    return {
        "total_trades": len(trades),
        "win_rate_pct": round(float(win_rate_pct), 2),
        "avg_trade_return_pct": round(float(avg_trade_return_pct), 2),
        "total_return_pct": round(float(total_return_pct), 2),
        "max_drawdown_pct": round(float(max_drawdown_pct), 2),
    }
