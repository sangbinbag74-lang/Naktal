"use client";

import { useState } from "react";

interface BizNoInputProps {
  value: string;
  onChange: (raw: string) => void;
  disabled?: boolean;
  className?: string;
}

function formatBizNo(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export function BizNoInput({ value, onChange, disabled }: BizNoInputProps) {
  const [focused, setFocused] = useState(false);
  const isComplete = value.length === 10;

  const borderColor = isComplete ? "#059669" : focused ? "#1B3A6B" : "#E2E8F0";

  return (
    <input
      type="text"
      inputMode="numeric"
      value={formatBizNo(value)}
      onChange={(e) => {
        const raw = e.target.value.replace(/\D/g, "").slice(0, 10);
        onChange(raw);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={disabled}
      placeholder="123-45-67890"
      style={{
        height: 48,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 10,
        fontSize: 15,
        padding: "0 14px",
        outline: "none",
        width: "100%",
        background: "#fff",
        transition: "border-color 0.15s ease",
        letterSpacing: "0.05em",
        color: "#0F172A",
        fontFamily: "inherit",
      }}
    />
  );
}
