from datetime import date, timedelta
import pandas as pd
import yfinance as yf
import duckdb
import os

from app.core.logging import setup_logger
logger = setup_logger(__name__)

DB_PATH = "data/duckdb/market.duckdb"

class DataFetcher:
    @staticmethod
    def _normalize_symbol(symbol: str) -> str:
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

    def get_symbol_data(self, symbol: str):
        symbol = self._normalize_symbol(symbol)
        repo = MarketDataRepository()

        if not repo.symbol_exists(symbol):
            df = repo.fetch_full(symbol)
            if df.empty:
                raise ValueError(f"No market data found for symbol '{symbol}'")
            repo.store_data(df)
            logger.info(f"New symbol {symbol} added successfull")
            return repo.load_symbol_data(symbol)

        last_date = repo.get_last_date(symbol)
        today = date.today()

        if last_date < today and today.weekday() < 5:
            df_new = repo.fetch_incremental(symbol, last_date)
            if not df_new.empty:
                repo.store_data(df_new)
                logger.info(f"Fetched data for symbol {symbol} from {last_date}")
        logger.info(f"Loading existing data for symbol {symbol} ")
        return repo.load_symbol_data(symbol)

class MarketDataRepository:
    def __init__(self):
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        self.con = duckdb.connect(DB_PATH)
        self._create_table()
    def _create_table(self):
        self.con.execute("""
        CREATE TABLE IF NOT EXISTS ohlcv (
            symbol Text,
            date Date,
            open DOUBLE,
            high DOUBLE,
            low DOUBLE,
            close DOUBLE,
            volume BIGINT
        )
        """)

        self.con.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_symbol_date
            ON ohlcv(symbol, date)
        """)

    def symbol_exists(self, symbol: str) -> bool:
        return self.con.execute("""
            SELECT COUNT(*) FROM ohlcv WHERE symbol=?
        """, [symbol]).fetchone()[0] > 0

    def get_last_date(self, symbol: str):
        result = self.con.execute("""
            SELECT MAX(date) FROM ohlcv WHERE symbol=?
        """, [symbol]).fetchone()
        return result[0]

    def load_symbol_data(self, symbol: str) -> pd.DataFrame:
        return self.con.execute("""
            SELECT date, open, high, low, close, volume
            FROM ohlcv
            WHERE symbol=?
            ORDER BY date
        """, [symbol]).df()

    def fetch_full(self, symbol: str) -> pd.DataFrame:
        df = yf.download(symbol, period="max", progress=False)
        return self._normalize(df, symbol)

    def fetch_incremental(self, symbol: str, last_date):
        start = last_date + timedelta(days=1)

        df = yf.download(
            symbol,
            start=start.isoformat(),
            progress=False
        )
        return self._normalize(df, symbol)

    def _normalize(self, df: pd.DataFrame, symbol: str):
        if df.empty:
            return df

        df = df.reset_index()
        df["symbol"] = symbol
        return df

    def store_data(self, df: pd.DataFrame):
        if df is None or df.empty:
            logger.warning("Skipping store_data because DataFrame is empty")
            return

        df = df.reset_index()

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [
                col[0] if isinstance(col, tuple) else col
                for col in df.columns
            ]

        df = df.reset_index(drop=True)

        # Ensure required columns only
        required_cols = {"Date", "Open", "High", "Low", "Close", "Volume", "symbol"}
        missing = required_cols - set(df.columns)
        if missing:
            logger.warning("Skipping store_data because columns are missing: %s", sorted(missing))
            return

        df = df[[
            "Date", "Open", "High", "Low", "Close", "Volume", "symbol"
        ]]

        df["Date"] = pd.to_datetime(df["Date"])
        df["symbol"] = df["symbol"].astype("string")

        df = df.astype({
            "Open": "float64",
            "High": "float64",
            "Low": "float64",
            "Close": "float64",
            "Volume": "int64"
        })
        self.con.register("df", df)
        self.con.execute("""
            INSERT OR IGNORE INTO ohlcv
            SELECT
                symbol,
                Date   AS date,
                Open   AS open,
                High   AS high,
                Low    AS low,
                Close  AS close,
                Volume AS volume
            FROM df
        """)
        print("New data inserted...")
