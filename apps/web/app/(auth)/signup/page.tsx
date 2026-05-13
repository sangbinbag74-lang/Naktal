"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BizNoInput } from "@/components/ui/biz-no-input";

// 카카오 비즈앱 심사 통과 (2026-05-13) — 필수동의 4개: profile_nickname / account_email / name / phone_number
const KAKAO_AUTH_ENABLED = true;

interface KakaoVerified {
  kakaoId: string;
  name: string;
  phone: string | null;
  email: string | null;
}

interface FormState {
  bizNo: string;
  bizName: string;
  ownerName: string;
  ownerPhone: string;
  password: string;
  passwordConfirm: string;
  notifyEmail: string;
  address: string;
}

declare global {
  interface Window {
    Kakao?: {
      isInitialized: () => boolean;
      init: (key: string) => void;
      Auth: {
        authorize: (opts: { redirectUri: string; scope?: string; state?: string }) => void;
      };
    };
  }
}

const TOTAL_STEPS = KAKAO_AUTH_ENABLED ? 4 : 3;
const STEP_LABELS = KAKAO_AUTH_ENABLED
  ? ["본인인증", "사업자 확인", "연락처·주소", "비밀번호"]
  : ["사업자 확인", "연락처·주소", "비밀번호"];

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>({
    bizNo: "", bizName: "", ownerName: "", ownerPhone: "",
    password: "", passwordConfirm: "",
    notifyEmail: "",
    address: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyStage, setVerifyStage] = useState<"bizno" | "g2b" | "match" | null>(null);
  const [bizAutoFilled, setBizAutoFilled] = useState(false);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [kakaoVerified, setKakaoVerified] = useState<KakaoVerified | null>(null);
  const [kakaoLoading, setKakaoLoading] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);

  // 카카오 SDK 로드 + 콜백 복원
  useEffect(() => {
    const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    if (KAKAO_KEY) {
      if (!document.querySelector('script[src*="kakao.min.js"]')) {
        const script = document.createElement("script");
        script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";
        script.async = true;
        script.onload = () => {
          if (window.Kakao && !window.Kakao.isInitialized()) {
            window.Kakao.init(KAKAO_KEY);
          }
        };
        document.head.appendChild(script);
      } else if (window.Kakao && !window.Kakao.isInitialized()) {
        window.Kakao.init(KAKAO_KEY);
      }
    }

    // 카카오 콜백 복원 — 인증 정보 + 다음 단계로 자동 진행
    try {
      const stored = sessionStorage.getItem("kakao_verified");
      if (stored) {
        const v = JSON.parse(stored) as KakaoVerified;
        if (v.name) {
          setKakaoVerified(v);
          setForm(prev => ({
            ...prev,
            ownerName: v.name,
            notifyEmail: prev.notifyEmail || v.email || "",
            ownerPhone: prev.ownerPhone || (v.phone ? v.phone.replace(/^\+82\s*/, "0").replace(/\s/g, "") : ""),
          }));
          setStep(2); // 카카오 완료 → Step 2 로 자동 이동
        }
        sessionStorage.removeItem("kakao_verified");
      }
    } catch (e) { console.error("[kakao] sessionStorage parse failed", e); }

    // URL ?error= 파라미터
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setError(decodeURIComponent(err));
      window.history.replaceState({}, "", "/signup");
    }
  }, []);

  function handleKakaoVerify() {
    if (!window.Kakao || !window.Kakao.isInitialized()) {
      setError("카카오 SDK 초기화 실패. 새로고침 후 다시 시도해주세요.");
      return;
    }
    setKakaoLoading(true);
    setError(null);
    window.Kakao.Auth.authorize({
      redirectUri: `${window.location.origin}/auth/kakao/callback`,
      scope: "profile_nickname,account_email,name,phone_number",
    });
  }

  function set(key: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  // 이름 비교용 정규화
  //  - 공백 / 괄호 / 하이픈 / 점 / 한자 한글 변환 시 부산물 제거
  //  - 한자(괄호 안), 영문(괄호 안) 등 부가표기 제거 후 남는 한글로 비교
  //  - 영문은 대소문자 무시
  function normalizeName(raw: string): string {
    if (!raw) return "";
    let s = raw;
    // 괄호와 그 안 내용 모두 제거 ("홍길동(洪吉童)" → "홍길동", "홍길동(HONG)" → "홍길동")
    s = s.replace(/[\(（［\[][^\)）］\]]*[\)）］\]]/g, "");
    // 공백·점·하이픈·중점·콤마·슬래시 등 제거
    s = s.replace(/[\s\.\-·,/]+/g, "");
    // 영문은 소문자 통일
    return s.toLowerCase();
  }

  // 공동대표일 수 있으니 split 후 각각 비교
  function splitCoCeos(raw: string): string[] {
    if (!raw) return [];
    // "홍길동, 김철수" / "홍길동·김철수" / "홍길동/김철수" / "홍길동 외 N명" → split
    const stripped = raw.replace(/외\s*\d+\s*명/g, "");
    return stripped
      .split(/[,·/、､]|\s외\s/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  // 사용자 입력 이름이 G2B 대표자명(들) 중 하나라도 일치하면 OK
  function isCeoMatch(userName: string, g2bCeoName: string): boolean {
    const userN = normalizeName(userName);
    if (!userN) return false;
    const candidates = splitCoCeos(g2bCeoName);
    return candidates.some(c => normalizeName(c) === userN);
  }

  // Step 2 검증 + G2B 대조 후 Step 3로
  async function goFromStep2() {
    setError(null);
    if (form.bizNo.length !== 10) { setError("사업자번호 10자리를 입력해주세요."); return; }
    if (!form.ownerName.trim()) { setError("대표자 이름을 입력해주세요."); return; }
    if (!form.ownerPhone.trim()) { setError("대표자 휴대폰 번호를 입력해주세요."); return; }

    setVerifying(true);
    setVerifyStage("bizno");

    // 1. 사업자번호 국세청 검증
    try {
      const res = await fetch("/api/auth/verify-bizno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bizNo: form.bizNo }),
      });
      const data = (await res.json()) as { valid: boolean; message?: string };
      if (!data.valid) {
        setError(data.message ?? "유효하지 않은 사업자번호입니다.");
        setVerifying(false);
        setVerifyStage(null);
        return;
      }
    } catch {
      console.error("사업자 검증 API 호출 실패 — 진행");
    }

    // 2. 나라장터(G2B) 조회
    setVerifyStage("g2b");
    let g2bBizName: string | null = null;
    let g2bCeoName: string | null = null;
    try {
      const g2bRes = await fetch(`/api/auth/lookup-biz?bizNo=${form.bizNo}`);
      const g2b = await g2bRes.json() as { ok: boolean; bizName?: string; ceoName?: string; error?: string };
      if (g2b.ok && g2b.bizName) {
        g2bBizName = g2b.bizName ?? null;
        g2bCeoName = g2b.ceoName ?? null;
        setForm(prev => ({ ...prev, bizName: g2b.bizName ?? prev.bizName }));
        setBizAutoFilled(true);
      } else if (!g2b.ok) {
        setError(g2b.error ?? "나라장터에 등록되지 않은 사업자입니다. 나라장터 가입 후 다시 시도해주세요.");
        setVerifying(false);
        setVerifyStage(null);
        return;
      }
    } catch {
      console.error("G2B 조회 실패");
      setError("나라장터 조회에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setVerifying(false);
      setVerifyStage(null);
      return;
    }

    // 3. 대표자명 대조 (공동대표·한자·영문 등 다양한 형태 처리)
    setVerifyStage("match");
    await new Promise(r => setTimeout(r, 300)); // UI 단계 표시용 짧은 지연

    if (g2bCeoName && !isCeoMatch(form.ownerName, g2bCeoName)) {
      setError(`입력하신 대표자명(${form.ownerName})과 사업자등록증의 대표자명(${g2bCeoName})이 일치하지 않습니다.`);
      setVerifying(false);
      setVerifyStage(null);
      return;
    }

    // 4. (선택) 카카오 인증 명의 vs 사업자등록증 대표자명 대조
    if (KAKAO_AUTH_ENABLED && kakaoVerified && g2bCeoName) {
      if (!isCeoMatch(kakaoVerified.name, g2bCeoName)) {
        setError(`카카오 인증 명의(${kakaoVerified.name})와 사업자등록증의 대표자명(${g2bCeoName})이 일치하지 않습니다.`);
        setVerifying(false);
        setVerifyStage(null);
        return;
      }
    }

    setVerifying(false);
    setVerifyStage(null);
    void g2bBizName; // 미사용 변수 경고 방지
    setStep(KAKAO_AUTH_ENABLED ? 3 : 2);
  }

  // Step 3 검증 후 Step 4로
  function goFromStep3() {
    setError(null);
    if (!form.notifyEmail.trim()) { setError("이메일을 입력해주세요."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.notifyEmail.trim())) { setError("올바른 이메일 형식이 아닙니다."); return; }
    if (!form.address.trim()) { setError("주소를 입력해주세요."); return; }
    setStep(KAKAO_AUTH_ENABLED ? 4 : 3);
  }

  // Step 4 — 가입 완료
  async function handleSignup() {
    setError(null);
    if (form.password.length < 8) { setError("비밀번호는 8자 이상이어야 합니다."); return; }
    if (form.password !== form.passwordConfirm) { setError("비밀번호가 일치하지 않습니다."); return; }

    setLoading(true);
    const email = `biz_${form.bizNo}@naktal.biz`;
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signUp({ email, password: form.password });

    if (authError) {
      const msg = authError.message.toLowerCase();
      if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("user already")) {
        setError("이미 가입된 사업자번호입니다. 로그인 페이지에서 진행해 주세요.");
        setAlreadyExists(true);
      } else {
        setError(authError.message);
      }
      setLoading(false);
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        bizNo: form.bizNo, bizName: form.bizName, ownerName: form.ownerName,
        notifyEmail: form.notifyEmail,
        notifyPhone: form.ownerPhone,
        address: form.address.trim(),
        marketingConsent,
      };
      if (KAKAO_AUTH_ENABLED && kakaoVerified) {
        payload.kakaoId = kakaoVerified.kakaoId;
        payload.kakaoVerifiedName = kakaoVerified.name;
        payload.kakaoVerifiedPhone = kakaoVerified.phone;
      }
      await fetch("/api/auth/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch { console.error("User 프로필 저장 실패"); }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#F7F8FA",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
    }}>
      <div style={{
        background: "#fff",
        borderRadius: 20,
        border: "1px solid #EAECF0",
        padding: "40px 44px",
        width: "100%",
        maxWidth: 440,
        boxShadow: "0 4px 24px rgba(15,30,60,0.06)",
      }}>
        {/* 헤더 */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{
              width: 36, height: 36, borderRadius: 8,
              background: "#1B3A6B", color: "#fff",
              display: "grid", placeItems: "center",
              fontWeight: 900, fontSize: 20, letterSpacing: "-0.04em",
            }}>낙</span>
            <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.1 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: "#1B3A6B", letterSpacing: "-0.025em" }}>낙비</span>
              <span style={{ fontSize: 11, color: "#94A3B8", marginTop: 2, fontWeight: 500 }}>
                내 손안의 AI 낙찰비서
              </span>
            </span>
          </div>
        </div>

        {/* 진행 인디케이터 */}
        <ProgressBar step={step} total={TOTAL_STEPS} labels={STEP_LABELS} />

        {/* Step 1 — 카카오 본인인증 */}
        {KAKAO_AUTH_ENABLED && step === 1 && (
          <StepWrap title="본인인증" subtitle="카카오 계정으로 1초 만에 시작"
            notice="사업자등록증의 대표자명과 동일한 성함이어야 가입할 수 있어요.">
            {kakaoVerified ? (
              <div style={{ background: "#ECFDF5", border: "1.5px solid #A7F3D0", borderRadius: 10, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#059669", fontWeight: 700, marginBottom: 3 }}>✓ 인증 완료</div>
                  <div style={{ fontSize: 14, color: "#0F172A", fontWeight: 700 }}>{kakaoVerified.name}</div>
                </div>
                <button type="button" onClick={() => setKakaoVerified(null)}
                  style={{ fontSize: 11, color: "#64748B", background: "none", border: "1px solid #E2E8F0", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                  다시 인증
                </button>
              </div>
            ) : (
              <button type="button" onClick={handleKakaoVerify} disabled={kakaoLoading}
                style={{ width: "100%", height: 52, background: kakaoLoading ? "#F9DD4A" : "#FEE500", color: "#191600", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: kakaoLoading ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>💬</span>
                {kakaoLoading ? "인증 중..." : "카카오로 시작하기"}
              </button>
            )}
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 12, lineHeight: 1.6 }}>
              카카오에서 이름·휴대폰·이메일을 받아옵니다.<br/>
              CI(연계정보)는 수집하지 않습니다.
            </div>
            {kakaoVerified && (
              <PrimaryButton onClick={() => setStep(2)}>다음</PrimaryButton>
            )}
          </StepWrap>
        )}

        {/* Step 2 — 사업자 확인 */}
        {step === (KAKAO_AUTH_ENABLED ? 2 : 1) && (
          <StepWrap title="사업자 확인" subtitle="사업자등록번호와 대표자 정보를 입력해주세요"
            notice="사업자등록증의 대표자명과 동일한 성함이어야 가입할 수 있어요. (나라장터 자동 대조)">
            <Field label="사업자번호">
              <BizNoInput value={form.bizNo} onChange={(v) => set("bizNo", v)} disabled={verifying} />
              {bizAutoFilled && form.bizName && (
                <InfoBox>
                  <strong>{form.bizName}</strong>
                  <div style={{ fontSize: 10.5, color: "#60A5FA", marginTop: 2 }}>나라장터 자동 조회됨</div>
                </InfoBox>
              )}
            </Field>
            <Field label="대표자 이름" hint="사업자등록증과 일치해야 합니다 (나라장터 자동 대조)">
              <input type="text" value={form.ownerName} disabled={verifying}
                onChange={(e) => set("ownerName", e.target.value)} placeholder="홍길동"
                className="naktal-input" autoComplete="name" />
            </Field>
            <Field label="대표자 휴대폰" hint="카카오 알림톡·낙찰 결과 안내 발송용">
              <input type="tel" value={form.ownerPhone} disabled={verifying}
                onChange={(e) => set("ownerPhone", e.target.value)} placeholder="010-0000-0000"
                className="naktal-input" autoComplete="tel" />
            </Field>
            <NavButtons
              onBack={KAKAO_AUTH_ENABLED ? () => setStep(1) : undefined}
              onNext={goFromStep2}
              nextLabel={verifying ? "사업자 검증 중..." : "다음"}
              loading={verifying}
            />
          </StepWrap>
        )}

        {/* Step 3 — 연락처·주소 */}
        {step === (KAKAO_AUTH_ENABLED ? 3 : 2) && (
          <StepWrap title="연락처·주소" subtitle="계산서·우편물 발송에 사용됩니다"
            notice="이메일은 결과 리포트, 주소는 세금계산서 발송에 사용돼요. 정확히 입력해 주세요.">
            <Field label="이메일" hint="계산서·결과 리포트 발송용">
              <input type="email" value={form.notifyEmail}
                onChange={(e) => set("notifyEmail", e.target.value)} placeholder="contact@company.com"
                className="naktal-input" autoComplete="email" />
            </Field>
            <Field label="사업장 주소" hint="세금계산서·우편물 발송 및 사업자 실재성 확인용">
              <input type="text" value={form.address}
                onChange={(e) => set("address", e.target.value)} placeholder="예: 서울특별시 강남구 테헤란로 123, 4층"
                className="naktal-input" autoComplete="street-address" />
            </Field>
            <NavButtons
              onBack={() => setStep(KAKAO_AUTH_ENABLED ? 2 : 1)}
              onNext={goFromStep3}
              nextLabel="다음"
            />
          </StepWrap>
        )}

        {/* Step 4 — 비밀번호 + 동의 + 가입 완료 */}
        {step === TOTAL_STEPS && (
          <StepWrap title="비밀번호 설정" subtitle="마지막 단계입니다"
            notice="비밀번호는 8자 이상이어야 해요. 마케팅 동의는 선택이지만, 거래 안내(낙찰 결과·계산서)는 무조건 발송돼요.">
            <Field label="비밀번호" hint="8자 이상">
              <input type="password" value={form.password} disabled={loading}
                onChange={(e) => set("password", e.target.value)} placeholder="8자 이상"
                className="naktal-input" autoComplete="new-password" />
            </Field>
            <Field label="비밀번호 확인">
              <input type="password" value={form.passwordConfirm} disabled={loading}
                onChange={(e) => set("passwordConfirm", e.target.value)} placeholder="비밀번호 재입력"
                className="naktal-input" autoComplete="new-password" />
            </Field>

            {/* 마케팅 수신동의 */}
            <label style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              padding: "10px 12px", background: "#F8FAFC", borderRadius: 8,
              cursor: "pointer", fontSize: 12, color: "#475569", lineHeight: 1.5,
              marginTop: 4,
            }}>
              <input type="checkbox" checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)} disabled={loading}
                style={{ marginTop: 3, width: 14, height: 14, accentColor: "#1B3A6B", cursor: "pointer" }} />
              <span>
                <strong style={{ color: "#0F172A" }}>(선택)</strong> 새 공고 추천·이벤트·서비스 안내 수신에 동의합니다.
                <span style={{ display: "block", fontSize: 10.5, color: "#94A3B8", marginTop: 2 }}>
                  낙찰 결과·계산서 등 거래 필수 안내는 동의와 무관하게 발송됩니다.
                </span>
              </span>
            </label>

            <NavButtons
              onBack={() => setStep(KAKAO_AUTH_ENABLED ? 3 : 2)}
              onNext={handleSignup}
              nextLabel={loading ? "가입 중..." : "회원가입 완료"}
              loading={loading}
            />
          </StepWrap>
        )}

        {error && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#DC2626", marginTop: 14 }}>
            <div>{error}</div>
            {alreadyExists && (
              <Link href="/login" style={{
                display: "inline-block", marginTop: 8,
                padding: "7px 14px", borderRadius: 8,
                background: "#1B3A6B", color: "#fff",
                fontSize: 12.5, fontWeight: 700, textDecoration: "none",
              }}>
                로그인하러 가기 →
              </Link>
            )}
          </div>
        )}

        <p style={{ textAlign: "center", fontSize: 13, color: "#64748B", marginTop: 18 }}>
          이미 계정이 있으신가요?{" "}
          <Link href="/login" style={{ color: "#1B3A6B", fontWeight: 600 }}>로그인</Link>
        </p>
      </div>

      {/* 검증 진행 오버레이 */}
      {verifying && <VerifyOverlay stage={verifyStage} />}
    </div>
  );
}

function VerifyOverlay({ stage }: { stage: "bizno" | "g2b" | "match" | null }) {
  const steps = [
    { key: "bizno", label: "사업자번호 국세청 검증" },
    { key: "g2b",   label: "나라장터(G2B) 조회" },
    { key: "match", label: "대표자명 대조" },
  ] as const;
  const currentIdx = steps.findIndex(s => s.key === stage);
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(15,30,60,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 24,
      backdropFilter: "blur(2px)",
    }}>
      <div style={{
        background: "#fff", borderRadius: 16,
        padding: "28px 32px",
        width: "100%", maxWidth: 360,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <Spinner />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>사업자 정보 검증 중</div>
            <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 2 }}>5~10초 정도 걸려요. 잠시만요.</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {steps.map((s, i) => {
            const done = currentIdx > i;
            const active = currentIdx === i;
            return (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span style={{
                  width: 20, height: 20, borderRadius: 10,
                  display: "grid", placeItems: "center",
                  fontSize: 11, fontWeight: 700,
                  background: done ? "#059669" : active ? "#1B3A6B" : "#E2E8F0",
                  color: done || active ? "#fff" : "#94A3B8",
                  flexShrink: 0,
                }}>{done ? "✓" : i + 1}</span>
                <span style={{
                  color: done ? "#059669" : active ? "#0F172A" : "#94A3B8",
                  fontWeight: active ? 600 : 400,
                }}>{s.label}</span>
                {active && <span style={{ marginLeft: "auto" }}><MiniDot /></span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 28, height: 28,
      border: "3px solid #E2E8F0",
      borderTopColor: "#1B3A6B",
      borderRadius: "50%",
      animation: "naktal-spin 0.8s linear infinite",
    }}>
      <style>{`@keyframes naktal-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function MiniDot() {
  return (
    <span style={{
      display: "inline-block",
      width: 8, height: 8, borderRadius: 4,
      background: "#1B3A6B",
      animation: "naktal-blink 0.9s ease-in-out infinite",
    }}>
      <style>{`@keyframes naktal-blink { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }`}</style>
    </span>
  );
}

/* ─── 보조 컴포넌트들 ─── */

function ProgressBar({ step, total, labels }: { step: number; total: number; labels: string[] }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        {Array.from({ length: total }).map((_, i) => {
          const idx = i + 1;
          const done = idx < step;
          const active = idx === step;
          return (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: done ? "#1B3A6B" : active ? "#60A5FA" : "#E2E8F0",
              transition: "background 0.2s",
            }} />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748B" }}>
        <span style={{ fontWeight: 600, color: "#1B3A6B" }}>STEP {step} / {total}</span>
        <span>{labels[step - 1]}</span>
      </div>
    </div>
  );
}

function StepWrap({ title, subtitle, notice, children }: { title: string; subtitle: string; notice?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "#64748B" }}>{subtitle}</div>
      </div>
      {notice && (
        <div style={{
          background: "#EFF6FF",
          border: "1px solid #BFDBFE",
          borderRadius: 10,
          padding: "11px 14px",
          fontSize: 12.5,
          color: "#1E40AF",
          lineHeight: 1.6,
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
        }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>💡</span>
          <span>{notice}</span>
        </div>
      )}
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 6 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 10.5, color: "#94A3B8", marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 8, padding: "10px 12px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, fontSize: 12, color: "#1E40AF", lineHeight: 1.6 }}>
      {children}
    </div>
  );
}

function PrimaryButton({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="naktal-btn-primary" style={{ marginTop: 8 }}>
      {children}
    </button>
  );
}

function NavButtons({ onBack, onNext, nextLabel, loading }: { onBack?: () => void; onNext: () => void; nextLabel: string; loading?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
      {onBack && (
        <button type="button" onClick={onBack} disabled={loading}
          style={{ flex: 1, height: 50, borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", cursor: "pointer", fontSize: 13.5, color: "#64748B", fontWeight: 600 }}>
          이전
        </button>
      )}
      <button type="button" onClick={onNext} disabled={loading} className="naktal-btn-primary" style={{ flex: onBack ? 2 : 1, marginTop: 0 }}>
        {nextLabel}
      </button>
    </div>
  );
}
