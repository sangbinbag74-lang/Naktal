/**
 * G-5: Sentry 통합 래퍼
 *
 * 동작:
 *  - @sentry/nextjs 가 설치되고 SENTRY_DSN 등록된 환경에서는 캡처 위임
 *  - 미설치 또는 미설정 환경에서는 console.error 폴백 (코드 안 깨짐)
 *
 * 사용:
 *   import { captureError, withSentry } from "@/lib/observability/sentry";
 *   try { ... } catch (e) { captureError(e, { route: "/api/x" }); throw e; }
 *
 * 또는 route handler 자체를 감쌈:
 *   export const POST = withSentry(async (req) => { ... }, { route: "/api/strategy/recommend" });
 *
 * Sentry 설치 가이드: `npx @sentry/wizard@latest -i nextjs`
 */

type SentryLike = {
  captureException?: (e: unknown, ctx?: Record<string, unknown>) => void;
};

let cached: SentryLike | null | undefined;

async function getSentry(): Promise<SentryLike | null> {
  if (cached !== undefined) return cached;
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
    cached = null;
    return null;
  }
  try {
    // @ts-expect-error optional dependency, may not be installed
    const mod = (await import("@sentry/nextjs")) as SentryLike;
    cached = mod ?? null;
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

export async function captureError(
  err: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  const tag = context.route ?? context.where ?? "unknown";
  console.error(`[error:${String(tag)}]`, err, context);
  const sentry = await getSentry();
  if (!sentry?.captureException) return;
  try {
    sentry.captureException(err, { extra: context });
  } catch {
    /* ignore */
  }
}

export function withSentry<TArgs extends unknown[], TRet>(
  handler: (...args: TArgs) => Promise<TRet>,
  context: Record<string, unknown> = {},
): (...args: TArgs) => Promise<TRet> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (e) {
      await captureError(e, context);
      throw e;
    }
  };
}
