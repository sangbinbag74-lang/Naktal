/**
 * ⚠️ 2026-04-24 배포 포기 — RMSE 59명, 실용 불가
 *    memory/project_ml_model3_abandoned.md 참조
 *    ONNX 파일 제거됨, route는 410 Gone 즉시 응답 (init 시도 생략)
 *    UI/엔진에서 호출 제거됨. 재활성화 시 project_ml_model3_abandoned.md의
 *    재설계 조건(분류 모델 + 시계열 피처 + KoBERT 임베딩) 충족 후 복구.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-static";

const GONE_BODY = {
  error: "deprecated",
  reason: "Model 3 (participants prediction) deployment abandoned 2026-04-24 — RMSE 59 unacceptable",
  memory_ref: "memory/project_ml_model3_abandoned.md",
} as const;

export function GET() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}

export function POST() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}
