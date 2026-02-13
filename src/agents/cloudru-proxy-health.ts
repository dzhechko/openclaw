/**
 * Cloud.ru FM proxy health checking with result caching.
 *
 * Resolves CRITICAL-004 (health check location) and BLOCKING GAP #4
 * (proxy-unhealthy must NOT trigger model fallback).
 *
 * Design: `ensureProxyHealthy` throws a plain Error (not FailoverError)
 * so that `runWithModelFallback()` rethrows immediately without cycling
 * through fallback candidates that share the same dead proxy.
 */

/** Result of a proxy health check. */
export interface ProxyHealthResult {
  ok: boolean;
  status?: number;
  latencyMs?: number;
  error?: string;
}

/** Default timeout for the HTTP health probe (ms). */
const DEFAULT_TIMEOUT_MS = 5_000;

/** Cache time-to-live (ms). */
const CACHE_TTL_MS = 30_000;

/** Module-level cached result keyed by proxy URL. */
let cachedResult: { url: string; result: ProxyHealthResult; expiresAt: number } | null = null;

/**
 * Check proxy health with timeout and caching.
 *
 * The result is cached for 30 seconds to avoid hammering the proxy on
 * rapid successive agent runs (serialize:true means at most one in-flight
 * request, but the fallback loop can call this multiple times).
 *
 * @param proxyUrl - Base URL of the proxy (e.g. "http://localhost:8082").
 * @param timeoutMs - HTTP probe timeout; defaults to 5 000 ms.
 * @returns Health result. Never throws.
 */
export async function checkProxyHealth(
  proxyUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ProxyHealthResult> {
  // Serve from cache when valid.
  if (cachedResult && cachedResult.url === proxyUrl && Date.now() < cachedResult.expiresAt) {
    return cachedResult.result;
  }

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const healthUrl = proxyUrl.replace(/\/+$/, "") + "/health";
    const response = await fetch(healthUrl, { signal: controller.signal });
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    const result: ProxyHealthResult = response.ok
      ? { ok: true, status: response.status, latencyMs }
      : { ok: false, status: response.status, latencyMs, error: `HTTP ${response.status}` };
    cachedResult = { url: proxyUrl, result, expiresAt: Date.now() + CACHE_TTL_MS };
    return result;
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? "timeout"
          : err.message
        : String(err);
    const result: ProxyHealthResult = { ok: false, latencyMs, error: message };
    cachedResult = { url: proxyUrl, result, expiresAt: Date.now() + CACHE_TTL_MS };
    return result;
  }
}

/**
 * Verify proxy is running before making requests.
 *
 * Throws a **plain Error** (not FailoverError) when the proxy is down.
 * This is intentional: plain Errors bypass the model-fallback loop in
 * `runWithModelFallback()`, which would otherwise pointlessly attempt
 * sonnet/haiku through the same unreachable proxy.
 *
 * @param proxyUrl - Base URL of the proxy.
 * @throws {Error} Descriptive, actionable message when proxy is unreachable.
 */
export async function ensureProxyHealthy(proxyUrl: string): Promise<void> {
  const result = await checkProxyHealth(proxyUrl);
  if (!result.ok) {
    throw new Error(
      `Cloud.ru FM proxy is not reachable at ${proxyUrl}. ` +
        `Error: ${result.error ?? "unknown"}. ` +
        `Please ensure the proxy container is running: ` +
        `docker compose -f docker-compose.cloudru-proxy.yml up -d`,
    );
  }
}

/** Clear the cached health result (useful for tests). */
export function clearProxyHealthCache(): void {
  cachedResult = null;
}
