"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BetaActionButtons({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleAction(action: "approve" | "reject") {
    if (!confirm(action === "approve" ? "승인하시겠습니까?" : "거절하시겠습니까?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/beta/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert("처리 실패: " + (err.error ?? res.statusText));
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 6 }}>
      <button
        onClick={() => handleAction("approve")}
        disabled={loading}
        style={{
          fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6,
          background: "#059669", color: "#fff", border: "none", cursor: "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        승인
      </button>
      <button
        onClick={() => handleAction("reject")}
        disabled={loading}
        style={{
          fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6,
          background: "#F1F5F9", color: "#6B7280", border: "1px solid #E2E8F0", cursor: "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        거절
      </button>
    </div>
  );
}
