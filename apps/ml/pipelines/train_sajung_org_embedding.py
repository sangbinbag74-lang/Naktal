"""박상빈님 5/19 #10 — orgName entity embedding (PyTorch) — 진정한 임베딩 학습.

박상빈님 v2 모델 = org_past_mean/std/cnt 사용 = 통계만 활용.
본 모델 = 발주처 ID → 64d embedding 학습 → 다른 feature 결합 → sajung_rate 예측.

알고리즘:
  - PyTorch entity embedding (orgName 64d + category 16d + region 8d)
  - + numeric features (47개)
  - MLP 256 → 128 → 1
  - asymmetric Huber loss + quantile q70 (박상빈님 ultimate_goal)

학습 시간: 약 30분~1시간 (CPU, batch 1024, 5 epoch)
"""
import sys, io, time
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from pathlib import Path
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.preprocessing import LabelEncoder
import joblib

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "training_data_v2.csv"
MODEL_DIR = ROOT / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

NUMERIC_COLS = [
    "month", "year", "weekday", "is_quarter_end", "is_year_end", "season_q",
    "budget_log", "numBidders",
    "stat_avg", "stat_stddev", "stat_p25", "stat_p75", "sampleSize",
    "bidder_volatility", "is_sparse_org",
    "aValueTotal_log", "aValue_ratio", "has_avalue",
    "bsisAmt_log", "bsis_to_budget",
    "lwltRate", "rsrvtn_bgn", "rsrvtn_end",
    "has_prestdrd", "chg_count",
    "org_past_mean", "org_past_std", "org_past_cnt",
    "cat_past_mean", "cat_past_std", "cat_past_cnt",
    "reg_past_mean", "reg_past_std", "reg_past_cnt",
    "bud_past_mean", "bud_past_std", "bud_past_cnt",
    "sub_past_mean", "sub_past_std", "sub_past_cnt",
    "orgcat_past_mean", "orgcat_past_std", "orgcat_past_cnt",
    "catreg_past_mean", "catreg_past_std", "catreg_past_cnt",
    "orgbud_past_mean", "orgbud_past_std", "orgbud_past_cnt",
]
TARGET_COL = "sajung_rate"


class OrgEmbedNet(nn.Module):
    def __init__(self, n_orgs, n_cats, n_regions, n_numeric, org_dim=64, cat_dim=16, reg_dim=8):
        super().__init__()
        self.org_emb = nn.Embedding(n_orgs, org_dim)
        self.cat_emb = nn.Embedding(n_cats, cat_dim)
        self.reg_emb = nn.Embedding(n_regions, reg_dim)
        total_in = org_dim + cat_dim + reg_dim + n_numeric
        self.mlp = nn.Sequential(
            nn.Linear(total_in, 256),
            nn.ReLU(),
            nn.BatchNorm1d(256),
            nn.Dropout(0.2),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, 1),
        )

    def forward(self, org_id, cat_id, reg_id, numeric):
        org_e = self.org_emb(org_id)
        cat_e = self.cat_emb(cat_id)
        reg_e = self.reg_emb(reg_id)
        x = torch.cat([org_e, cat_e, reg_e, numeric], dim=1)
        return self.mlp(x).squeeze(-1)


def quantile_loss(pred, target, q=0.7):
    """Quantile loss alpha=0.7 (박상빈님 B-q70 와 동일)"""
    diff = target - pred
    return torch.mean(torch.max(q * diff, (q - 1) * diff))


def main():
    print(f"[{time.strftime('%H:%M:%S')}] 데이터 로드: {DATA_PATH}", flush=True)
    df = pd.read_csv(DATA_PATH, dtype={
        "category": "string", "orgName": "string",
        "budgetRange": "string", "region": "string",
        "subcat_main": "string",
    }, low_memory=False)
    print(f"  전체 {len(df):,}행", flush=True)

    df = df.sort_values("deadline").reset_index(drop=True)
    n = len(df)
    train_end = int(n * 0.7)
    val_end   = int(n * 0.85)

    # LabelEncoder
    le_org = LabelEncoder()
    le_cat = LabelEncoder()
    le_reg = LabelEncoder()
    df["org_id"] = le_org.fit_transform(df["orgName"].astype(str).fillna("UNK"))
    df["cat_id"] = le_cat.fit_transform(df["category"].astype(str).fillna("UNK"))
    df["reg_id"] = le_reg.fit_transform(df["region"].astype(str).fillna("UNK"))
    n_orgs = len(le_org.classes_)
    n_cats = len(le_cat.classes_)
    n_regs = len(le_reg.classes_)
    print(f"  발주처 {n_orgs:,} / 카테고리 {n_cats} / 지역 {n_regs}")

    df_train = df.iloc[:train_end]
    df_val   = df.iloc[train_end:val_end]
    df_test  = df.iloc[val_end:]
    print(f"  train {len(df_train):,} / val {len(df_val):,} / test {len(df_test):,}", flush=True)

    # numeric feature standardize
    num_feats = df[NUMERIC_COLS].fillna(0).values.astype(np.float32)
    mean = num_feats[:train_end].mean(axis=0)
    std  = num_feats[:train_end].std(axis=0).clip(min=1e-6)
    num_feats = (num_feats - mean) / std

    X_org = df["org_id"].values.astype(np.int64)
    X_cat = df["cat_id"].values.astype(np.int64)
    X_reg = df["reg_id"].values.astype(np.int64)
    y = df[TARGET_COL].values.astype(np.float32)

    train_ds = TensorDataset(
        torch.from_numpy(X_org[:train_end]),
        torch.from_numpy(X_cat[:train_end]),
        torch.from_numpy(X_reg[:train_end]),
        torch.from_numpy(num_feats[:train_end]),
        torch.from_numpy(y[:train_end]),
    )
    val_ds = TensorDataset(
        torch.from_numpy(X_org[train_end:val_end]),
        torch.from_numpy(X_cat[train_end:val_end]),
        torch.from_numpy(X_reg[train_end:val_end]),
        torch.from_numpy(num_feats[train_end:val_end]),
        torch.from_numpy(y[train_end:val_end]),
    )
    test_ds = TensorDataset(
        torch.from_numpy(X_org[val_end:]),
        torch.from_numpy(X_cat[val_end:]),
        torch.from_numpy(X_reg[val_end:]),
        torch.from_numpy(num_feats[val_end:]),
        torch.from_numpy(y[val_end:]),
    )

    train_loader = DataLoader(train_ds, batch_size=2048, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=4096, shuffle=False, num_workers=0)
    test_loader = DataLoader(test_ds, batch_size=4096, shuffle=False, num_workers=0)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"\n  Device: {device}")

    model = OrgEmbedNet(n_orgs, n_cats, n_regs, len(NUMERIC_COLS)).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=5)

    print(f"\n[{time.strftime('%H:%M:%S')}] 학습 시작 (5 epoch)…", flush=True)
    best_val_score = -999
    best_state = None
    for epoch in range(5):
        model.train()
        train_loss = 0
        n_batches = 0
        for org_id, cat_id, reg_id, num, target in train_loader:
            org_id = org_id.to(device); cat_id = cat_id.to(device); reg_id = reg_id.to(device)
            num = num.to(device); target = target.to(device)
            optimizer.zero_grad()
            pred = model(org_id, cat_id, reg_id, num)
            loss = quantile_loss(pred, target, q=0.7)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()
            n_batches += 1
        scheduler.step()
        train_loss /= n_batches

        # val 평가
        model.eval()
        val_preds, val_targets = [], []
        with torch.no_grad():
            for org_id, cat_id, reg_id, num, target in val_loader:
                org_id = org_id.to(device); cat_id = cat_id.to(device); reg_id = reg_id.to(device)
                num = num.to(device)
                pred = model(org_id, cat_id, reg_id, num)
                val_preds.append(pred.cpu().numpy())
                val_targets.append(target.numpy())
        val_preds = np.concatenate(val_preds)
        val_targets = np.concatenate(val_targets)
        dev = np.abs(val_preds - val_targets)
        top1 = (dev <= 0.05).mean() * 100
        disq = (val_preds < val_targets).mean() * 100
        score = top1 - disq * 0.05
        print(f"  [Epoch {epoch+1}/5] train_loss {train_loss:.4f} / val 부적격 {disq:.2f}% / 1위 {top1:.2f}% / 점수 {score:.3f}", flush=True)
        if score > best_val_score:
            best_val_score = score
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}

    print(f"\n[{time.strftime('%H:%M:%S')}] 학습 완료. best val 점수 {best_val_score:.3f}", flush=True)
    model.load_state_dict(best_state)

    # test 평가
    model.eval()
    test_preds, test_targets = [], []
    with torch.no_grad():
        for org_id, cat_id, reg_id, num, target in test_loader:
            org_id = org_id.to(device); cat_id = cat_id.to(device); reg_id = reg_id.to(device)
            num = num.to(device)
            pred = model(org_id, cat_id, reg_id, num)
            test_preds.append(pred.cpu().numpy())
            test_targets.append(target.numpy())
    test_preds = np.concatenate(test_preds)
    test_targets = np.concatenate(test_targets)
    dev = np.abs(test_preds - test_targets)
    top1_005 = (dev <= 0.05).mean() * 100
    win_05   = (dev <= 0.5).mean() * 100
    win_10   = (dev <= 1.0).mean() * 100
    mae      = dev.mean()
    disq     = (test_preds < test_targets).mean() * 100
    score    = top1_005 - disq * 0.05
    print(f"\n=== test set 평가 ({len(test_preds):,}건) ===")
    print(f"  부적격율 (pred < actual): {disq:.2f}%")
    print(f"  1위 ±0.05%p: {top1_005:.2f}%")
    print(f"  진입 ±0.5%p: {win_05:.2f}%")
    print(f"  진입 ±1.0%p: {win_10:.2f}%")
    print(f"  MAE: {mae:.4f}")
    print(f"  박상빈님 ultimate_goal 점수: {score:.3f}")

    # 저장
    out_path = MODEL_DIR / "sajung_org_embedding.pt"
    torch.save({
        "model_state": model.state_dict(),
        "le_org": le_org,
        "le_cat": le_cat,
        "le_reg": le_reg,
        "feature_mean": mean,
        "feature_std": std,
        "numeric_cols": NUMERIC_COLS,
        "n_orgs": n_orgs,
        "n_cats": n_cats,
        "n_regs": n_regs,
        "model_version": "sajung-org-emb-2026-05-19",
    }, out_path)
    print(f"\n  저장: {out_path}", flush=True)


if __name__ == "__main__":
    main()
