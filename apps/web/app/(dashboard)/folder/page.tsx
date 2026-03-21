"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { isMultiplePriceBid } from "@/lib/bid-utils";

interface Announcement {
  id: string;
  konepsId: string;
  title: string;
  orgName: string;
  budget: string;
  deadline: string;
  category: string;
  region: string;
  rawJson?: Record<string, string> | null;
}

const FOLDER_KEY = "naktal_folder";

export function getFolderIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(FOLDER_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function toggleFolder(id: string): boolean {
  const ids = getFolderIds();
  const exists = ids.includes(id);
  const next = exists ? ids.filter((x) => x !== id) : [...ids, id];
  localStorage.setItem(FOLDER_KEY, JSON.stringify(next));
  return !exists;
}

function getDDay(deadline: string) {
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (diff <= 0) return { label: "마감", bg: "#F1F5F9", color: "#475569" };
  if (diff <= 2) return { label: `D-${diff}`, bg: "#FEF2F2", color: "#DC2626" };
  if (diff <= 5) return { label: `D-${diff}`, bg: "#FFF7ED", color: "#C2410C" };
  if (diff <= 10) return { label: `D-${diff}`, bg: "#EFF6FF", color: "#1E40AF" };
  return { label: `D-${diff}`, bg: "#F8FAFC", color: "#475569" };
}

function formatBudget(budget: string): string {
  const num = parseInt(budget, 10);
  if (isNaN(num)) return budget;
  if (num >= 100000000) return `${(num / 100000000).toFixed(1)}억원`;
  if (num >= 10000) return `${(num / 10000).toFixed(0)}만원`;
  return new Intl.NumberFormat("ko-KR").format(num) + "원";
}

export default function FolderPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    const savedIds = getFolderIds();
    setIds(savedIds);
    if (savedIds.length === 0) {
      setLoading(false);
      return;
    }
    fetch(`/api/folder?ids=${savedIds.join(",")}`)
      .then((r) => r.json())
      .then((d: { data: Announcement[] }) => setItems(d.data ?? []))
      .catch(() => console.error("서류함 불러오기 실패"))
      .finally(() => setLoading(false));
  }, []);

  function handleRemove(id: string) {
    toggleFolder(id);
    setIds((prev) => prev.filter((x) => x !== id));
    setItems((prev) => prev.filter((a) => a.id !== id));
  }

  function handleClearAll() {
    localStorage.setItem(FOLDER_KEY, "[]");
    setIds([]);
    setItems([]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>서류함</h2>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
            저장한 공고 {ids.length}건 · 번호 분석 가능 {items.filter((a) => isMultiplePriceBid(a.rawJson)).length}건
          </p>
        </div>
        {ids.length > 0 && (
          <button
            onClick={handleClearAll}
            style={{
              height: 36, padding: "0 14px",
              background: "#FEF2F2", color: "#DC2626",
              border: "none", borderRadius: 8,
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}
          >
            전체 삭제
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
          불러오는 중...
        </div>
      ) : ids.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2",
          padding: "56px 24px", textAlign: "center",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
            저장된 공고가 없습니다
          </div>
          <div style={{ fontSize: 13, color: "#94A3B8", marginBottom: 20 }}>
            공고 목록에서 관심 공고의 ★ 버튼을 눌러 저장하세요.
          </div>
          <Link
            href="/announcements"
            style={{
              display: "inline-block",
              height: 42, lineHeight: "42px",
              padding: "0 20px",
              background: "#1B3A6B", color: "#fff",
              borderRadius: 10, fontSize: 14, fontWeight: 600,
              textDecoration: "none",
            }}
          >
            공고 목록 보기 →
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((ann) => {
            const dday = getDDay(ann.deadline);
            return (
              <div key={ann.id} style={{
                background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", overflow: "hidden",
              }}>
                <div style={{ padding: "14px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                      {ann.category && (
                        <span style={{ fontSize: 10, fontWeight: 600, background: "#EEF2FF", color: "#1B3A6B", padding: "2px 6px", borderRadius: 4 }}>
                          {ann.category}
                        </span>
                      )}
                      {ann.region && (
                        <span style={{ fontSize: 10, fontWeight: 600, background: "#F8FAFC", color: "#64748B", padding: "2px 6px", borderRadius: 4 }}>
                          {ann.region}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ann.title}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>
                      {ann.orgName} · {ann.konepsId}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 2 }}>기초금액</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#1B3A6B" }}>
                      {formatBudget(ann.budget)}
                    </div>
                    <div style={{
                      display: "inline-block", marginTop: 4,
                      fontSize: 11, fontWeight: 600,
                      background: dday.bg, color: dday.color,
                      padding: "2px 7px", borderRadius: 4,
                    }}>
                      {dday.label}
                    </div>
                  </div>
                </div>

                <div style={{
                  padding: "9px 16px",
                  background: "#F8FAFC",
                  borderTop: "1px solid #F1F5F9",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    {isMultiplePriceBid(ann.rawJson) ? (
                      <Link
                        href={`/announcements/${ann.id}#number-analysis`}
                        style={{ fontSize: 11, fontWeight: 600, color: "#1B3A6B", background: "#EEF2FF", padding: "4px 8px", borderRadius: 6, textDecoration: "none" }}
                      >
                        🎯 번호 분석
                      </Link>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", background: "#F1F5F9", padding: "4px 8px", borderRadius: 6 }}>
                        번호분석 미지원
                      </span>
                    )}
                    <a
                      href={`/qualification?annId=${ann.id}`}
                      style={{ fontSize: 11, fontWeight: 600, color: "#166534", background: "#F0FDF4", padding: "4px 8px", borderRadius: 6, textDecoration: "none" }}
                    >
                      ✅ 적격심사
                    </a>
                  </div>
                  <button
                    onClick={() => handleRemove(ann.id)}
                    style={{
                      height: 28, padding: "0 10px",
                      background: "#FEF2F2", color: "#DC2626",
                      border: "none", borderRadius: 6,
                      fontSize: 11, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    ★ 삭제
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
