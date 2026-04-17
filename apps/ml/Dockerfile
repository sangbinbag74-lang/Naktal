FROM python:3.11-slim

WORKDIR /app

# 빌드 도구 (lightgbm 설치용)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Railway가 PORT 환경변수 설정
ENV PORT=8000
CMD ["sh", "-c", "uvicorn serve:app --host 0.0.0.0 --port ${PORT}"]
