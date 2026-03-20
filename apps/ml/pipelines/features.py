"""Feature engineering pipeline for bid rate prediction."""

from __future__ import annotations

import math
import os
from typing import Any

import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder

# 상위 N개 기관만 개별 인코딩, 나머지 → OTHER
TOP_ORG_N = 50

FEATURE_COLUMNS = [
    "budget_log",
    "category_encoded",
    "region_encoded",
    "org_encoded",
    "num_bidders",
    "deadline_month",
    "deadline_dow",
    "category_bid_count",
]


class FeaturePipeline:
    """Fit on training data, transform for inference."""

    def __init__(self) -> None:
        self.cat_enc = LabelEncoder()
        self.reg_enc = LabelEncoder()
        self.org_enc = LabelEncoder()
        self.top_orgs: set[str] = set()
        self.category_bid_count_map: dict[str, int] = {}
        self.num_bidders_by_category: dict[str, float] = {}
        self._fitted = False

    # ------------------------------------------------------------------ #
    # Fit
    # ------------------------------------------------------------------ #
    def fit(self, df: pd.DataFrame) -> "FeaturePipeline":
        """Fit encoders and statistics on training DataFrame.

        Required columns: bid_rate, budget, category, region, org_name,
                          num_bidders, deadline (datetime-parseable)
        """
        df = df.copy()
        df["deadline"] = pd.to_datetime(df["deadline"], errors="coerce")

        # 상위 50개 기관
        top = df["org_name"].value_counts().nlargest(TOP_ORG_N).index.tolist()
        self.top_orgs = set(top)
        df["org_name_enc"] = df["org_name"].apply(
            lambda x: x if x in self.top_orgs else "OTHER"
        )

        self.cat_enc.fit(df["category"].fillna("UNKNOWN"))
        self.reg_enc.fit(df["region"].fillna("UNKNOWN"))
        self.org_enc.fit(df["org_name_enc"])

        # 업종별 누적 낙찰 건수
        self.category_bid_count_map = (
            df["category"].value_counts().to_dict()
        )

        # 업종별 평균 num_bidders (결측 대체용)
        self.num_bidders_by_category = (
            df.groupby("category")["num_bidders"].mean().to_dict()
        )

        self._fitted = True
        return self

    # ------------------------------------------------------------------ #
    # Transform
    # ------------------------------------------------------------------ #
    def transform(self, df: pd.DataFrame) -> np.ndarray:
        """Return feature matrix (n_samples × 8)."""
        if not self._fitted:
            raise RuntimeError("FeaturePipeline must be fitted before transform.")

        df = df.copy()
        df["deadline"] = pd.to_datetime(df["deadline"], errors="coerce")

        # budget_log
        df["budget_log"] = df["budget"].apply(
            lambda x: math.log1p(float(x)) if x and float(x) > 0 else 0.0
        )

        # encoded categories
        df["category_encoded"] = self._safe_encode(
            self.cat_enc, df["category"].fillna("UNKNOWN")
        )
        df["region_encoded"] = self._safe_encode(
            self.reg_enc, df["region"].fillna("UNKNOWN")
        )
        df["org_name_enc"] = df["org_name"].apply(
            lambda x: x if x in self.top_orgs else "OTHER"
        )
        df["org_encoded"] = self._safe_encode(self.org_enc, df["org_name_enc"])

        # num_bidders (결측 → 업종 평균)
        def fill_bidders(row: Any) -> float:
            if pd.notna(row["num_bidders"]) and row["num_bidders"] > 0:
                return float(row["num_bidders"])
            return self.num_bidders_by_category.get(row["category"], 5.0)

        df["num_bidders"] = df.apply(fill_bidders, axis=1)

        # deadline features
        df["deadline_month"] = df["deadline"].dt.month.fillna(6).astype(int)
        df["deadline_dow"] = df["deadline"].dt.dayofweek.fillna(0).astype(int)

        # category_bid_count
        df["category_bid_count"] = df["category"].map(
            self.category_bid_count_map
        ).fillna(0).astype(int)

        return df[FEATURE_COLUMNS].values.astype(float)

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    @staticmethod
    def _safe_encode(enc: LabelEncoder, series: pd.Series) -> pd.Series:
        """Encode with fallback to 0 for unseen labels."""
        known = set(enc.classes_)
        mapped = series.apply(lambda x: x if x in known else enc.classes_[0])
        return pd.Series(enc.transform(mapped), index=series.index)

    # ------------------------------------------------------------------ #
    # Persistence
    # ------------------------------------------------------------------ #
    def save(self, path: str) -> None:
        import pickle

        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump(self, f)

    @staticmethod
    def load(path: str) -> "FeaturePipeline":
        import pickle

        with open(path, "rb") as f:
            return pickle.load(f)
