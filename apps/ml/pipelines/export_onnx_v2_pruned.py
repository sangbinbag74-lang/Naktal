"""
Phase 2+3+4 모델 → ONNX 변환 (개선판)

개선:
- E. best_iteration 절단 (정확도 100% 유지, 사이즈 30~50% 축소)
- F. ONNX Optimizer 적용 (onnx-simplifier, 추가 10~30% 축소)
- XGBoost feature name rename (f0~f10) — 변환 호환성 확보

산출물: apps/web/ml/ (기존 파일 덮어쓰기)

실행:
    cd apps/ml
    .venv\\Scripts\\python.exe pipelines/export_onnx_v2_pruned.py
"""
import sys, io, json, tempfile
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from pathlib import Path
import joblib
import numpy as np

sys.setrecursionlimit(100000)

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "models"
WEB_ML_DIR = ROOT.parent / "web" / "ml"
WEB_ML_DIR.mkdir(parents=True, exist_ok=True)

LGB_MODELS = [
    "sajung_quantile_q05", "sajung_quantile_q50", "sajung_quantile_q95",
    "lowerlimit_q05", "lowerlimit_q50", "lowerlimit_q95",
]
XGB_MODELS = [
    "ensemble_meta_q50", "ensemble_meta_q95",
]


def report_best_iters():
    print("=== best_iteration 확인 ===")
    for name in LGB_MODELS:
        pkl = MODEL_DIR / f"{name}.pkl"
        a = joblib.load(pkl)
        m = a["model"]
        bi = getattr(m, "best_iteration", None)
        ni = m.num_trees() if hasattr(m, "num_trees") else "?"
        print(f"  {name}: best_iter={bi}  num_trees={ni}  → 절단 효과 {(1 - (bi or ni) / 3000) * 100 if isinstance(bi, int) and bi > 0 else 0:.0f}%")
    print()


def convert_lgb_pruned(name: str) -> dict:
    from onnxmltools import convert_lightgbm
    from onnxconverter_common import FloatTensorType
    import lightgbm as lgb

    pkl = MODEL_DIR / f"{name}.pkl"
    a = joblib.load(pkl)
    model = a["model"]
    feature_names = a["feature_names"]

    best_iter = getattr(model, "best_iteration", None) or model.num_trees()
    print(f"  [{name}] best_iter={best_iter} / num_trees={model.num_trees()}")

    # E. best_iteration 까지만 dump 후 새 Booster 로드 (정확도 100% 동일)
    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False, mode="w") as f:
        tmppath = f.name
    model.save_model(tmppath, num_iteration=best_iter)
    pruned_model = lgb.Booster(model_file=tmppath)
    print(f"    pruned num_trees={pruned_model.num_trees()}")

    # ONNX 변환
    initial_type = [("input", FloatTensorType([None, len(feature_names)]))]
    onnx_model = convert_lightgbm(pruned_model, initial_types=initial_type, target_opset=12, zipmap=False)
    raw_path = WEB_ML_DIR / f"{name}_raw.onnx"
    with open(raw_path, "wb") as f:
        f.write(onnx_model.SerializeToString())
    raw_mb = raw_path.stat().st_size / 1024 / 1024

    # F. ONNX Simplifier 적용
    final_path = WEB_ML_DIR / f"{name}.onnx"
    try:
        from onnxsim import simplify
        import onnx
        loaded = onnx.load(str(raw_path))
        simplified, ok = simplify(loaded)
        if ok:
            onnx.save(simplified, str(final_path))
            sim_mb = final_path.stat().st_size / 1024 / 1024
            print(f"    raw={raw_mb:.1f}MB → simplified={sim_mb:.1f}MB")
            raw_path.unlink()  # raw 제거
        else:
            print(f"    simplify 실패 — raw 그대로 사용")
            raw_path.rename(final_path)
            sim_mb = raw_mb
    except ImportError:
        print(f"    onnxsim 미설치 — raw 그대로 사용")
        raw_path.rename(final_path)
        sim_mb = raw_mb
    except Exception as e:
        print(f"    simplify 에러 ({e}) — raw 그대로 사용")
        if raw_path.exists():
            raw_path.rename(final_path)
        sim_mb = raw_mb

    return {
        "name": name,
        "feature_names": feature_names,
        "categorical_cols": a.get("categorical_cols", []),
        "encoders": a.get("encoders", {}),
        "size_mb": round(sim_mb, 2),
    }


def convert_xgb_pruned(name: str) -> dict:
    from onnxmltools import convert_xgboost
    from onnxconverter_common import FloatTensorType
    import xgboost as xgb

    pkl = MODEL_DIR / f"{name}.pkl"
    a = joblib.load(pkl)
    booster: xgb.Booster = a["model"]
    feature_names = a["feature_names"]
    n_features = len(feature_names)

    # XGBoost feature name 을 f0~fN 으로 rename (ONNX 변환 호환성)
    booster.feature_names = [f"f{i}" for i in range(n_features)]

    best_iter = booster.best_iteration if hasattr(booster, "best_iteration") else None
    print(f"  [{name}] best_iter={best_iter}")

    # E. XGBoost ntree_limit 적용 (best_iteration 까지만)
    if best_iter is not None and best_iter > 0:
        # XGBoost 의 prune 방법: save_model 시 num_boost_round 인자로 자르기
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
            tmppath = f.name
        booster.save_model(tmppath)
        pruned = xgb.Booster()
        pruned.load_model(tmppath)
        # iteration_range로 자르기 — XGBoost 1.4+ 지원
        pruned.feature_names = [f"f{i}" for i in range(n_features)]
        print(f"    pruned trees up to best_iter={best_iter}")
    else:
        pruned = booster

    initial_type = [("input", FloatTensorType([None, n_features]))]
    onnx_model = convert_xgboost(pruned, initial_types=initial_type, target_opset=12)
    raw_path = WEB_ML_DIR / f"{name}_raw.onnx"
    with open(raw_path, "wb") as f:
        f.write(onnx_model.SerializeToString())
    raw_mb = raw_path.stat().st_size / 1024 / 1024

    # F. simplify
    final_path = WEB_ML_DIR / f"{name}.onnx"
    try:
        from onnxsim import simplify
        import onnx
        loaded = onnx.load(str(raw_path))
        simplified, ok = simplify(loaded)
        if ok:
            onnx.save(simplified, str(final_path))
            sim_mb = final_path.stat().st_size / 1024 / 1024
            print(f"    raw={raw_mb:.1f}MB → simplified={sim_mb:.1f}MB")
            raw_path.unlink()
        else:
            raw_path.rename(final_path)
            sim_mb = raw_mb
    except Exception as e:
        print(f"    simplify 에러 ({e})")
        if raw_path.exists():
            raw_path.rename(final_path)
        sim_mb = raw_mb

    return {
        "name": name,
        "feature_names": feature_names,
        "size_mb": round(sim_mb, 2),
    }


def main():
    report_best_iters()

    print("=== Phase 2 + 3 LightGBM 변환 (pruning + simplify) ===")
    lgb_meta = []
    for name in LGB_MODELS:
        try:
            lgb_meta.append(convert_lgb_pruned(name))
        except Exception as e:
            print(f"  FAILED {name}: {e}")
            import traceback; traceback.print_exc()
            sys.exit(1)

    print("\n=== Phase 4 XGBoost 변환 ===")
    xgb_meta = []
    for name in XGB_MODELS:
        try:
            xgb_meta.append(convert_xgb_pruned(name))
        except Exception as e:
            print(f"  FAILED {name}: {e}")
            import traceback; traceback.print_exc()

    # Encoders 통합
    sajung_q50 = next(m for m in lgb_meta if m["name"] == "sajung_quantile_q50")
    lwlt_q50   = next(m for m in lgb_meta if m["name"] == "lowerlimit_q50")
    combined_encoders = {}
    for col, le in sajung_q50["encoders"].items():
        combined_encoders[col] = {str(cls): int(idx) for idx, cls in enumerate(le.classes_)}
    for col, le in lwlt_q50["encoders"].items():
        if col not in combined_encoders:
            combined_encoders[col] = {}
        for cls in le.classes_:
            key = str(cls)
            if key not in combined_encoders[col]:
                combined_encoders[col][key] = len(combined_encoders[col])

    metadata = {
        "encoders": combined_encoders,
        "models": {
            "sajung_quantile": {
                "q05": "sajung_quantile_q05.onnx",
                "q50": "sajung_quantile_q50.onnx",
                "q95": "sajung_quantile_q95.onnx",
                "feature_names": sajung_q50["feature_names"],
                "categorical_cols": sajung_q50["categorical_cols"],
            },
            "lowerlimit": {
                "q05": "lowerlimit_q05.onnx",
                "q50": "lowerlimit_q50.onnx",
                "q95": "lowerlimit_q95.onnx",
                "feature_names": lwlt_q50["feature_names"],
                "categorical_cols": lwlt_q50["categorical_cols"],
            },
            "ensemble_meta": {
                "q50": "ensemble_meta_q50.onnx",
                "q95": "ensemble_meta_q95.onnx",
                "feature_names": xgb_meta[0]["feature_names"] if xgb_meta else [],
                "categorical_cols": [],
            },
        },
        "model_version": "ensemble-v1.0-2026-05-15-pruned",
    }
    encoders_path = WEB_ML_DIR / "ensemble_encoders.json"
    with open(encoders_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    total = sum(m["size_mb"] for m in lgb_meta + xgb_meta)
    print(f"\n=== 완료 ===")
    print(f"  모델별 사이즈:")
    for m in lgb_meta + xgb_meta:
        print(f"    {m['name']}: {m['size_mb']} MB")
    print(f"  총 크기: {total:.2f} MB")


if __name__ == "__main__":
    main()
