from pathlib import Path
from typing import List

import duckdb
from fastapi import APIRouter
from pydantic import BaseModel


DB_PATH = Path(__file__).resolve().parents[2] / "data" / "ui_state.duckdb"

ui_state_router = APIRouter(prefix="/ui", tags=["UI State"])


class SymbolState(BaseModel):
    symbol: str
    window_size: str = ""


class UiStatePayload(BaseModel):
    symbols: List[SymbolState]


def _get_conn() -> duckdb.DuckDBPyConnection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return duckdb.connect(str(DB_PATH))


def _init_db() -> None:
    conn = _get_conn()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ui_symbols (
                symbol VARCHAR PRIMARY KEY,
                window_size VARCHAR NOT NULL DEFAULT '',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    finally:
        conn.close()


@ui_state_router.get("/state")
def get_ui_state():
    _init_db()
    conn = _get_conn()
    try:
        rows = conn.execute(
            """
            SELECT symbol, window_size
            FROM ui_symbols
            ORDER BY updated_at DESC, symbol ASC
            """
        ).fetchall()
    finally:
        conn.close()

    return {"symbols": [{"symbol": row[0], "window_size": row[1]} for row in rows]}


@ui_state_router.put("/state")
def save_ui_state(payload: UiStatePayload):
    _init_db()

    normalized = []
    for item in payload.symbols:
        symbol = item.symbol.strip().upper()
        if not symbol:
            continue
        normalized.append((symbol, str(item.window_size or "")))

    conn = _get_conn()
    try:
        conn.execute("DELETE FROM ui_symbols")
        if normalized:
            conn.executemany(
                """
                INSERT INTO ui_symbols(symbol, window_size, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                """,
                normalized,
            )
    finally:
        conn.close()

    return {"ok": True, "count": len(normalized)}
