import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: {
    bizNo: string;
    bizName: string;
    ownerName: string;
    notifyEmail?: string | null;
    notifyPhone?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Supabase service role로 User 테이블 upsert
  const { error } = await supabase.from("User").upsert(
    {
      supabaseId:  user.id,
      bizNo:       body.bizNo,
      bizName:     body.bizName,
      ownerName:   body.ownerName,
      notifyEmail: body.notifyEmail ?? null,
      notifyPhone: body.notifyPhone ?? null,
    },
    { onConflict: "supabaseId" }
  );

  if (error) {
    console.error("[create-user]", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
