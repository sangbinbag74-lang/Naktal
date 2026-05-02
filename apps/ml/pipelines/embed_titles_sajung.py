"""
Announcement.title (사정율 v3 학습 데이터의 약 297K 행) → KoBERT 임베딩 → PCA 64d → npy 저장.

용도: train_sajung_v4.py에서 emb_0..emb_63 64차원 피처를 추가해 v3 대비 성능 비교.

입력:
  apps/ml/data/raw/ann_title.csv  — (konepsId, title) — export-raw-tables.ts ann_title 출력
  apps/ml/data/training_data_v3.csv — konepsId 컬럼 포함 (merge_raw.py가 이번 변경에서 추가하도록 수정)

출력:
  apps/ml/data/title_emb_sajung_64.npy  (N_train_v3, 64) — training_data_v3.csv 행 순서와 동일
  apps/ml/models/pca_titles_sajung.pkl
  apps/ml/models/title_emb_sajung_unique.parquet (title → 64d, 디버깅용)

방법:
  1. ann_title.csv → konepsId→title 맵 구축
  2. training_data_v3.csv 행 순서대로 title 매핑
  3. 고유 title 추출 → KoBERT 인코딩 (GPU 우선)
  4. PCA fit (split=train만으로 학습 → 분포 누설 방지)
  5. 매 행에 PCA-transformed 64d 매핑하여 npy 저장
"""
import sys
import time
from pathlib import Path
import numpy as np
import pandas as pd
import joblib
import torch
from sentence_transformers import SentenceTransformer
from sklearn.decomposition import PCA

ROOT = Path(__file__).resolve().parent.parent
ANN_TITLE = ROOT / "data" / "raw" / "ann_title.csv"
DATA_PATH = ROOT / "data" / "training_data_v3.csv"
EMB_OUT = ROOT / "data" / "title_emb_sajung_64.npy"
PCA_OUT = ROOT / "models" / "pca_titles_sajung.pkl"
UNIQ_OUT = ROOT / "models" / "title_emb_sajung_unique.parquet"

MODEL_NAME = "jhgan/ko-sroberta-multitask"
PCA_DIM = 64
BATCH = 64


def main():
    if not ANN_TITLE.exists():
        print(f"ERROR: {ANN_TITLE} 없음 — export-raw-tables.ts 의 ann_title dump 실행 필요")
        sys.exit(1)
    if not DATA_PATH.exists():
        print(f"ERROR: {DATA_PATH} 없음")
        sys.exit(1)

    print(f"ann_title 로드: {ANN_TITLE}")
    title_df = pd.read_csv(ANN_TITLE, dtype={"konepsId": "string", "title": "string"})
    title_df["title"] = title_df["title"].fillna("").str.strip()
    print(f"  {len(title_df):,}건 (고유 konepsId)")

    print(f"학습데이터 로드: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH, dtype={"konepsId": "string", "split": "string"}, usecols=["konepsId", "split"])
    print(f"  {len(df):,}건")

    if "konepsId" not in df.columns:
        print("ERROR: training_data_v3.csv 에 konepsId 컬럼 없음 — merge_raw.py 수정 필요")
        sys.exit(2)

    title_map = dict(zip(title_df["konepsId"], title_df["title"]))
    titles = df["konepsId"].map(title_map).fillna("").astype(str)
    n_missing = (titles == "").sum()
    print(f"  매핑 누락: {n_missing:,} ({n_missing/len(df)*100:.2f}%)")

    unique_titles = pd.Series(titles.unique())
    print(f"  고유 title: {len(unique_titles):,}건")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"\n장치: {device}")
    if device == "cuda":
        print(f"  GPU: {torch.cuda.get_device_name(0)}")

    print(f"\n모델 로드: {MODEL_NAME}")
    t0 = time.time()
    model = SentenceTransformer(MODEL_NAME, device=device)
    print(f"  로드 시간: {time.time()-t0:.1f}s")

    print(f"\n인코딩 (batch={BATCH})...")
    t0 = time.time()
    embeddings = model.encode(
        unique_titles.tolist(),
        batch_size=BATCH,
        show_progress_bar=True,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )
    print(f"  인코딩 시간: {(time.time()-t0)/60:.1f}분  shape={embeddings.shape}")

    print(f"\nPCA fit (train split만)...")
    train_titles = set(titles[df["split"].values == "train"].unique())
    train_mask = unique_titles.isin(train_titles).values
    print(f"  train 고유 title: {train_mask.sum():,}건")

    pca = PCA(n_components=PCA_DIM, random_state=42)
    pca.fit(embeddings[train_mask])
    print(f"  설명분산비율 누적 ({PCA_DIM}d): {pca.explained_variance_ratio_.sum():.4f}")
    embeddings_pca = pca.transform(embeddings).astype(np.float32)

    title_to_emb = dict(zip(unique_titles.tolist(), embeddings_pca))
    full_emb = np.zeros((len(df), PCA_DIM), dtype=np.float32)
    titles_list = titles.tolist()
    for i, t in enumerate(titles_list):
        full_emb[i] = title_to_emb[t]
    print(f"\n매핑 완료 shape={full_emb.shape}")

    EMB_OUT.parent.mkdir(parents=True, exist_ok=True)
    PCA_OUT.parent.mkdir(parents=True, exist_ok=True)
    np.save(EMB_OUT, full_emb)
    print(f"저장: {EMB_OUT} ({EMB_OUT.stat().st_size/1e6:.1f}MB)")

    joblib.dump(pca, PCA_OUT)
    print(f"저장: {PCA_OUT}")

    uniq_df = pd.DataFrame(embeddings_pca, columns=[f"emb_{i}" for i in range(PCA_DIM)])
    uniq_df.insert(0, "title", unique_titles.values)
    uniq_df.to_parquet(UNIQ_OUT)
    print(f"저장: {UNIQ_OUT}")


if __name__ == "__main__":
    main()
