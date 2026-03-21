import duckdb
from scripts.fetcher import DataFetcher

DB_PATH = "data/duckdb/market.duckdb"
SYMBOL = "RELIANCE.NS"

def test_idempotent_symbol_fetch():
    fetcher = DataFetcher()

    df1 = fetcher.get_symbol_data(SYMBOL)
    rows_first = len(df1)

    df2 = fetcher.get_symbol_data(SYMBOL)


    assert rows_first == rows_second, (
        "Row count changed after repeated fetch!"
    )