import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Feature, getLimit } from "@/lib/plan-guard";
import type { Plan } from "@naktal/types";

export const dynamic = "force-dynamic";

// 경쟁사 추적 (전 티어, 개수 차등 — 2026-07-09)

async function getDbUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: dbUser } = await admin.from("User").select("id,plan,grandfathered").eq("supabaseId", user.id).single();
  if (!dbUser) return null;
  const plan = (dbUser.grandfathered ? "PRO" : dbUser.plan) as Plan;
  return { admin, id: dbUser.id as string, plan };
}

// GET — 내 추적 목록 + 한도
export async function GET(): Promise<NextResponse> {
  const u = await getDbUser();
  if (!u) return NextResponse.json({ data: [], limit: 0 }, { status: 401 });

  const { data } = await u.admin
    .from("CompetitorWatch")
    .select("id,competitorName,createdAt")
    .eq("userId", u.id)
    .order("createdAt", { ascending: false });
  const limit = getLimit(u.plan, Feature.COMPETITOR_TRACKING);
  return NextResponse.json({ data: data ?? [], limit: limit === Infinity ? null : limit });
}

// POST — 경쟁사 등록
export async function POST(request: NextRequest): Promise<NextResponse> {
  const u = await getDbUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? "").trim();
  if (name.length < 2) return NextResponse.json({ error: "경쟁사 상호명을 2자 이상 입력해주세요." }, { status: 400 });

  const limit = getLimit(u.plan, Feature.COMPETITOR_TRACKING);
  const { count } = await u.admin.from("CompetitorWatch").select("id", { count: "exact", head: true }).eq("userId", u.id);
  if ((count ?? 0) >= limit) {
    return NextResponse.json(
      { error: `현재 플랜은 경쟁사를 ${limit}개사까지 추적할 수 있습니다. 더 필요하시면 요금제를 업그레이드해주세요.`, upgradeUrl: "/billing" },
      { status: 403 },
    );
  }

  const { data, error } = await u.admin
    .from("CompetitorWatch")
    .insert({ id: randomUUID(), userId: u.id, competitorName: name })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "이미 추적 중인 경쟁사입니다." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

// DELETE ?id=xxx
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const u = await getDbUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });

  await u.admin.from("CompetitorWatch").delete().eq("id", id).eq("userId", u.id);
  return NextResponse.json({ ok: true });
}
