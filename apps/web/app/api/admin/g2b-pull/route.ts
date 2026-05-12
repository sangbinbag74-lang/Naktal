/**
 * 어드민 동기화 버튼 전용 — G2B에서 최근 2일치 공고 + 낙찰 결과 즉시 수집
 * sync-g2b?mode=recent 를 내부에서 호출 (ADMIN_SECRET_KEY 자동 부여)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const adminKey = process.env.ADMIN_SECRET_KEY ?? process.env.CRON_SECRET;
  if (!adminKey) {
    return NextResponse.json({ ok: false, error: "ADMIN_SECRET_KEY 미설정" }, { status: 500 });
  }

  // self-fetch sync-g2b
  const origin = request.nextUrl.origin;
  try {
    const t0 = Date.now();
    const res = await fetch(`${origin}/api/cron/sync-g2b?mode=recent`, {
      headers: { Authorization: `Bearer ${adminKey}` },
      signal: AbortSignal.timeout(280_000),
    });
    const elapsedMs = Date.now() - t0;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `sync-g2b HTTP ${res.status}`, detail: text.slice(0, 500), elapsedMs },
        { status: 502 }
      );
    }
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    return NextResponse.json({ ok: true, elapsedMs, syncResult: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
