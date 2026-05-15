"use client";

import { useEffect, useState } from "react";

/**
 * AI 분석 로딩 화면 — Phase 2+3+4 Ensemble 추론 30초 대기 동안 표시
 *
 * 단계별 메시지 + 진행 바 + 펄스 애니메이션
 * (경영심리학: AI 분석 속도가 적당히 느릴수록 신뢰도 ↑)
 */

interface Step {
  label: string;
  detail: string;
  duration: number; // 이 단계 가시화 시간 (ms)
}

const STEPS: Step[] = [
  { label: "공고 데이터 분석",     detail: "발주처 입찰 이력 + 유사 공고 패턴 조회 중", duration: 3000 },
  { label: "사정율 분포 학습",     detail: "LightGBM Quantile 모델 — 발주처별 변동성 추정", duration: 5000 },
  { label: "낙찰하한가 직접 예측", detail: "1순위 투찰률 분포 모델로 안전 구간 계산", duration: 6000 },
  { label: "Ensemble 메타 결합",   detail: "사정율 + 낙찰하한 + 1순위 위치 6개 모델 결합", duration: 7000 },
  { label: "안전 quantile 검증",   detail: "적격 통과 안전선 + 발주처 변동성 적응", duration: 5000 },
  { label: "최적 투찰가 산출",     detail: "노이즈 시뮬레이션 + 하한가 검증 + 최종 추천", duration: 4000 },
];

const TOTAL_MS = STEPS.reduce((s, x) => s + x.duration, 0);

export function AnalysisLoader() {
  const [elapsed, setElapsed] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const ms = Date.now() - start;
      setElapsed(ms);
      // 누적 시간으로 현재 step 계산
      let acc = 0;
      for (let i = 0; i < STEPS.length; i++) {
        acc += STEPS[i]!.duration;
        if (ms < acc) { setCurrentStep(i); return; }
      }
      setCurrentStep(STEPS.length - 1);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const progress = Math.min(95, (elapsed / TOTAL_MS) * 100);
  const elapsedSec = (elapsed / 1000).toFixed(1);

  return (
    <div style={{
      padding: "32px 24px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 20,
    }}>
      <style>{`
        @keyframes naktal-pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.95); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        @keyframes naktal-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes naktal-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes naktal-fadein {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* 메인 시각 — 회전 링 + 펄스 도트 */}
      <div style={{ position: "relative", width: 100, height: 100 }}>
        {/* 회전 링 */}
        <div style={{
          position: "absolute", inset: 0,
          borderRadius: "50%",
          border: "3px solid #E8ECF2",
          borderTopColor: "#1B3A6B",
          borderRightColor: "#1B3A6B",
          animation: "naktal-spin 1.2s linear infinite",
        }} />
        {/* 내부 펄스 도트 */}
        <div style={{
          position: "absolute",
          left: "50%", top: "50%",
          transform: "translate(-50%, -50%)",
          width: 28, height: 28,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #1B3A6B 0%, #60A5FA 100%)",
          animation: "naktal-pulse 1.5s ease-in-out infinite",
          boxShadow: "0 0 20px rgba(27, 58, 107, 0.4)",
        }} />
      </div>

      {/* 헤드라인 */}
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontSize: 16, fontWeight: 800, color: "#0F172A",
          letterSpacing: "-0.01em",
          marginBottom: 4,
        }}>
          AI가 공고를 정밀 분석하고 있습니다
        </div>
        <div style={{ fontSize: 11, color: "#94A3B8" }}>
          8개 ML 모델 Ensemble · 약 {Math.ceil(TOTAL_MS / 1000)}초 소요
        </div>
      </div>

      {/* 진행 바 (shimmer 효과) */}
      <div style={{
        width: "100%", maxWidth: 360,
        height: 6, borderRadius: 999,
        background: "#F1F5F9",
        overflow: "hidden",
        position: "relative",
      }}>
        <div style={{
          height: "100%",
          width: `${progress}%`,
          borderRadius: 999,
          background: "linear-gradient(90deg, #1B3A6B 0%, #60A5FA 50%, #1B3A6B 100%)",
          backgroundSize: "200% 100%",
          animation: "naktal-shimmer 2s linear infinite",
          transition: "width 0.3s ease",
        }} />
      </div>

      {/* 현재 단계 표시 */}
      <div key={currentStep} style={{
        width: "100%", maxWidth: 380,
        background: "#F8FAFC",
        border: "1px solid #E8ECF2",
        borderRadius: 12,
        padding: "14px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}>
        <div style={{
          fontSize: 12, fontWeight: 700, color: "#1B3A6B",
          display: "flex", alignItems: "center", gap: 8,
          animation: "naktal-fadein 0.3s ease",
        }}>
          <span style={{
            display: "inline-block",
            width: 6, height: 6, borderRadius: "50%",
            background: "#10B981",
            boxShadow: "0 0 6px #10B981",
            animation: "naktal-pulse 1s ease-in-out infinite",
          }} />
          {STEPS[currentStep]?.label ?? "분석 중"}
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#94A3B8", fontWeight: 500 }}>
            {currentStep + 1} / {STEPS.length}
          </span>
        </div>
        <div style={{
          fontSize: 11, color: "#64748B", lineHeight: 1.4,
          animation: "naktal-fadein 0.3s ease",
        }}>
          {STEPS[currentStep]?.detail ?? ""}
        </div>
      </div>

      {/* 신뢰도 강조 메시지 */}
      <div style={{
        fontSize: 10.5, color: "#94A3B8",
        textAlign: "center",
        maxWidth: 380, lineHeight: 1.5,
      }}>
        ⚡ <strong style={{ color: "#475569" }}>Quantile Regression</strong> +
        <strong style={{ color: "#475569" }}> XGBoost Stacking</strong> +
        <strong style={{ color: "#475569" }}> 메타 Ensemble</strong><br />
        적격 통과 안전선 자동 계산 중 ({elapsedSec}s)
      </div>
    </div>
  );
}
