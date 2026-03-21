import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(): Promise<NextResponse> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("Announcement")
    .select("id,title,orgName,budget,deadline,rawJson")
    .filter("rawJson->>bidMthdNm", "ilike", "%복수예가%")
    .gte("deadline", new Date().toISOString())
    .order("deadline", { ascending: true })
    .limit(3);

  return NextResponse.json({ data: data ?? [] });
}
