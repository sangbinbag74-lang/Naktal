import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const plan = searchParams.get("plan") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = 50;
  const offset = (page - 1) * limit;

  let query = supabase
    .from("User")
    .select("id,bizNo,bizName,ownerName,plan,isAdmin,isActive,createdAt,adminMemo", { count: "exact" })
    .order("createdAt", { ascending: false })
    .range(offset, offset + limit - 1);

  if (q) {
    query = query.or(`bizNo.ilike.%${q}%,bizName.ilike.%${q}%`);
  }
  if (plan) {
    query = query.eq("plan", plan);
  }

  const { data, count } = await query;

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    page,
    limit,
    hasMore: (count ?? 0) > page * limit,
  });
}
