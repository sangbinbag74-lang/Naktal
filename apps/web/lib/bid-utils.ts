export function isMultiplePriceBid(rawJson: Record<string, string> | null | undefined): boolean {
  if (!rawJson) return false;
  const method = rawJson.bidMthdNm ?? rawJson.cntrctMthdNm ?? "";
  return method.includes("복수예가");
}

export function getBudgetRange(budget: number): string {
  if (budget < 20_000_000)    return "소액";
  if (budget < 100_000_000)   return "2천~1억";
  if (budget < 500_000_000)   return "1억~5억";
  if (budget < 3_000_000_000) return "5억~30억";
  return "30억이상";
}
