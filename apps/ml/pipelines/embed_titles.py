"""
opening_data.csv title 컬럼 → KoBERT 임베딩 → PCA 64d → npy 저장

가설: categorical 피처는 concept drift 강함. title은 시간 무관 의미 정보 포함.
모델: jhgan/ko-sroberta-multitask (768d, Korean sentence-RoBERTa)

방법:
  1. 고유 title 추출 (중복 제거)
  2. GPU 배치 인코딩 (batch=64)
  3. PCA 768d → 64d (train fit)
  4. 매 행에 매핑하여 npy 저장 (대용량 디스크 캐시)

출력:
  apps/ml/data/title_emb_64.npy  (N, 64) — opening_data.csv 행 순서와 동일
  apps/ml/models/pca_titles.pkl   — fit된 PCA (재현용)
  apps/ml/models/title_emb_unique.parquet — 고유 title → 64d
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
DATA_PATH = ROOT / "data" / "opening_data.csv"
EMB_OUT = ROOT / "data" / "title_emb_64.npy"
PCA_OUT = ROOT / "models" / "pca_titles.pkl"
UNIQ_OUT = ROOT / "models" / "title_emb_unique.parquet"

MODEL_NAME = "jhgan/ko-sroberta-multitask"
EMB_DIM = 768
PCA_DIM = 64
BATCH = 64


def main():
    if not DATA_PATH.exists():
        print(f"ERROR: {DATA_PATH} 없음")
        sys.exit(1)

    print(f"데이터 로드: {DATA_PATH}")
    # title + split 만 로드 (메모리 절약)
    df = pd.read_csv(DATA_PATH, usecols=["bidNtceNm", "split"], dtype={"bidNtceNm": "string", "split": "string"})
    df["bidNtceNm"] = df["bidNtceNm"].fillna("").str.strip()
    print(f"전체: {len(df):,}건")

    # 고유 title
    unique_titles = df["bidNtceNm"].drop_duplicates().reset_index(drop=True)
    print(f"고유 title: {len(unique_titles):,}건 ({len(unique_titles)/len(df)*100:.1f}%)")

    # GPU 확인
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"\n장치: {device}")
    if device == "cuda":
        print(f"  GPU: {torch.cuda.get_device_name(0)}")
        print(f"  메모리: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f}GB")

    # 모델 로드
    print(f"\n모델 로드: {MODEL_NAME}")
    t0 = time.time()
    model = SentenceTransformer(MODEL_NAME, device=device)
    print(f"  로드 시간: {time.time()-t0:.1f}s")

    # 인코딩
    print(f"\n고유 title 인코딩 (batch={BATCH})...")
    t0 = time.time()
    embeddings = model.encode(
        unique_titles.tolist(),
        batch_size=BATCH,
        show_progress_bar=True,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )
    print(f"  인코딩 시간: {(time.time()-t0)/60:.1f}분")
    print(f"  shape: {embeddings.shape}")

    # PCA fit (train split만)
    print(f"\nPCA fit (train split)...")
    train_titles_set = set(df.loc[df["split"] == "train", "bidNtceNm"].drop_duplicates().tolist())
    train_mask = unique_titles.isin(train_titles_set).values
    print(f"  train 고유 title: {train_mask.sum():,}건")

    pca = PCA(n_components=PCA_DIM, random_state=42)
    pca.fit(embeddings[train_mask])
    print(f"  설명분산비율 누적: {pca.explained_variance_ratio_.sum():.4f}")
    embeddings_pca = pca.transform(embeddings).astype(np.float32)
    print(f"  PCA shape: {embeddings_pca.shape}")

    # 고유 title → PCA 매핑 dict
    print(f"\n매핑 생성...")
    title_to_emb = dict(zip(unique_titles.tolist(), embeddings_pca))

    # 매 행에 매핑
    full_emb = np.zeros((len(df), PCA_DIM), dtype=np.float32)
    for i, t in enumerate(df["bidNtceNm"].tolist()):
        full_emb[i] = title_to_emb[t]
    print(f"  전체 매핑 shape: {full_emb.shape}")

    # 저장
    EMB_OUT.parent.mkdir(parents=True, exist_ok=True)
    PCA_OUT.parent.mkdir(parents=True, exist_ok=True)
    UNIQ_OUT.parent.mkdir(parents=True, exist_ok=True)

    np.save(EMB_OUT, full_emb)
    print(f"\n저장: {EMB_OUT} ({EMB_OUT.stat().st_size/1e6:.1f}MB)")

    joblib.dump(pca, PCA_OUT)
    print(f"저장: {PCA_OUT}")

    uniq_df = pd.DataFrame(embeddings_pca, columns=[f"emb_{i}" for i in range(PCA_DIM)])
    uniq_df.insert(0, "title", unique_titles.values)
    uniq_df.to_parquet(UNIQ_OUT)
    print(f"저장: {UNIQ_OUT}")


if __name__ == "__main__":
    main()
