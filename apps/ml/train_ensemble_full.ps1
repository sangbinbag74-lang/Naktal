# Phase 2~4 (Ensemble) 전체 학습 자동화 스크립트
# Windows 로컬 실행 — apps/ml/ 디렉터리에서 실행
#
# 사전 조건:
#   1. apps/ml/data/training_data_v2.csv (Phase 2 입력) — 이미 있음
#   2. .venv 활성화 + lightgbm·xgboost·pandas·scikit-learn 설치
#
# 실행:
#   cd apps/ml
#   .\train_ensemble_full.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== Naktal 사정율 추천 시스템 — Phase 2~4 Ensemble 학습 ===" -ForegroundColor Cyan
Write-Host ""

# venv 활성화
if (Test-Path ".venv\Scripts\Activate.ps1") {
    & .venv\Scripts\Activate.ps1
    Write-Host "[OK] venv 활성화" -ForegroundColor Green
} else {
    Write-Host "[WARN] .venv 없음 — 시스템 Python 사용" -ForegroundColor Yellow
}
Write-Host ""

# Step 1 — Phase 2: 사정율 분포 학습
Write-Host "[1/4] Phase 2 — 사정율 Quantile 학습 시작..." -ForegroundColor Cyan
python pipelines/train_sajung_quantile.py
if ($LASTEXITCODE -ne 0) { Write-Host "Phase 2 실패" -ForegroundColor Red; exit 1 }
Write-Host "[OK] Phase 2 완료" -ForegroundColor Green
Write-Host ""

# Step 2 — Phase 3 데이터 추출
Write-Host "[2/4] Phase 3 — 학습 데이터 추출 (낙찰하한가/1순위)..." -ForegroundColor Cyan
Push-Location ..\crawler
npx ts-node src/scripts/export-training-data-lowerlimit.ts
if ($LASTEXITCODE -ne 0) { Write-Host "데이터 추출 실패" -ForegroundColor Red; Pop-Location; exit 1 }
Pop-Location
Write-Host "[OK] 데이터 추출 완료" -ForegroundColor Green
Write-Host ""

# Step 3 — Phase 3: 낙찰하한가 직접 학습
Write-Host "[3/4] Phase 3 — 낙찰하한가 + 1순위 학습 시작..." -ForegroundColor Cyan
python pipelines/train_lowerlimit_direct.py
if ($LASTEXITCODE -ne 0) { Write-Host "Phase 3 실패" -ForegroundColor Red; exit 1 }
Write-Host "[OK] Phase 3 완료" -ForegroundColor Green
Write-Host ""

# Step 4 — Phase 4: Ensemble 메타 학습
Write-Host "[4/4] Phase 4 — Ensemble 메타 학습 시작..." -ForegroundColor Cyan
python pipelines/train_ensemble_meta.py
if ($LASTEXITCODE -ne 0) { Write-Host "Phase 4 실패" -ForegroundColor Red; exit 1 }
Write-Host "[OK] Phase 4 완료" -ForegroundColor Green
Write-Host ""

Write-Host "=== 학습 전체 완료 ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "생성된 모델:" -ForegroundColor White
Write-Host "  models/sajung_quantile_q05.pkl  (사정율 5% 분위)"
Write-Host "  models/sajung_quantile_q50.pkl  (사정율 중앙값)"
Write-Host "  models/sajung_quantile_q95.pkl  (사정율 95% 분위)"
Write-Host "  models/lowerlimit_q05.pkl       (1순위 5% 분위)"
Write-Host "  models/lowerlimit_q50.pkl       (1순위 중앙값)"
Write-Host "  models/lowerlimit_q95.pkl       (1순위 95% 분위)"
Write-Host "  models/ensemble_meta_q50.pkl    (메타 중앙값)"
Write-Host "  models/ensemble_meta_q95.pkl    (메타 95% — 적격 통과 보장)"
Write-Host ""
Write-Host "다음 단계 (ONNX 변환):"
Write-Host "  python pipelines/export_onnx.py"
Write-Host ""
