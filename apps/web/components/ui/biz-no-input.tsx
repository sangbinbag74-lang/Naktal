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

  const borderClass = isComplete
    ? "border-green-500 focus:ring-green-500"
    : hasError
    ? "border-red-500 focus:ring-red-500"
    : "border-gray-300 focus:ring-[#1E3A5F]";

  return (
    <div className="space-y-1">
      <input
        type="text"
        inputMode="numeric"
        value={formatBizNo(digits)}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={12} // 000-00-00000
        className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 transition-colors disabled:bg-gray-50 disabled:text-gray-400 ${borderClass}`}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
