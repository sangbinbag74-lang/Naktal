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
  password: string;
  passwordConfirm: string;
  notifyEmail: string;
  notifyPhone: string;
}

interface KakaoVerified {
  kakaoId: string;
  name: string;
  phone: string | null;
  birthday: string | null;
  email: string | null;
}

declare global {
  interface Window {
    Kakao?: {
      isInitialized: () => boolean;
      init: (key: string) => void;
      Auth: {
        login: (opts: { scope: string; success: (auth: { access_token: string }) => void; fail?: (err: unknown) => void }) => void;
      };
      API: {
        request: (opts: { url: string; success: (res: unknown) => void; fail?: (err: unknown) => void }) => void;
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
    bizNo: "", bizName: "", ownerName: "",
    password: "", passwordConfirm: "",
    notifyEmail: "", notifyPhone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [bizAutoFilled, setBizAutoFilled] = useState(false);
  const [kakaoVerified, setKakaoVerified] = useState<KakaoVerified | null>(null);
  const [kakaoLoading, setKakaoLoading] = useState(false);
  const [showOptional, setShowOptional] = useState(false);

  // 카카오 SDK 로드
  useEffect(() => {
    const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    if (!KAKAO_KEY) return;
    if (document.querySelector('script[src*="kakao.min.js"]')) {
      if (window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(KAKAO_KEY);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";
    script.integrity = "sha384-DKYJZ8NLiK8MN4/C5P2dtSmLQ4KwPaoqAfyA/DfmEc1VDxu4yyC7wy6K1Hs90nka";
    script.crossOrigin = "anonymous";
    script.onload = () => {
      if (window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(KAKAO_KEY);
    };
    document.head.appendChild(script);
  }, []);

  async function handleKakaoVerify() {
    if (!window.Kakao || !window.Kakao.isInitialized()) {
      setError("카카오 SDK 초기화 실패. 새로고침 후 다시 시도해주세요.");
      return;
    }
    setKakaoLoading(true);
    setError(null);
    window.Kakao.Auth.login({
      scope: "profile_nickname,account_email,name,phone_number,birthday",
      success: () => {
        window.Kakao!.API.request({
          url: "/v2/user/me",
          success: async (res) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = res as any;
            const account = data?.kakao_account ?? {};
            const verified: KakaoVerified = {
              kakaoId: String(data.id),
              name: account.name ?? account.profile?.nickname ?? "",
              phone: account.phone_number ?? null,
              birthday: account.birthday ?? null,
              email: account.email ?? null,
            };
            if (!verified.name) {
              setError("카카오에서 이름을 받아오지 못했습니다. 카카오 계정 본인인증을 먼저 완료해주세요.");
              setKakaoLoading(false);
              return;
            }
            setKakaoVerified(verified);
            // 자동으로 알림 정보 채움
            setForm(prev => ({
              ...prev,
              notifyEmail: prev.notifyEmail || verified.email || "",
              notifyPhone: prev.notifyPhone || (verified.phone ? verified.phone.replace(/^\+82 /, "0") : ""),
            }));
            setKakaoLoading(false);
          },
          fail: () => {
            setError("카카오 사용자 정보 조회 실패");
            setKakaoLoading(false);
          },
        });
      },
      fail: () => {
        setError("카카오 로그인이 취소되었습니다.");
        setKakaoLoading(false);
      },
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
    if (form.password.length < 8) { setError("비밀번호는 8자 이상이어야 합니다."); return; }
    if (form.password !== form.passwordConfirm) { setError("비밀번호가 일치하지 않습니다."); return; }
    if (!kakaoVerified) { setError("카카오 본인인증을 먼저 완료해주세요."); return; }

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

    // G2B 업체정보 자동 조회 (실패해도 수동 입력 유지)
    let g2bCeoName: string | null = null;
    try {
      const g2bRes = await fetch(`/api/auth/lookup-biz?bizNo=${form.bizNo}`);
      const g2b = await g2bRes.json() as { ok: boolean; bizName?: string; ceoName?: string };
      if (g2b.ok && g2b.bizName) {
        g2bCeoName = g2b.ceoName ?? null;
        setForm(prev => ({
          ...prev,
          bizName:   g2b.bizName ?? prev.bizName,
          ownerName: g2b.ceoName ?? prev.ownerName,
        }));
        setBizAutoFilled(true);
      }
    } catch {
      console.error("G2B 업체정보 조회 실패 — 수동 입력");
    }

    setVerifying(false);

    // 카카오 이름 vs 대표자명 매칭 (한국 이름 공백·특수문자 정규화)
    const norm = (s: string) => (s || "").replace(/\s+/g, "").replace(/[()-]/g, "");
    const ceoName = g2bCeoName ?? form.ownerName;
    const kakaoName = kakaoVerified.name;
    if (ceoName && norm(kakaoName) !== norm(ceoName)) {
      setError(`본인인증 실패: 카카오 명의(${kakaoName})와 사업자 대표자명(${ceoName})이 일치하지 않습니다. 대표자 본인만 가입 가능합니다.`);
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
      await fetch("/api/auth/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bizNo: form.bizNo, bizName: form.bizName, ownerName: form.ownerName,
          notifyEmail: form.notifyEmail || null, notifyPhone: form.notifyPhone || null,
          kakaoId: kakaoVerified.kakaoId,
          kakaoVerifiedName: kakaoVerified.name,
          kakaoVerifiedPhone: kakaoVerified.phone,
          kakaoVerifiedBirth: kakaoVerified.birthday,
        }),
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
            카카오 인증 + 사업자번호만 있으면 끝
          </div>
        </div>

        <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* 1단계: 카카오 본인인증 */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ background: "#1B3A6B", color: "#fff", width: 20, height: 20, borderRadius: 10, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>1</span>
              <label style={{ ...LabelStyle, margin: 0 }}>본인인증</label>
            </div>
            {kakaoVerified ? (
              <div style={{
                background: "#ECFDF5", border: "1.5px solid #A7F3D0",
                borderRadius: 10, padding: "14px 16px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 12, color: "#059669", fontWeight: 700, marginBottom: 3 }}>
                    ✓ 인증 완료
                  </div>
                  <div style={{ fontSize: 14, color: "#0F172A", fontWeight: 700 }}>{kakaoVerified.name}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setKakaoVerified(null)}
                  style={{ fontSize: 11, color: "#64748B", background: "none", border: "1px solid #E2E8F0", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}
                >다시 인증</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleKakaoVerify}
                disabled={kakaoLoading || loading}
                style={{
                  width: "100%", height: 50,
                  background: kakaoLoading ? "#F9DD4A" : "#FEE500",
                  color: "#191600", border: "none", borderRadius: 10,
                  fontSize: 14, fontWeight: 700,
                  cursor: kakaoLoading ? "wait" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                }}
              >
                <span style={{ fontSize: 16 }}>💬</span>
                {kakaoLoading ? "인증 중..." : "카카오로 시작하기"}
              </button>
            )}
          </div>

          {/* 2단계: 사업자번호 */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{
                background: kakaoVerified ? "#1B3A6B" : "#CBD5E1",
                color: "#fff", width: 20, height: 20, borderRadius: 10,
                display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700,
              }}>2</span>
              <label style={{ ...LabelStyle, margin: 0 }}>사업자번호</label>
            </div>
            <BizNoInput value={form.bizNo} onChange={set("bizNo")} disabled={loading || !kakaoVerified} />
            {bizAutoFilled && (
              <div style={{
                marginTop: 8, padding: "10px 12px",
                background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8,
                fontSize: 12, color: "#1E40AF", lineHeight: 1.6,
              }}>
                <strong>{form.bizName}</strong> · 대표자 {form.ownerName}
                <div style={{ fontSize: 10.5, color: "#60A5FA", marginTop: 2 }}>나라장터 자동 조회됨</div>
              </div>
            )}
          </div>

          {/* 3단계: 비밀번호 */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{
                background: kakaoVerified ? "#1B3A6B" : "#CBD5E1",
                color: "#fff", width: 20, height: 20, borderRadius: 10,
                display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700,
              }}>3</span>
              <label style={{ ...LabelStyle, margin: 0 }}>비밀번호</label>
            </div>
            <input type="password" required minLength={8} value={form.password} disabled={loading || !kakaoVerified}
              onChange={setE("password")} placeholder="8자 이상" className="naktal-input"
              style={{ marginBottom: 8 }}
            />
            <input type="password" required value={form.passwordConfirm} disabled={loading || !kakaoVerified}
              onChange={setE("passwordConfirm")} placeholder="비밀번호 재입력" className="naktal-input" />
          </div>

          {/* 추가 정보 (선택, 토글) */}
          <div>
            <button
              type="button"
              onClick={() => setShowOptional(!showOptional)}
              style={{
                width: "100%", padding: "10px 14px",
                background: "transparent", border: "1px dashed #CBD5E1", borderRadius: 8,
                fontSize: 12, color: "#64748B", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}
            >
              <span>알림 이메일·전화번호 (선택)</span>
              <span style={{ transform: showOptional ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>▼</span>
            </button>
            {showOptional && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10, padding: "12px 14px", background: "#F8FAFC", borderRadius: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: "#64748B", display: "block", marginBottom: 4 }}>알림 이메일</label>
                  <input type="email" value={form.notifyEmail} disabled={loading}
                    onChange={setE("notifyEmail")} placeholder="notify@company.com" className="naktal-input" />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#64748B", display: "block", marginBottom: 4 }}>알림 전화번호</label>
                  <input type="tel" value={form.notifyPhone} disabled={loading}
                    onChange={setE("notifyPhone")} placeholder="010-0000-0000" className="naktal-input" />
                </div>
                <div style={{ fontSize: 10.5, color: "#94A3B8", lineHeight: 1.5 }}>
                  공고 알림·낙찰 결과 안내를 받으실 연락처입니다. 마케팅 발송 안 함.
                </div>
              </div>
            )}
          </div>

          {error && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#DC2626" }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || !kakaoVerified} className="naktal-btn-primary" style={{ marginTop: 4 }}>
            {verifying ? "사업자 검증 중..." : loading ? "가입 중..." : "회원가입 완료"}
          </button>

          {!kakaoVerified && (
            <div style={{ fontSize: 11, color: "#94A3B8", textAlign: "center", marginTop: -4 }}>
              먼저 카카오로 본인인증을 완료해주세요
            </div>
          )}
        </form>

        <p style={{ textAlign: "center", fontSize: 13, color: "#64748B", marginTop: 16 }}>
          이미 계정이 있으신가요?{" "}
          <Link href="/login" style={{ color: "#1B3A6B", fontWeight: 600 }}>로그인</Link>
        </p>
      </div>
    </div>
  );
}
