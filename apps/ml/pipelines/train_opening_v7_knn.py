"""
Model 2 v7 — KNN retrieval (KoBERT title 임베딩 기반 유사 공고 검색)

배경:
  v3/v5/v6 (LGBM/CatBoost) 모두 freq baseline 0.326 천장.
  ML 모델은 generalization을 시도하나, 본 task는 "발주처+상황 매우 유사"한
  과거 공고로부터의 freq pattern이 더 정확할 수 있음 (instance based learning).

가설:
  - title KoBERT emb cosine 가까운 train K개의 sel_N 평균
  - "유사 공고는 같은 번호 분포를 가진다" 가정 검증
  - K-NN 회피 가능: per-(orgName) freq + per-(category) freq + KNN blend

방법:
  1. emb_train (4M, 64d) FAISS index (CPU IVF or flat)
  2. emb_val/test 각 행에 대해 K=50 nearest train rows
  3. 그 K rows의 sel_N 평균 -> prediction
  4. freq baseline blend alpha 탐색

비용:
  - FAISS index build: 1-2분
  - KNN search 4M -> 600K queries: ~10분 GPU 없으면 수십 분
  - 메모리: 4M × 64 float32 = 1GB

대안: train sample 200K로 reduce -> 빠름, 정확도 저하 가능
"""
import sys
import time
from pathlib import Path
import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "opening_data.csv"
EMB_PATH = ROOT / "data" / "title_emb_64.npy"

N_NUMBERS = 15
TARGET_COLS = [f"sel_{i+1}" for i in range(N_NUMBERS)]
K_NEIGHBORS = 100
TRAIN_SAMPLE = 1_000_000   # 4M -> 1M sample (시간 절약)


def top_k_precision(pred_probs: np.ndarray, y_true: np.ndarray, k: int = 4) -> float:
    n = len(pred_probs)
    hits = 0
    total = 0
    for i in range(n):
        top_k_pred = set(np.argsort(pred_probs[i])[::-1][:k].tolist())
        true_idx = set(np.where(y_true[i] == 1)[0].tolist())
        if len(true_idx) == 0:
            continue
        hits += len(top_k_pred & true_idx)
        total += k
    return hits / total if total > 0 else 0.0


def main():
    try:
        import faiss
    except ImportError:
        print("ERROR: faiss 없음 -> sklearn NearestNeighbors 사용 (느림)")
        from sklearn.neighbors import NearestNeighbors
        faiss = None

    if not DATA_PATH.exists() or not EMB_PATH.exists():
        print(f"ERROR: 데이터/임베딩 없음")
        sys.exit(1)

    print(f"데이터 로드: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH, dtype={"split": "string"}, usecols=["split"] + TARGET_COLS)
    emb = np.load(EMB_PATH).astype(np.float32)
    print(f"전체: {len(df):,}건  emb: {emb.shape}")

    train_idx = (df["split"] == "train").values
    val_idx   = (df["split"] == "val").values
    test_idx  = (df["split"] == "test").values

    Y_train_full = df.loc[train_idx, TARGET_COLS].values.astype(np.float32)
    emb_train_full = emb[train_idx]
    emb_val   = emb[val_idx]
    emb_test  = emb[test_idx]
    Y_val   = df.loc[val_idx,   TARGET_COLS].values
    Y_test  = df.loc[test_idx,  TARGET_COLS].values
    print(f"  train: {len(Y_train_full):,}  val: {len(Y_val):,}  test: {len(Y_test):,}")

    # train sample
    rng = np.random.default_rng(42)
    if len(Y_train_full) > TRAIN_SAMPLE:
        sel = rng.choice(len(Y_train_full), TRAIN_SAMPLE, replace=False)
        emb_train = emb_train_full[sel]
        Y_train = Y_train_full[sel]
        print(f"  train sample: {len(Y_train):,} (메모리 절약)")
    else:
        emb_train = emb_train_full
        Y_train = Y_train_full

    global_freqs = Y_train_full.mean(axis=0)
    print(f"  global_freqs top4: {np.argsort(global_freqs)[::-1][:4].tolist()}")

    # L2 normalize -> cosine sim
    print("\n[v7] L2 normalize embeddings...")
    train_norm = np.linalg.norm(emb_train, axis=1, keepdims=True)
    train_norm[train_norm == 0] = 1
    emb_train_n = (emb_train / train_norm).astype(np.float32)
    val_norm = np.linalg.norm(emb_val, axis=1, keepdims=True);  val_norm[val_norm==0] = 1
    emb_val_n = (emb_val / val_norm).astype(np.float32)
    test_norm = np.linalg.norm(emb_test, axis=1, keepdims=True); test_norm[test_norm==0] = 1
    emb_test_n = (emb_test / test_norm).astype(np.float32)

    # FAISS IVF index (cosine -> inner product on normalized)
    if faiss is not None:
        print(f"\n[v7] FAISS index build (IVF, K={K_NEIGHBORS})...")
        d = emb_train_n.shape[1]
        nlist = 1024
        quantizer = faiss.IndexFlatIP(d)
        index = faiss.IndexIVFFlat(quantizer, d, nlist, faiss.METRIC_INNER_PRODUCT)
        t0 = time.time()
        index.train(emb_train_n)
        index.add(emb_train_n)
        index.nprobe = 32
        print(f"  build: {time.time()-t0:.1f}s")
    else:
        print(f"\n[v7] sklearn NearestNeighbors (cosine)...")
        nn = NearestNeighbors(n_neighbors=K_NEIGHBORS, metric="cosine", n_jobs=-1)
        nn.fit(emb_train_n)

    def knn_predict(emb_q):
        n = len(emb_q)
        out = np.zeros((n, N_NUMBERS), dtype=np.float32)
        BATCH = 5000
        if faiss is not None:
            for s in range(0, n, BATCH):
                e = min(s + BATCH, n)
                D, I = index.search(emb_q[s:e], K_NEIGHBORS)
                # I shape (b, K) — Y_train[I] -> (b, K, 15) -> mean axis=1
                neigh_y = Y_train[I]  # (b, K, 15)
                out[s:e] = neigh_y.mean(axis=1)
                if (s // BATCH) % 20 == 0:
                    print(f"    KNN {s:,}/{n:,}")
        else:
            for s in range(0, n, BATCH):
                e = min(s + BATCH, n)
                _, idx = nn.kneighbors(emb_q[s:e], return_distance=True)
                neigh_y = Y_train[idx]
                out[s:e] = neigh_y.mean(axis=1)
                if (s // BATCH) % 20 == 0:
                    print(f"    KNN {s:,}/{n:,}")
        return out

    print(f"\n[v7] val KNN 검색 (K={K_NEIGHBORS}, n={len(emb_val_n):,})...")
    t0 = time.time()
    val_knn = knn_predict(emb_val_n)
    print(f"  val 시간: {(time.time()-t0)/60:.1f}분")

    print(f"\n[v7] test KNN 검색 (n={len(emb_test_n):,})...")
    t0 = time.time()
    test_knn = knn_predict(emb_test_n)
    print(f"  test 시간: {(time.time()-t0)/60:.1f}분")

    print(f"\n=== 평가 ===")
    for name, knn_p, y_true in [("val", val_knn, Y_val), ("test", test_knn, Y_test)]:
        n = len(y_true)
        freq_p = np.tile(global_freqs, (n, 1))
        print(f"\n  {name} (n={n:,}):")
        for alpha in (0.0, 0.3, 0.5, 0.7, 1.0):
            blend = alpha * knn_p + (1 - alpha) * freq_p
            prec = top_k_precision(blend, y_true, k=4)
            print(f"    alpha={alpha:.1f}: {prec:.4f}")


if __name__ == "__main__":
    main()
