"use client";

interface CsvDownloadProps {
  data: Record<string, unknown>[];
  filename: string;
  label?: string;
}

function toCsv(data: Record<string, unknown>[]): string {
  if (data.length === 0) return "";
  const first = data[0];
  if (!first) return "";
  const headers = Object.keys(first);
  const rows = data.map((row) =>
    headers
      .map((h) => {
        const val = String(row[h] ?? "");
        return val.includes(",") || val.includes('"') || val.includes("\n")
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      })
      .join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

export function CsvDownload({ data, filename, label = "CSV 다운로드" }: CsvDownloadProps) {
  function handleDownload() {
    const csv = toCsv(data);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleDownload}
      disabled={data.length === 0}
      className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors disabled:opacity-40"
    >
      ↓ {label}
    </button>
  );
}
