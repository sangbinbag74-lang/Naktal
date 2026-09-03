import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { Feature, getLimit } from "@/lib/plan-guard";
import type { Plan } from "@naktal/types";

// GET /api/alerts — 현재 유저의 알림 목록
export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: [] }, { status: 401 });

  const { data: dbUser } = await supabase.from("User").select("id").eq("supabaseId", user.id).single();
  if (!dbUser) return NextResponse.json({ data: [] });

  const { data, error } = await supabase
    .from("UserAlert")
    .select("*")
    .eq("userId", (dbUser as { id: string }).id)
    .eq("active", true)
    .order("createdAt", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/alerts — 알림 생성
export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: dbUser } = await supabase.from("User").select("id, plan, grandfathered").eq("supabaseId", user.id).single();
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const typedUser = dbUser as { id: string; plan: string; grandfathered?: boolean };

  // 알림 한도의 단일 소스 = plan-guard (전면 무료 개방 시 FREE 도 무제한)
  const effectivePlan = (typedUser.grandfathered ? "PRO" : typedUser.plan) as Plan;
  const alertLimit = getLimit(effectivePlan, Feature.ALERTS);
  if (alertLimit !== Infinity) {
    const { count } = await supabase.from("UserAlert").select("*", { count: "exact" }).eq("userId", typedUser.id).eq("active", true);
    if ((count ?? 0) >= alertLimit) {
      return NextResponse.json(
        { error: `현재 플랜은 알림을 ${alertLimit}개까지 설정할 수 있습니다. 더 필요하시면 요금제를 업그레이드해주세요.`, upgradeUrl: "/billing" },
        { status: 403 },
      );
    }
  }

  const body = await request.json() as {
    keywords?: string[];
    categories?: string[];
    regions?: string[];
    minBudget?: string | null;
    maxBudget?: string | null;
  };

  const { data, error } = await supabase.from("UserAlert").insert({
    id:         randomUUID(),
    userId:     typedUser.id,
    keywords:   body.keywords ?? [],
    categories: body.categories ?? [],
    regions:    body.regions ?? [],
    minBudget:  body.minBudget ? body.minBudget : null,
    maxBudget:  body.maxBudget ? body.maxBudget : null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/alerts?id=xxx — 알림 삭제
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("UserAlert").update({ active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
