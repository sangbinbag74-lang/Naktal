export function isMultiplePriceBid(rawJson: Record<string, string> | null | undefined): boolean {
  if (!rawJson) return false;
  // KONEPS API가 복수예가를 어느 필드에 담는지 서비스별로 다를 수 있으므로
  // rawJson 전체 값을 스캔하여 "복수예가" 포함 여부 판단
  return Object.values(rawJson).some(
    (v) => typeof v === "string" && v.includes("복수예가"),
  );
}

export function getBudgetRange(budget: number): string {
  if (budget < 20_000_000)    return "소액";
  if (budget < 100_000_000)   return "2천~1억";
  if (budget < 500_000_000)   return "1억~5억";
  if (budget < 3_000_000_000) return "5억~30억";
  return "30억이상";
}
