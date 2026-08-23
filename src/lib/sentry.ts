import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

/** True when a usable public Sentry DSN is configured. Flag-off default. */
export const isSentryConfigured = Boolean(dsn);

/* No-op until VITE_SENTRY_DSN is provided (mirrors the supabase.ts pattern). */
export function initSentry(): void {
  if (!isSentryConfigured) return;
  Sentry.init({ dsn });
}

/** Forward an error to Sentry; safe no-op when unconfigured. */
export function captureException(err: unknown): void {
  if (isSentryConfigured) Sentry.captureException(err);
}
