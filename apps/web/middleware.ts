/**
 * Naktal.me 라우트 가드 (박상빈님 5/20 복구)
 *
 * 보호 라우트:
 *   /dashboard/*  — 비로그인 시 /login 리디렉트
 *   /admin/*      — 비로그인 시 /login 리디렉트 + isAdmin DB 검증은 페이지/API 측에서
 *   /folder, /history, /profile, /alerts, /realtime, /pricing, /settings — 로그인 필요
 *
 * 비보호 (공개):
 *   /, /login, /signup, /privacy, /terms, /faq, /announcements (목록)
 *   /api/* — API 측에서 자체 인증
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED_PATHS = [
  "/dashboard",
  "/admin",
  "/folder",
  "/history",
  "/profile",
  "/alerts",
  "/realtime",
  "/settings",
  "/strategy",       // 번호 분석 결과 페이지
  "/bid-request",    // 투찰 의뢰
  "/bid-result",     // 결과 페이지
];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const response = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set({ name, value, ...options });
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * 정적 자산 + Next.js 내부 경로 + 공개 API 제외
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sitemap.xml|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
