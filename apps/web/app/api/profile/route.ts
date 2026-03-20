import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function getDbUserId(supabaseId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("User").select("id").eq("supabaseId", supabaseId).single();
  return data?.id ?? null;
}

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getDbUserId(user.id);
  if (!userId) return NextResponse.json({});

  const admin = createAdminClient();
  const { data } = await admin.from("CompanyProfile").select("*").eq("userId", userId).maybeSingle();
  return NextResponse.json(data ?? {});
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getDbUserId(user.id);
  if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const body = await req.json();

  const admin = createAdminClient();
  const { error } = await admin.from("CompanyProfile").upsert(
    { ...body, userId },
    { onConflict: "userId" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
