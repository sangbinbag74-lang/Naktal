"use client";

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}

export function FilterChip({ label, active, onClick }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 28,
        padding: "0 12px",
        borderRadius: 99,
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        border: `1px solid ${active ? "#1B3A6B" : "#E2E8F0"}`,
        background: active ? "#1B3A6B" : "#fff",
        color: active ? "#fff" : "#374151",
        cursor: "pointer",
        transition: "all 0.15s ease",
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}
