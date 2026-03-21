from app.strategies.base import SwingResistanceStrategy
from scripts.fetcher import DataFetcher
from app.core.logging import setup_logger

fetch = DataFetcher()
logger = setup_logger(__name__)

def run_signal_engine(symbol: str, window: int):

    # 1. Load historical data from DB
    df = fetch.get_symbol_data(symbol)
    logger.info(f"DF")
    # 2. Choose strategy
    strategy = SwingResistanceStrategy(window)

    # 3. Run strategy
    df = strategy.generate_signals(df)

    return df
