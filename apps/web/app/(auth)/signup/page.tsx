"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BizNoInput } from "@/components/ui/biz-no-input";

interface FormState {
  bizNo: string;
  bizName: string;
  ownerName: string;
  ownerPhone: string;
  password: string;
  passwordConfirm: string;
  notifyEmail: string;
  notifyPhone: string;
  address: string;
}

// 카카오 비즈앱 심사 통과 시 true 로 변경 → 카카오 인증 흐름 자동 활성화
const KAKAO_AUTH_ENABLED = false;

interface KakaoVerified {
  kakaoId: string;
  name: string;
  phone: string | null;
  email: string | null;
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

const LabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "#374151",
  display: "block",
  marginBottom: 6,
};

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    bizNo: "", bizName: "", ownerName: "", ownerPhone: "",
    password: "", passwordConfirm: "",
    notifyEmail: "", notifyPhone: "",
    address: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [bizAutoFilled, setBizAutoFilled] = useState(false);
  const [kakaoVerified, setKakaoVerified] = useState<KakaoVerified | null>(null);
  const [kakaoLoading, setKakaoLoading] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);

  // 카카오 SDK 로드 + 콜백에서 돌아왔을 때 sessionStorage 복원
  useEffect(() => {
    const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    if (!KAKAO_KEY) {
      console.error("[kakao] NEXT_PUBLIC_KAKAO_JS_KEY missing");
      return;
    }
    if (!document.querySelector('script[src*="kakao.min.js"]')) {
      const script = document.createElement("script");
      script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";
      script.async = true;
      script.onload = () => {
        if (window.Kakao && !window.Kakao.isInitialized()) {
          window.Kakao.init(KAKAO_KEY);
          console.log("[kakao] SDK initialized");
        }
      };
      script.onerror = () => console.error("[kakao] SDK load failed");
      document.head.appendChild(script);
    } else if (window.Kakao && !window.Kakao.isInitialized()) {
      window.Kakao.init(KAKAO_KEY);
    }

    // 카카오 콜백에서 돌아온 경우 — sessionStorage에서 인증 정보 복원
    try {
      const stored = sessionStorage.getItem("kakao_verified");
      if (stored) {
        const v = JSON.parse(stored) as KakaoVerified;
        if (v.name) {
          setKakaoVerified(v);
          setForm(prev => ({
            ...prev,
            notifyEmail: prev.notifyEmail || v.email || "",
            notifyPhone: prev.notifyPhone || (v.phone ? v.phone.replace(/^\+82\s*/, "0").replace(/\s/g, "") : ""),
          }));
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
    // SDK v2: authorize는 redirect 기반 — /auth/kakao/callback 에서 토큰 교환 후 sessionStorage 저장 + signup으로 복귀
    window.Kakao.Auth.authorize({
      redirectUri: `${window.location.origin}/auth/kakao/callback`,
      scope: "profile_nickname,account_email,name,phone_number",
    });
  }

  function set(key: keyof FormState) {
    return (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  }
  function setE(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.bizNo.length !== 10) { setError("사업자번호 10자리를 입력해주세요."); return; }
    if (!form.ownerName.trim()) { setError("대표자 이름을 입력해주세요."); return; }
    if (!form.ownerPhone.trim()) { setError("대표자 휴대폰 번호를 입력해주세요."); return; }
    if (!form.notifyEmail.trim()) { setError("이메일을 입력해주세요."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.notifyEmail.trim())) { setError("올바른 이메일 형식이 아닙니다."); return; }
    if (!form.address.trim()) { setError("주소를 입력해주세요."); return; }
    if (form.password.length < 8) { setError("비밀번호는 8자 이상이어야 합니다."); return; }
    if (form.password !== form.passwordConfirm) { setError("비밀번호가 일치하지 않습니다."); return; }
    if (KAKAO_AUTH_ENABLED && !kakaoVerified) { setError("카카오 본인인증을 먼저 완료해주세요."); return; }

    setLoading(true);
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-bizno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bizNo: form.bizNo }),
      });
      const data = (await res.json()) as { valid: boolean; message?: string };
      if (!data.valid) {
        setError(data.message ?? "유효하지 않은 사업자번호입니다.");
        setLoading(false);
        setVerifying(false);
        return;
      }
    } catch {
      console.error("사업자 검증 API 호출 실패 — 가입 진행");
    }

    // G2B 업체정보 자동 조회 + 대표자명 자동 대조
    let g2bCeoName: string | null = null;
    try {
      const g2bRes = await fetch(`/api/auth/lookup-biz?bizNo=${form.bizNo}`);
      const g2b = await g2bRes.json() as { ok: boolean; bizName?: string; ceoName?: string };
      if (g2b.ok && g2b.bizName) {
        g2bCeoName = g2b.ceoName ?? null;
        setForm(prev => ({
          ...prev,
          bizName: g2b.bizName ?? prev.bizName,
        }));
        setBizAutoFilled(true);
      }
    } catch {
      console.error("G2B 업체정보 조회 실패 — 수동 입력");
    }

    setVerifying(false);

    // 대표자명 자기신고 vs G2B 자동조회 결과 대조 (한국 이름 공백·특수문자 정규화)
    const norm = (s: string) => (s || "").replace(/\s+/g, "").replace(/[()-]/g, "");
    if (g2bCeoName && norm(form.ownerName) !== norm(g2bCeoName)) {
      setError(`입력하신 대표자명(${form.ownerName})과 사업자등록증의 대표자명(${g2bCeoName})이 일치하지 않습니다.`);
      setLoading(false);
      return;
    }

    const email = `biz_${form.bizNo}@naktal.biz`;
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signUp({ email, password: form.password });

    if (authError) {
      setError(authError.message);
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
      position: "relative",
      overflowX: "hidden",
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
        <div style={{ textAlign: "center", marginBottom: 24 }}>
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
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>
            1분이면 시작할 수 있어요
          </div>
          <div style={{ fontSize: 13, color: "#64748B" }}>
            사업자번호 + 대표자 정보만 있으면 끝
          </div>
        </div>

        <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* 카카오 본인인증 (점검 중) */}
          {KAKAO_AUTH_ENABLED ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ background: "#1B3A6B", color: "#fff", width: 20, height: 20, borderRadius: 10, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>★</span>
                <label style={{ ...LabelStyle, margin: 0 }}>본인인증</label>
              </div>
              {kakaoVerified ? (
                <div style={{ background: "#ECFDF5", border: "1.5px solid #A7F3D0", borderRadius: 10, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#059669", fontWeight: 700, marginBottom: 3 }}>✓ 인증 완료</div>
                    <div style={{ fontSize: 14, color: "#0F172A", fontWeight: 700 }}>{kakaoVerified.name}</div>
                  </div>
                  <button type="button" onClick={() => setKakaoVerified(null)} style={{ fontSize: 11, color: "#64748B", background: "none", border: "1px solid #E2E8F0", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>다시 인증</button>
                </div>
              ) : (
                <button type="button" onClick={handleKakaoVerify} disabled={kakaoLoading || loading} style={{ width: "100%", height: 50, background: kakaoLoading ? "#F9DD4A" : "#FEE500", color: "#191600", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: kakaoLoading ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>💬</span>
                  {kakaoLoading ? "인증 중..." : "카카오로 시작하기"}
                </button>
              )}
            </div>
          ) : (
            <div>
              <div style={{
                width: "100%", padding: "12px 14px",
                background: "#FFFBEB", border: "1px dashed #FCD34D", borderRadius: 10,
                fontSize: 12, color: "#92400E", lineHeight: 1.6, textAlign: "center",
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                  💬 카카오 본인인증 점검 중
                </div>
                <div style={{ color: "#B45309" }}>
                  현재는 직접 입력으로 가입하실 수 있습니다.<br/>점검 완료 후 더 빠른 가입이 가능해집니다.
                </div>
              </div>
            </div>
          )}

          {/* 1단계: 사업자번호 */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ background: "#1B3A6B", color: "#fff", width: 20, height: 20, borderRadius: 10, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>1</span>
              <label style={{ ...LabelStyle, margin: 0 }}>사업자번호</label>
            </div>
            <BizNoInput value={form.bizNo} onChange={set("bizNo")} disabled={loading} />
            {bizAutoFilled && (
              <div style={{ marginTop: 8, padding: "10px 12px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, fontSize: 12, color: "#1E40AF", lineHeight: 1.6 }}>
                <strong>{form.bizName}</strong>
                <div style={{ fontSize: 10.5, color: "#60A5FA", marginTop: 2 }}>나라장터 자동 조회됨</div>
              </div>
            )}
          </div>

          {/* 2단계: 대표자 이름 */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ background: "#1B3A6B", color: "#fff", width: 20, height: 20, borderRadius: 10, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>2</span>
              <label style={{ ...LabelStyle, margin: 0 }}>대표자 이름</label>
            </div>
            <input
              type="text" required value={form.ownerName} disabled={loading}
              onChange={setE("ownerName")} placeholder="사업자등록증의 대표자명"
              className="naktal-input" autoComplete="name"
            />
            <div style={{ fontSize: 10.5, color: "#94A3B8", marginTop: 4, lineHeight: 1.5 }}>
              사업자등록증과 일치하지 않으면 가입이 거부됩니다. (나라장터 자동 대조)
            </div>
          </div>

          {/* 3단계: 대표자 휴대폰 */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ background: "#1B3A6B", color: "#fff", width: 20, height: 20, borderRadius: 10, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>3</span>
              <label style={{ ...LabelStyle, margin: 0 }}>휴대폰</label>
            </div>
            <input
              type="tel" required value={form.ownerPhone} disabled={loading}
              onChange={setE("ownerPhone")} placeholder="010-0000-0000"
              className="naktal-input" autoComplete="tel"
            />
            <div style={{ fontSize: 10.5, color: "#94A3B8", marginTop: 4, lineHeight: 1.5 }}>
              카카오 알림톡·낙찰 결과 안내 발송용
            </div>
          </div>

          {/* 4단계: 이메일 */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ background: "#1B3A6B", color: "#fff", width: 20, height: 20, borderRadius: 10, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>4</span>
              <label style={{ ...LabelStyle, margin: 0 }}>이메일</label>
            </div>
            <input
              type="email" required value={form.notifyEmail} disabled={loading}
              onChange={setE("notifyEmail")} placeholder="contact@company.com"
              className="naktal-input" autoComplete="email"
            />
            <div style={{ fontSize: 10.5, color: "#94A3B8", marginTop: 4, lineHeight: 1.5 }}>
              계산서·결과 리포트 발송용
            </div>
          </div>

          {/* 5단계: 주소 */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ background: "#1B3A6B", color: "#fff", width: 20, height: 20, borderRadius: 10, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>5</span>
              <label style={{ ...LabelStyle, margin: 0 }}>사업장 주소</label>
            </div>
            <input
              type="text" required value={form.address} disabled={loading}
              onChange={setE("address")} placeholder="예: 서울특별시 강남구 테헤란로 123, 4층"
              className="naktal-input" autoComplete="street-address"
            />
            <div style={{ fontSize: 10.5, color: "#94A3B8", marginTop: 4, lineHeight: 1.5 }}>
              계산서·우편물 발송 및 사업자 신원 확인용
            </div>
          </div>

          {/* 6단계: 비밀번호 */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ background: "#1B3A6B", color: "#fff", width: 20, height: 20, borderRadius: 10, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>6</span>
              <label style={{ ...LabelStyle, margin: 0 }}>비밀번호</label>
            </div>
            <input type="password" required minLength={8} value={form.password} disabled={loading}
              onChange={setE("password")} placeholder="8자 이상" className="naktal-input"
              style={{ marginBottom: 8 }}
            />
            <input type="password" required value={form.passwordConfirm} disabled={loading}
              onChange={setE("passwordConfirm")} placeholder="비밀번호 재입력" className="naktal-input" />
          </div>

          {/* 수신동의 (선택, 체크박스만) */}
          <label style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            padding: "10px 12px", background: "#F8FAFC", borderRadius: 8,
            cursor: "pointer", fontSize: 12, color: "#475569", lineHeight: 1.5,
          }}>
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
              disabled={loading}
              style={{ marginTop: 3, width: 14, height: 14, accentColor: "#1B3A6B", cursor: "pointer" }}
            />
            <span>
              <strong style={{ color: "#0F172A" }}>(선택)</strong> 새 공고 추천·이벤트·서비스 안내 수신에 동의합니다.
              <span style={{ display: "block", fontSize: 10.5, color: "#94A3B8", marginTop: 2 }}>
                낙찰 결과·계산서 등 거래 필수 안내는 동의와 무관하게 발송됩니다.
              </span>
            </span>
          </label>

          {error && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#DC2626" }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="naktal-btn-primary" style={{ marginTop: 4 }}>
            {verifying ? "사업자 검증 중..." : loading ? "가입 중..." : "회원가입 완료"}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 13, color: "#64748B", marginTop: 16 }}>
          이미 계정이 있으신가요?{" "}
          <Link href="/login" style={{ color: "#1B3A6B", fontWeight: 600 }}>로그인</Link>
        </p>
      </div>

      {/* 우측: 수집 항목 안내 (데스크탑 한정, 카카오 비즈앱 심사 대응) */}
      <aside style={{
        position: "absolute",
        top: "50%",
        left: "calc(50% + 252px)",
        transform: "translateY(-50%)",
        width: 280,
        background: "#fff",
        border: "1px solid #EAECF0",
        borderRadius: 16,
        padding: "20px 22px",
        fontSize: 12.5,
        lineHeight: 1.7,
        boxShadow: "0 2px 12px rgba(15,30,60,0.04)",
      }}>
        <div style={{ fontWeight: 700, color: "#0F172A", marginBottom: 12, fontSize: 13.5 }}>
          📋 수집하는 회원정보
        </div>
        <div style={{ color: "#1B3A6B", fontWeight: 700, marginBottom: 4 }}>
          [필수] 직접 입력
        </div>
        <div style={{ color: "#64748B", paddingLeft: 8, marginBottom: 10 }}>
          ✓ 사업자등록번호<br/>✓ 대표자 이름<br/>✓ 휴대폰<br/>✓ 이메일<br/>✓ 사업장 주소<br/>✓ 비밀번호
        </div>
        <div style={{ color: "#94A3B8", fontWeight: 700, marginBottom: 4 }}>
          [선택]
        </div>
        <div style={{ color: "#94A3B8", paddingLeft: 8, marginBottom: 10 }}>
          ○ 마케팅·이벤트 수신 동의
        </div>
        <div style={{ fontSize: 11, color: "#92400E", background: "#FFFBEB", border: "1px dashed #FCD34D", borderRadius: 8, padding: "8px 10px", lineHeight: 1.5 }}>
          카카오 본인인증은 현재 점검 중입니다. 점검 완료 후 자동으로 활성화됩니다.
        </div>
      </aside>
    </div>
  );
}
