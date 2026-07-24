/**
 * Lightweight structured logger for API routes.
 *
 * Replaces ad-hoc console.log calls scattered across route.ts files.
 * Why:
 *   - In production (Vercel), each console.log becomes a billable log line.
 *     Consolidating into one logger lets us strip info-level logs in prod.
 *   - Vercel log search and dashboard can filter by tag cheaply.
 *   - PII (email, phone, broker name) should be redacted before leaving the box.
 *     Wrapping in helper lets us add redaction in one place.
 *
 * Verbosity rules:
 *   - info is stripped in production (NODE_ENV === production).
 *   - warn and error always emit.
 *   - Errors are emitted with console.error so Vercel groups them as errors.
 */

type LogLevel = "info" | "warn" | "error";

interface LogContext {
  tag?: string;
}

const PROD = process.env.NODE_ENV === "production";

function emit(level: LogLevel, ctx: LogContext, message: string, extra?: unknown): void {
  if (level === "info" && PROD) return;
  const prefix = ctx.tag ? ctx.tag + " " : "";
  const line = prefix + message;
  if (level === "error") {
    console.error(line, extra !== undefined ? extra : "");
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function createLogger(tag: string) {
  return {
    info: (msg: string, extra?: unknown) => emit("info", { tag }, msg, extra),
    warn: (msg: string, extra?: unknown) => emit("warn", { tag }, msg, extra),
    error: (msg: string, extra?: unknown) => emit("error", { tag }, msg, extra),
  };
}

export type Logger = ReturnType<typeof createLogger>;
