"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface UserAlert {
  id: string;
  keywords: string[];
  categories: string[];
  regions: string[];
  minBudget: string | null;
  maxBudget: string | null;
  active: boolean;
}

const CATEGORIES = ["건설", "용역", "물품", "기타"];
const REGIONS = ["서울", "경기", "인천", "부산", "대구", "광주", "대전", "강원", "충남", "전북", "전남", "경북", "경남", "제주"];

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<UserAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // 새 알림 폼
  const [keywords, setKeywords] = useState("");
  const [selCategories, setSelCategories] = useState<string[]>([]);
  const [selRegions, setSelRegions] = useState<string[]>([]);
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");

  useEffect(() => {
    fetch("/api/alerts")
      .then((r) => r.json())
      .then((d: { data: UserAlert[] }) => setAlerts(d.data ?? []))
      .catch(() => console.error("알림 목록 불러오기 실패"))
      .finally(() => setLoading(false));
  }, []);

  function toggleArr(arr: string[], val: string): string[] {
    return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
          categories: selCategories,
          regions: selRegions,
          minBudget: minBudget ? minBudget : null,
          maxBudget: maxBudget ? maxBudget : null,
        }),
      });
      const data = (await res.json()) as { data?: UserAlert; error?: string };
      if (data.data) {
        setAlerts((prev) => [...prev, data.data!]);
        setShowForm(false);
        setKeywords(""); setSelCategories([]); setSelRegions([]); setMinBudget(""); setMaxBudget("");
      }
    } catch {
      console.error("알림 저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/alerts?id=${id}`, { method: "DELETE" });
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">알림 설정</h2>
          <p className="text-sm text-gray-500 mt-1">조건에 맞는 신규 공고를 이메일로 받아보세요.</p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="bg-[#1E3A5F] hover:bg-[#162d4a]"
          disabled={showForm}
        >
          + 알림 추가
        </Button>
      </div>

      {/* 알림 추가 폼 */}
      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">새 알림 조건</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">키워드 (쉼표 구분)</label>
              <input
                type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)}
                placeholder="도로포장, 하수도, 조경"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">업종</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c} type="button"
                    onClick={() => setSelCategories(toggleArr(selCategories, c))}
                    className={`px-3 py-1 rounded-full text-sm border transition-colors ${selCategories.includes(c) ? "bg-[#1E3A5F] text-white border-[#1E3A5F]" : "border-gray-300 text-gray-600 hover:border-[#1E3A5F]"}`}
                  >{c}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">지역</label>
              <div className="flex flex-wrap gap-2">
                {REGIONS.map((r) => (
                  <button
                    key={r} type="button"
                    onClick={() => setSelRegions(toggleArr(selRegions, r))}
                    className={`px-3 py-1 rounded-full text-sm border transition-colors ${selRegions.includes(r) ? "bg-[#1E3A5F] text-white border-[#1E3A5F]" : "border-gray-300 text-gray-600 hover:border-[#1E3A5F]"}`}
                  >{r}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">최소 금액 (원)</label>
                <input
                  type="number" value={minBudget} onChange={(e) => setMinBudget(e.target.value)}
                  placeholder="100000000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">최대 금액 (원)</label>
                <input
                  type="number" value={maxBudget} onChange={(e) => setMaxBudget(e.target.value)}
                  placeholder="1000000000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="bg-[#1E3A5F] hover:bg-[#162d4a]">
                {saving ? "저장 중..." : "저장"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>취소</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 알림 목록 */}
      {loading ? (
        <div className="py-10 text-center text-gray-400">불러오는 중...</div>
      ) : alerts.length === 0 ? (
        <div className="py-10 text-center text-gray-400 bg-white rounded-lg border">
          설정된 알림이 없습니다. 알림을 추가해주세요.
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <Card key={alert.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    {alert.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {alert.keywords.map((k) => (
                          <Badge key={k} variant="secondary" className="text-xs">{k}</Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {alert.categories.map((c) => (
                        <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                      ))}
                      {alert.regions.map((r) => (
                        <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
                      ))}
                    </div>
                    {(alert.minBudget || alert.maxBudget) && (
                      <p className="text-xs text-gray-500">
                        금액: {alert.minBudget ? parseInt(alert.minBudget).toLocaleString() + "원" : "제한없음"} ~{" "}
                        {alert.maxBudget ? parseInt(alert.maxBudget).toLocaleString() + "원" : "제한없음"}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(alert.id)} className="text-red-500 hover:text-red-700">
                    삭제
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
