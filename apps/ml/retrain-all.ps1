# 주간 ML 재학습 (Windows 로컬)
#
# 실행 순서:
#   1. TypeScript export 3종 → CSV 생성
#   2. Python 3종 모델 학습 → joblib .pkl
#   3. ONNX 변환 → apps/web/ml/*.onnx
#   4. git commit & push → Vercel 자동 배포
#
# 실행:
#   cd c:\01 Ai\23 Naktal\naktal\apps\ml
#   .\retrain-all.ps1
#
# 주의:
#   - .venv 먼저 생성: python -m venv .venv
#   - 활성화: .venv\Scripts\Activate.ps1
#   - 의존성: pip install -r requirements.txt

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $PSScriptRoot    # apps 폴더
$ROOT = Split-Path -Parent $ROOT            # naktal 폴더
$ML = Join-Path $ROOT "apps\ml"
$CRAWLER = Join-Path $ROOT "apps\crawler"

Write-Host "=== Naktal ML 재학습 시작 ($(Get-Date -Format 'yyyy-MM-dd HH:mm')) ===" -ForegroundColor Cyan
Write-Host "ROOT: $ROOT"

# 0. venv 체크
$VENV = Join-Path $ML ".venv\Scripts\python.exe"
if (-not (Test-Path $VENV)) {
    Write-Host "ERROR: .venv 없음. 생성:" -ForegroundColor Red
    Write-Host "  cd $ML"
    Write-Host "  python -m venv .venv"
    Write-Host "  .venv\Scripts\Activate.ps1"
    Write-Host "  pip install -r requirements.txt"
    exit 1
}

# 1. CSV 추출 (TypeScript)
Write-Host "`n[1/4] CSV 추출" -ForegroundColor Yellow
Push-Location $CRAWLER
try {
    Write-Host "  - export-training-data-v2.ts (사정율 v2)"
    pnpm ts-node src/scripts/export-training-data-v2.ts
    if ($LASTEXITCODE -ne 0) { throw "export-training-data-v2 실패" }

    Write-Host "  - export-opening-data.ts (복수예가)"
    pnpm ts-node src/scripts/export-opening-data.ts
    if ($LASTEXITCODE -ne 0) { throw "export-opening-data 실패" }

    Write-Host "  - export-participants-data.ts (참여자수)"
    pnpm ts-node src/scripts/export-participants-data.ts
    if ($LASTEXITCODE -ne 0) { throw "export-participants-data 실패" }
} finally {
    Pop-Location
}

# 2. 모델 학습 (Python)
Write-Host "`n[2/4] 모델 학습" -ForegroundColor Yellow
Push-Location $ML
try {
    Write-Host "  - train_sajung_v2.py"
    & $VENV pipelines/train_sajung_v2.py
    if ($LASTEXITCODE -ne 0) { throw "train_sajung_v2 실패" }

    Write-Host "  - train_opening.py (15개 booster, 시간 오래 걸림)"
    & $VENV pipelines/train_opening.py
    if ($LASTEXITCODE -ne 0) { throw "train_opening 실패" }

    Write-Host "  - train_participants.py"
    & $VENV pipelines/train_participants.py
    if ($LASTEXITCODE -ne 0) { throw "train_participants 실패" }
} finally {
    Pop-Location
}

# 3. ONNX 변환
Write-Host "`n[3/4] ONNX 변환" -ForegroundColor Yellow
Push-Location $ML
try {
    & $VENV convert_onnx.py
    if ($LASTEXITCODE -ne 0) { throw "convert_onnx 실패" }
} finally {
    Pop-Location
}

# 4. git commit & push
Write-Host "`n[4/4] git commit + push" -ForegroundColor Yellow
Push-Location $ROOT
try {
    git add apps/web/ml/ apps/ml/models/
    $status = git status --porcelain
    if ($status) {
        $date = Get-Date -Format 'yyyy-MM-dd'
        git commit -m "chore(ml): 주간 재학습 $date`n`nModel 1 (사정율 v2) + Model 2 (복수예가) + Model 3 (참여자수) ONNX 갱신.`n`nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
        if ($LASTEXITCODE -ne 0) { throw "git commit 실패" }
        git push origin main
        if ($LASTEXITCODE -ne 0) { throw "git push 실패" }
        Write-Host "  ✅ 배포 완료 (Vercel 자동 빌드)"
    } else {
        Write-Host "  변경 사항 없음 (모델 변화 없음)"
    }
} finally {
    Pop-Location
}

Write-Host "`n=== 재학습 완료 ===" -ForegroundColor Green
