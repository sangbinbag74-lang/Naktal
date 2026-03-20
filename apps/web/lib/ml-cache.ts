/**
 * ML 예측 결과 24시간 캐시 (Supabase Prediction 테이블)
 */
import { createClient } from "@/lib/supabase/server";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간

/** 입력 파라미터로 캐시 키 생성 */
export function buildCacheKey(type: string, params: Record<string, unknown>): string {
  const sorted = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("&");
  return `${type}:${sorted}`;
}

export async function getCached(cacheKey: string): Promise<unknown | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("Prediction")
    .select("result,expiresAt")
    .eq("cacheKey", cacheKey)
    .single();

  if (!data) return null;
  const row = data as { result: unknown; expiresAt: string };
  if (new Date(row.expiresAt) < new Date()) return null; // 만료
  return row.result;
}

export async function setCached(
  type: string,
  cacheKey: string,
  result: unknown
): Promise<void> {
  const supabase = await createClient();
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();

  await supabase.from("Prediction").upsert(
    { type, cacheKey, result, expiresAt },
    { onConflict: "cacheKey" }
  );
}
