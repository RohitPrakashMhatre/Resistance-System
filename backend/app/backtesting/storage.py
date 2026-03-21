from datetime import datetime, timezone
from pathlib import Path
import json

import duckdb


DB_PATH = Path(__file__).resolve().parents[2] / "data" / "backtest_state.duckdb"


def _get_conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return duckdb.connect(str(DB_PATH))


def _init_db():
    conn = _get_conn()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS backtest_results (
                symbol VARCHAR NOT NULL,
                hold_days INTEGER NOT NULL,
                min_window INTEGER NOT NULL,
                max_window INTEGER NOT NULL,
                transaction_cost_pct DOUBLE NOT NULL DEFAULT 0.2,
                stop_loss_pct DOUBLE NOT NULL DEFAULT 0.0,
                top_n INTEGER NOT NULL DEFAULT 20,
                data_last_date VARCHAR,
                top_windows_json VARCHAR NOT NULL,
                generated_at_utc VARCHAR NOT NULL,
                PRIMARY KEY(symbol, hold_days, min_window, max_window, transaction_cost_pct, stop_loss_pct, top_n)
            )
            """
        )
        conn.execute(
            "ALTER TABLE backtest_results ADD COLUMN IF NOT EXISTS transaction_cost_pct DOUBLE DEFAULT 0.2"
        )
        conn.execute(
            "ALTER TABLE backtest_results ADD COLUMN IF NOT EXISTS stop_loss_pct DOUBLE DEFAULT 0.0"
        )
        conn.execute(
            "ALTER TABLE backtest_results ADD COLUMN IF NOT EXISTS top_n INTEGER DEFAULT 20"
        )
    finally:
        conn.close()


def save_backtest_result(
    symbol: str,
    hold_days: int,
    min_window: int,
    max_window: int,
    transaction_cost_pct: float,
    stop_loss_pct: float,
    top_n: int,
    data_last_date: str,
    top_windows: list,
):
    _init_db()
    now_utc = datetime.now(timezone.utc).isoformat()
    conn = _get_conn()
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO backtest_results(
                symbol, hold_days, min_window, max_window,
                transaction_cost_pct, stop_loss_pct, top_n, data_last_date, top_windows_json, generated_at_utc
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                symbol.upper(),
                int(hold_days),
                int(min_window),
                int(max_window),
                float(transaction_cost_pct),
                float(stop_loss_pct),
                int(top_n),
                data_last_date,
                json.dumps(top_windows),
                now_utc,
            ],
        )
    finally:
        conn.close()


def get_backtest_result(
    symbol: str,
    hold_days: int,
    min_window: int,
    max_window: int,
    transaction_cost_pct: float,
    stop_loss_pct: float,
    top_n: int,
):
    _init_db()
    conn = _get_conn()
    try:
        row = conn.execute(
            """
            SELECT symbol, hold_days, min_window, max_window, transaction_cost_pct, stop_loss_pct, top_n, data_last_date, top_windows_json, generated_at_utc
            FROM backtest_results
            WHERE symbol = ? AND hold_days = ? AND min_window = ? AND max_window = ? AND transaction_cost_pct = ? AND stop_loss_pct = ? AND top_n = ?
            """,
            [
                symbol.upper(),
                int(hold_days),
                int(min_window),
                int(max_window),
                float(transaction_cost_pct),
                float(stop_loss_pct),
                int(top_n),
            ],
        ).fetchone()
    finally:
        conn.close()

    if not row:
        return None

    return {
        "symbol": row[0],
        "hold_days": row[1],
        "min_window": row[2],
        "max_window": row[3],
        "transaction_cost_pct": row[4],
        "stop_loss_pct": row[5],
        "top_n": row[6],
        "data_last_date": row[7],
        "top_windows": json.loads(row[8] or "[]"),
        "generated_at_utc": row[9],
    }


def get_latest_backtest_result_for_symbol(symbol: str):
    _init_db()
    conn = _get_conn()
    try:
        row = conn.execute(
            """
            SELECT symbol, hold_days, min_window, max_window, transaction_cost_pct, stop_loss_pct, top_n, data_last_date, top_windows_json, generated_at_utc
            FROM backtest_results
            WHERE symbol = ?
            ORDER BY generated_at_utc DESC
            LIMIT 1
            """,
            [symbol.upper()],
        ).fetchone()
    finally:
        conn.close()

    if not row:
        return None

    return {
        "symbol": row[0],
        "hold_days": row[1],
        "min_window": row[2],
        "max_window": row[3],
        "transaction_cost_pct": row[4],
        "stop_loss_pct": row[5],
        "top_n": row[6],
        "data_last_date": row[7],
        "top_windows": json.loads(row[8] or "[]"),
        "generated_at_utc": row[9],
    }


def list_backtest_results_for_symbol(symbol: str, limit: int = 20):
    _init_db()
    conn = _get_conn()
    try:
        rows = conn.execute(
            """
            SELECT symbol, hold_days, min_window, max_window, transaction_cost_pct, stop_loss_pct, top_n, data_last_date, top_windows_json, generated_at_utc
            FROM backtest_results
            WHERE symbol = ?
            ORDER BY generated_at_utc DESC
            LIMIT ?
            """,
            [symbol.upper(), int(limit)],
        ).fetchall()
    finally:
        conn.close()

    results = []
    for row in rows:
        results.append(
            {
                "symbol": row[0],
                "hold_days": row[1],
                "min_window": row[2],
                "max_window": row[3],
                "transaction_cost_pct": row[4],
                "stop_loss_pct": row[5],
                "top_n": row[6],
                "data_last_date": row[7],
                "top_windows": json.loads(row[8] or "[]"),
                "generated_at_utc": row[9],
            }
        )
    return results


def delete_backtest_result(
    symbol: str,
    hold_days: int,
    min_window: int,
    max_window: int,
    transaction_cost_pct: float,
    stop_loss_pct: float,
    top_n: int,
):
    _init_db()
    conn = _get_conn()
    try:
        conn.execute(
            """
            DELETE FROM backtest_results
            WHERE symbol = ? AND hold_days = ? AND min_window = ? AND max_window = ?
              AND transaction_cost_pct = ? AND stop_loss_pct = ? AND top_n = ?
            """,
            [
                symbol.upper(),
                int(hold_days),
                int(min_window),
                int(max_window),
                float(transaction_cost_pct),
                float(stop_loss_pct),
                int(top_n),
            ],
        )
        row = conn.execute("SELECT changes()").fetchone()
        deleted_count = int(row[0]) if row else 0
    finally:
        conn.close()

    return deleted_count
