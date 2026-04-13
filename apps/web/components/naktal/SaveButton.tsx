"use client";

import { useState, useEffect } from "react";

const FOLDER_KEY = "naktal_folder";

function getFolderIds(): string[] {
  try { return JSON.parse(localStorage.getItem(FOLDER_KEY) ?? "[]") as string[]; } catch { return []; }
}

function toggleFolder(id: string): boolean {
  const ids = getFolderIds();
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  localStorage.setItem(FOLDER_KEY, JSON.stringify(next));
  return next.includes(id);
}

export function SaveButton({ annId }: { annId: string }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(getFolderIds().includes(annId));
  }, [annId]);

  const handleClick = () => {
    const isSaved = toggleFolder(annId);
    setSaved(isSaved);
  };

  return (
    <button
      onClick={handleClick}
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: saved ? "#92400E" : "#64748B",
        background: saved ? "#FEF3C7" : "#F8FAFC",
        border: `1px solid ${saved ? "#FDE68A" : "#E2E8F0"}`,
        borderRadius: 8,
        padding: "6px 12px",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {saved ? "★ 저장됨" : "☆ 저장"}
    </button>
  );
}
