import numpy as np
import pandas as pd
from abc import ABC, abstractmethod


from app.core.logging import setup_logger
logger = setup_logger(__name__)


class Strategy(ABC):
    @abstractmethod
    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        pass


class SwingResistanceStrategy(Strategy):

    def __init__(self, window: int = 5):
        self.window = window

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df = self._generate_swing_points(df)
        df = self._add_cycle_features(df)
        return df

    def _generate_swing_points(self, df: pd.DataFrame) -> pd.DataFrame:
        n = self.window

        df["high_signal"] = False
        df["low_signal"] = False
        # logger.info(f"DF: \n{df.head(10)}")
        
        for i in range(n, len(df) - n):

            prev_window = df.iloc[i - n:i]
            forward_window = df.iloc[i:i + n]

            # Swing high
            prev_high = prev_window["high"].max()
            if (
                df.iloc[i - 1]["high"] == prev_high and
                forward_window["high"].max() <= prev_high
            ):
                df.loc[df.index[i - 1], "high_signal"] = True

            # Swing low
            prev_low = prev_window["low"].min()
            if (
                df.iloc[i - 1]["low"] == prev_low and
                forward_window["low"].min() >= prev_low
            ):
                df.loc[df.index[i - 1], "low_signal"] = True

        return df
    def _add_cycle_features(self, df: pd.DataFrame) -> pd.DataFrame:

        df = df.copy()

        df["high_day"] = (
            np.mod(df["high"], 360)
            .round(0)
            .astype("Int64")
            .where(df["high_signal"])
        )

        df["low_day"] = (
            np.mod(df["low"], 360)
            .round(0)
            .astype("Int64")
            .where(df["low_signal"])
        )

        # Per-row projection days:
        # if close < 360 -> use current high/low value (rounded days)
        # else -> use cycle day from high%360 / low%360
        high_value_day = df["high"].round(0).astype("Int64")
        low_value_day = df["low"].round(0).astype("Int64")

        high_projection_days = (
            high_value_day.where(df["close"] < 360, df["high_day"])
            .where(df["high_signal"])
        )
        low_projection_days = (
            low_value_day.where(df["close"] < 360, df["low_day"])
            .where(df["low_signal"])
        )

        df["high_date"] = df["date"] + pd.to_timedelta(high_projection_days.fillna(0), unit="D")
        df.loc[~df["high_signal"], "high_date"] = pd.NaT

        df["low_date"] = df["date"] + pd.to_timedelta(low_projection_days.fillna(0), unit="D")
        df.loc[~df["low_signal"], "low_date"] = pd.NaT

        # price markers
        df["high_price"] = np.where(df["high_signal"], df["high"], np.nan)
        df["low_price"] = np.where(df["low_signal"], df["low"], np.nan)

        return df

        # df = df.copy()

        # # Compute cycle days only for signal rows
        # df["high_day"] = (
        #     np.mod(df["close"], 360)
        #     .round(0)
        #     .astype("Int64")
        #     .where(df["high_signal"])
        # )

        # df["low_day"] = (
        #     np.mod(df["close"], 360)
        #     .round(0)
        #     .astype("Int64")
        #     .where(df["low_signal"])
        # )

        # latest_close = df["close"]
        # latest_high = df["high"]
        # latest_low = df["low"]

        # if latest_close >= 360:

        #     df["high_date"] = df["date"] + pd.to_timedelta(
        #         df["high_day"].fillna(0), unit="D"
        #     )

        #     df["low_date"] = df["date"] + pd.to_timedelta(
        #         df["low_day"].fillna(0), unit="D"
        #     )

        # else:
        #     # Only assign latest high/low value where signals exist
        #     df["high_date"] = np.where(
        #         df["high_signal"],
        #         latest_high,
        #         np.nan
        #     )

        #     df["low_date"] = np.where(
        #         df["low_signal"],
        #         latest_low,
        #         np.nan
        #     )

        # return df

