import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const category   = searchParams.get("category") ?? "";
  const region     = searchParams.get("region") ?? "";
  const minBudget  = searchParams.get("minBudget");
  const maxBudget  = searchParams.get("maxBudget");
  const sort       = searchParams.get("sort") ?? "latest"; // latest | deadline
  const keyword    = searchParams.get("keyword") ?? "";
  const page       = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit      = Math.min(50, parseInt(searchParams.get("limit") ?? "20", 10));
  const offset     = (page - 1) * limit;

  const supabase = await createClient();

  let query = supabase
    .from("Announcement")
    .select("*", { count: "exact" });

  if (category) query = query.eq("category", category);
  if (region)   query = query.eq("region", region);
  if (keyword)  query = query.or(`title.ilike.%${keyword}%,orgName.ilike.%${keyword}%`);
  if (minBudget) query = query.gte("budget", minBudget);
  if (maxBudget) query = query.lte("budget", maxBudget);

  if (sort === "deadline") {
    query = query.order("deadline", { ascending: true });
  } else {
    query = query.order("createdAt", { ascending: false });
  }

  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error("[GET /api/announcements]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    hasMore: offset + limit < (count ?? 0),
    page,
    limit,
  });
}
