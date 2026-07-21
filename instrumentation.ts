/**
 * Next.js instrumentation hook. Runs once per server process at startup,
 * BEFORE any route or middleware. We use it to validate environment
 * variables with Zod so misconfiguration fails the boot, not the first
 * incoming request.
 *
 * This file is auto-discovered by Next.js when present at the project root
 * (or under `src/`). See:
 *   https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * `register()` is only called in the Node.js runtime, not in Edge, which is
 * what we want (Zod + Node-only `process.env` work fine here; the Edge
 * middleware already uses its own env reading via the rate-limit config).
 */
export async function register(): Promise<void> {
  // Only validate in the Node.js server runtime. `process.env.NEXT_RUNTIME`
  // is set by Next.js to "nodejs" or "edge" depending on the runtime that
  // loads this file.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { loadServerEnv } = await import("./lib/env");
  try {
    loadServerEnv();
    // eslint-disable-next-line no-console
    console.log("[env] server environment validated successfully");
  } catch (err) {
    // Re-throw so the boot fails. In Next.js dev this surfaces as a startup
    // error; in production the build/deploy step will fail with our clear
    // Zod message above the stack trace.
    throw err;
  }
}
