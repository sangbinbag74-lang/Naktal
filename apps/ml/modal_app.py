"""Modal.com deployment for Naktal ML API.

Deploy:
    modal deploy modal_app.py

Secrets required in Modal dashboard:
    ML_API_KEY
    NEXT_PUBLIC_SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import modal

# ------------------------------------------------------------------ #
# Modal image with all dependencies
# ------------------------------------------------------------------ #
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install_from_requirements("requirements.txt")
)

app = modal.App("naktal-ml", image=image)

# 모델 파일을 Modal volume에 저장
volume = modal.Volume.from_name("naktal-models", create_if_missing=True)
MODEL_DIR = "/models"

# ------------------------------------------------------------------ #
# Train function (수동 실행 또는 cron)
# ------------------------------------------------------------------ #
@app.function(
    secrets=[modal.Secret.from_name("naktal-secrets")],
    volumes={MODEL_DIR: volume},
    timeout=1800,  # 30분
    schedule=modal.Cron("0 2 * * 5"),  # 매주 금요일 02:00 UTC
)
def train_model() -> None:
    """주간 모델 재학습."""
    import os
    import sys

    sys.path.insert(0, "/root")

    # 모델 저장 경로를 volume으로 변경
    os.environ["MODEL_SAVE_DIR"] = MODEL_DIR

    from pipelines.train import main  # type: ignore[import]
    main()
    volume.commit()


# ------------------------------------------------------------------ #
# Web endpoint
# ------------------------------------------------------------------ #
@app.function(
    secrets=[modal.Secret.from_name("naktal-secrets")],
    volumes={MODEL_DIR: volume},
    container_idle_timeout=300,  # 5분 idle 후 종료
    allow_concurrent_inputs=10,
)
@modal.asgi_app()
def fastapi_app():
    import os
    import sys

    sys.path.insert(0, "/root")

    # volume에서 모델 로드
    os.environ["MODEL_SAVE_DIR"] = MODEL_DIR

    from api import app as _app  # type: ignore[import]
    return _app
