/**
 * 통합 에러 보고 헬퍼 (Sentry 준비)
 *
 * Sentry SDK 설치 전: console.error 로 폴백 (no-op).
 * Sentry SDK 설치 후 (`pnpm add @sentry/nextjs --filter @naktal/web`):
 *   sentry.server.config.ts / sentry.client.config.ts 가 자동 등록한 글로벌 헬퍼를 사용.
 *
 * 호출자는 try/catch 또는 critical path 진입점에서 `report()` 사용.
 *   import { reportError } from "@/lib/error-report";
 *   try { ... } catch (e) { reportError(e, { route: "/api/ml-predict" }); }
 */

type ErrorContext = Record<string, string | number | boolean | null | undefined>;

interface SentryLike {
  captureException: (e: unknown, ctx?: { extra?: ErrorContext }) => void;
}

function getSentry(): SentryLike | null {
  // Sentry SDK 설치 시 globalThis.__SENTRY__ 또는 dynamic import 통해 노출됨
  // SDK 미설치 시 undefined → console.error 폴백
  const g = globalThis as unknown as { Sentry?: SentryLike };
  return g.Sentry ?? null;
}

export function reportError(err: unknown, context?: ErrorContext): void {
  const sentry = getSentry();
  if (sentry) {
    sentry.captureException(err, { extra: context });
    return;
  }
  const ctxStr = context ? ` ctx=${JSON.stringify(context)}` : "";
  if (err instanceof Error) {
    console.error(`[error-report] ${err.name}: ${err.message}${ctxStr}`, err.stack);
  } else {
    console.error(`[error-report] ${String(err)}${ctxStr}`);
  }
}

export function reportMessage(message: string, context?: ErrorContext): void {
  const ctxStr = context ? ` ctx=${JSON.stringify(context)}` : "";
  console.warn(`[error-report] ${message}${ctxStr}`);
}
