import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, writeAdminLog } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = 50;
  const showDeleted = searchParams.get("deleted") === "true";

  let query = supabase
    .from("Announcement")
    .select("id,konepsId,title,orgName,budget,deadline,category,region,isPinned,deletedAt,createdAt", { count: "exact" })
    .order("createdAt", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (!showDeleted) {
    query = query.is("deletedAt", null);
  }
  if (q) {
    query = query.or(`title.ilike.%${q}%,orgName.ilike.%${q}%,konepsId.ilike.%${q}%`);
  }

  const { data, count } = await query;
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const supabase = createAdminClient();
  const body = (await request.json()) as {
    id: string;
    action: "delete" | "restore" | "pin" | "unpin";
    reason?: string;
  };

  let updates: Record<string, unknown> = {};
  if (body.action === "delete") updates = { deletedAt: new Date().toISOString() };
  else if (body.action === "restore") updates = { deletedAt: null };
  else if (body.action === "pin") updates = { isPinned: true };
  else if (body.action === "unpin") updates = { isPinned: false };
  else return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  await supabase.from("Announcement").update(updates).eq("id", body.id);

  await writeAdminLog({
    adminId: "partner",
    action: `ANNOUNCEMENT_${body.action.toUpperCase()}`,
    targetId: body.id,
    after: updates,
    reason: body.reason,
  });

  return NextResponse.json({ ok: true });
}
