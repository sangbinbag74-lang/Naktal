"use client";

import { type ChangeEvent } from "react";

interface BizNoInputProps {
  value: string;           // 원시 숫자만 (하이픈 없음, 최대 10자리)
  onChange: (raw: string) => void;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
}

/** 숫자만 추출 후 하이픈 포맷 적용: 123-45-67890 */
function formatBizNo(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export function BizNoInput({
  value,
  onChange,
  error,
  disabled,
  placeholder = "000-00-00000",
}: BizNoInputProps) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  const isComplete = digits.length === 10;
  const hasError = !!error || (digits.length > 0 && digits.length < 10);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 10);
    onChange(raw);
  }

  const borderColor = isComplete
    ? "#10B981" // 완성 (녹색)
    : hasError
    ? "#EF4444" // 오류 (빨강)
    : undefined;

  return (
    <div>
      <input
        type="text"
        inputMode="numeric"
        value={formatBizNo(digits)}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={12} // 000-00-00000
        className="naktal-input"
        style={borderColor ? { borderColor } : undefined}
      />
      {error && <p style={{ fontSize: 12, color: "#DC2626", marginTop: 4 }}>{error}</p>}
    </div>
  );
}
