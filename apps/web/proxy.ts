import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // 비로그인 사용자가 보호된 경로 접근 시 /login redirect
  // /admin 경로는 naktal_admin 쿠키가 있으면 admin layout이 자체 검증하므로 통과
  const hasAdminCookie = request.cookies.has("naktal_admin");
  const isAdminPath = pathname.startsWith("/admin") && pathname !== "/admin-login";
  if (!user && (pathname.startsWith("/dashboard") || (isAdminPath && !hasAdminCookie))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 로그인 사용자가 /login 또는 /signup 접근 시 /dashboard redirect
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // /admin 경로: isAdmin 여부 확인
  if (user && pathname.startsWith("/admin")) {
    const { data: dbUser } = await supabase
      .from("User")
      .select("isAdmin,isActive")
      .eq("supabaseId", user.id)
      .single();

    const u = dbUser as { isAdmin?: boolean; isActive?: boolean } | null;
    if (!u?.isAdmin || u?.isActive === false) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Python serverless functions(api/ml-*)는 Next.js middleware 우회 — Vercel 루팅이 직접 처리
    "/((?!_next/static|_next/image|favicon.ico|api/ml-|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
