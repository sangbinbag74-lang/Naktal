"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { Feature, canAccess } from "@/lib/plan-guard";
import type { Plan } from "@naktal/types";

interface PlanData { plan: string; grandfathered?: boolean }

export default function RealtimePage() {
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("User")
        .select("plan,grandfathered")
        .eq("supabaseId", user.id)
        .single();
      setPlanData(data);
      setLoading(false);
    });
  }, []);

  // 5티어 (2026-07-09): PRO·BIZ·MASTER + 영구PRO(grandfathered) 허용
  const effPlan = planData?.grandfathered ? "PRO" : planData?.plan;
  // 권한 판정의 단일 소스 = plan-guard. 전면 무료 개방 중에는 FREE 도 통과한다.
  const isPro = canAccess((effPlan ?? "FREE") as Plan, Feature.REALTIME_MONITOR);

  if (loading) return <div style={{ padding: 40, color: "#94A3B8" }}>로딩 중...</div>;

  if (!isPro) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: 0 }}>실시간 모니터</h2>
            <span style={{ fontSize: 11, fontWeight: 700, background: "#F0F9FF", color: "#0369A1", padding: "3px 8px", borderRadius: 5 }}>CORE 2</span>
            <span style={{ fontSize: 10, fontWeight: 700, background: "#059669", color: "#fff", padding: "2px 6px", borderRadius: 4 }}>PRO 전용</span>
          </div>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>공고별 참여업체 수를 개찰 즉시 자동 집계하고, 참여자 수 기반 경쟁 강도를 모니터링합니다.</p>
        </div>

        {/* 블러 미리보기 */}
        <div style={{ position: "relative", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ filter: "blur(4px)", pointerEvents: "none", background: "#fff", border: "1px solid #E8ECF2", borderRadius: 14, padding: "24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
              {[["모니터링 공고", "12건"], ["현재 참여자", "평균 8.3개사"], ["마감 임박", "3건 D-1"]].map(([label, val]) => (
                <div key={label} style={{ background: "#F8FAFC", borderRadius: 10, padding: "14px" }}>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{ height: 200, background: "#F8FAFC", borderRadius: 10 }} />
          </div>
          {/* 잠금 오버레이 */}
          <div style={{ position: "absolute", inset: 0, background: "rgba(15,30,60,0.7)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, borderRadius: 14 }}>
            <span style={{ fontSize: 40 }}>🔒</span>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Pro 플랜 전용 기능</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 20 }}>실시간 참여자 수 예측으로 번호 전략을 최적화하세요</div>
              <Link href="/pricing" style={{ background: "#60A5FA", color: "#fff", borderRadius: 10, padding: "12px 28px", fontSize: 14, fontWeight: 700, textDecoration: "none", display: "inline-block" }}>Pro 시작하기 →</Link>
            </div>
          </div>
        </div>

        {/* 기능 설명 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[
            { icon: "📡", title: "개찰 즉시 참여자 집계", desc: "개찰 결과 공개 즉시 참여업체 수를 자동 수집 (매시 갱신)" },
            { icon: "📊", title: "경쟁 강도 분석", desc: "참여자 수 이력으로 발주처·공종별 경쟁 강도 파악" },
            { icon: "⚡", title: "실시간 반영", desc: "새 집계가 저장되는 순간 화면에 실시간 반영" },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px" }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <RealtimeMonitor />;
}

interface ParticipantSnapshot {
  snapshotAt: string;
  count: number;
}
interface ParticipantData {
  title?: string;
  deadline?: string;
  opened?: boolean;
  currentCount?: number | null;
  snapshotChannel?: string | null;
  snapshots?: ParticipantSnapshot[];
  error?: string;
}

function RealtimeMonitor() {
  const [annId, setAnnId] = useState("");
  const [data, setData] = useState<ParticipantData | null>(null);
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [fetching, setFetching] = useState(false);

  const load = async () => {
    if (!annId.trim()) return;
    setFetching(true);
    const res = await fetch("/api/realtime/participants?annId=" + encodeURIComponent(annId.trim()));
    const json = await res.json();
    setData(json);
    setLiveCount(json.currentCount ?? null);
    setFetching(false);

    // Supabase Realtime 구독
    if (json.snapshotChannel) {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      supabase
        .channel(json.snapshotChannel)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "ParticipantSnapshot", filter: "annId=eq." + json.annId },
          (payload) => {
            if (payload.new && typeof payload.new.count === "number") {
              setLiveCount(payload.new.count);
            }
          },
        )
        .subscribe();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: 0 }}>실시간 모니터</h2>
          <span style={{ fontSize: 11, fontWeight: 700, background: "#F0F9FF", color: "#0369A1", padding: "3px 8px", borderRadius: 5 }}>CORE 2</span>
          <span style={{ fontSize: 10, fontWeight: 700, background: "#059669", color: "#fff", padding: "2px 6px", borderRadius: 4 }}>PRO</span>
        </div>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>공고번호를 입력하면 참여자 수 이력과 실시간 변화를 확인할 수 있습니다.</p>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <input
          value={annId}
          onChange={(e) => setAnnId(e.target.value)}
          placeholder="공고번호 입력 (예: 20250312345)"
          style={{ flex: 1, height: 48, padding: "0 14px", border: "1.5px solid #E8ECF2", borderRadius: 10, fontSize: 14, outline: "none" }}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <button
          onClick={load}
          disabled={fetching}
          style={{ height: 48, padding: "0 24px", background: "#1B3A6B", color: "#fff", borderRadius: 12, border: "none", fontWeight: 700, cursor: fetching ? "wait" : "pointer" }}
        >
          {fetching ? "조회중..." : "조회"}
        </button>
      </div>

      {data?.error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "14px 18px", fontSize: 13, color: "#991B1B" }}>
          {data.error}
        </div>
      )}

      {data && !data.error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>{data.title}</div>
            <div style={{ display: "flex", gap: 24 }}>
              <div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>참여업체 수</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: "#1B3A6B" }}>
                  {liveCount !== null ? liveCount + "개사" : (data.opened === false ? "개찰 전" : "집계 중")}
                </div>
                {liveCount !== null
                  ? <div style={{ fontSize: 11, color: "#60A5FA" }}>● 실시간 업데이트</div>
                  : data.opened === false
                    ? <div style={{ fontSize: 11, color: "#9CA3AF" }}>나라장터는 마감 전 참여자 수를 공개하지 않습니다 · 개찰 즉시 자동 집계</div>
                    : <div style={{ fontSize: 11, color: "#9CA3AF" }}>개찰 결과 공개 대기 중 · 매시 자동 재시도</div>}
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>마감일</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>
                  {data.deadline ? new Date(data.deadline).toLocaleDateString("ko-KR") : "-"}
                </div>
              </div>
            </div>
          </div>

          {data.snapshots && data.snapshots.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#374151" }}>참여자 수 이력</div>
              {data.snapshots.map((s, i: number) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F1F5F9", fontSize: 13 }}>
                  <span style={{ color: "#6B7280" }}>{new Date(s.snapshotAt).toLocaleString("ko-KR")}</span>
                  <span style={{ fontWeight: 600, color: "#1B3A6B" }}>{s.count}개사</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
