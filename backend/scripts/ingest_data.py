import time
import pandas as pd
import yfinance as yf
import duckdb
from concurrent.futures import ThreadPoolExecutor, as_completed

DB_PATH = "data/duckdb/market.duckdb"
EXCEL_PATH = "master_symbols.csv"

MAX_RETRIES = 3
MAX_WORKERS = 6


def normalize_symbol(symbol: str) -> str:
    return symbol.replace(":", ".")


def fetch_symbol(symbol: str):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            df = yf.download(symbol, period="max", progress=False)

            if df.empty:
                raise ValueError("Empty dataframe")

            df.reset_index(inplace=True)
            df.columns = [c.lower() for c in df.columns]
            df["symbol"] = symbol

            return df

        except Exception as e:
            print(f"⚠ {symbol} attempt {attempt} failed: {e}")

            if attempt < MAX_RETRIES:
                time.sleep(attempt)
            else:
                print(f"{symbol} failed after {MAX_RETRIES} attempts")

    return None


def ingest_all(symbols):
    con = duckdb.connect(DB_PATH)

    # Ensure table exists
    con.execute("""
        CREATE TABLE IF NOT EXISTS ohlcv (
            symbol TEXT,
            date DATE,
            open DOUBLE,
            high DOUBLE,
            low DOUBLE,
            close DOUBLE,
            volume BIGINT,
            PRIMARY KEY (symbol, date)
        )
    """)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(fetch_symbol, symbol): symbol
            for symbol in symbols
        }

        for future in as_completed(futures):
            symbol = futures[future]
            df = future.result()

            if df is None:
                continue

            con.register("df", df)
            con.execute("""
                INSERT OR REPLACE INTO ohlcv
                SELECT
                    symbol,
                    date,
                    open,
                    high,
                    low,
                    close,
                    volume
                FROM df
            """)

            print(f"Stored {symbol}")

    con.close()


def main():
    symbols_df = pd.read_csv(EXCEL_PATH)

    symbols = (
        symbols_df["SYMBOL"]
        .dropna()
        .apply(normalize_symbol)
        .unique()
        .tolist()
    )

    symbols = symbols[:5]

    print(f"Fetching {len(symbols)} symbols")
    ingest_all(symbols)


if __name__ == "__main__":
    main()
