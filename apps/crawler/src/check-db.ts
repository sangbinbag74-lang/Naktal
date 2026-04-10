import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  const { count: total } = await supabase.from("Announcement").select("*", { count: "exact", head: true });
  console.log("총 공고 수:", total);

  const { count: tokmok } = await supabase
    .from("Announcement").select("*", { count: "exact", head: true }).ilike("category", "%토목%");
  console.log("토목 관련:", tokmok);

  const { count: sisel } = await supabase
    .from("Announcement").select("*", { count: "exact", head: true }).ilike("category", "%시설%");
  console.log("시설 관련:", sisel);

  const { count: yeokYong } = await supabase
    .from("Announcement").select("*", { count: "exact", head: true }).ilike("category", "%용역%");
  console.log("용역 관련:", yeokYong);

  const { data: latest } = await supabase
    .from("Announcement").select("deadline, category, createdAt").order("createdAt", { ascending: false }).limit(3);
  console.log("최근 저장:", JSON.stringify(latest, null, 2));

  const { data: oldest } = await supabase
    .from("Announcement").select("deadline, category").order("deadline", { ascending: true }).limit(3);
  console.log("가장 오래된:", JSON.stringify(oldest, null, 2));
}

main().catch(console.error);
