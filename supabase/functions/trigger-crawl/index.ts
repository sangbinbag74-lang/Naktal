/**
 * Supabase Edge Function: trigger-crawl
 *
 * POST /api/admin/crawl 를 호출해 나라장터 크롤링을 시작합니다.
 * pg_cron에 의해 매일 06:00 / 12:00 / 18:00 자동 실행됩니다.
 *
 * Deploy:
 *   supabase functions deploy trigger-crawl
 *
 * Required secrets (supabase secrets set):
 *   SITE_URL      https://naktal.ai
 *   ADMIN_SECRET  your-admin-secret-key
 */

Deno.serve(async () => {
  const siteUrl = Deno.env.get("SITE_URL");
  const adminSecret = Deno.env.get("ADMIN_SECRET");

  if (!siteUrl || !adminSecret) {
    return new Response(
      JSON.stringify({ error: "SITE_URL or ADMIN_SECRET not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const res = await fetch(`${siteUrl}/api/admin/crawl`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": adminSecret,
      },
      body: JSON.stringify({ type: "all", pages: 5 }),
    });

    const body = await res.text();
    return new Response(
      JSON.stringify({ ok: res.ok, status: res.status, body }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
