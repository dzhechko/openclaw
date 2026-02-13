/**
 * Cloud.ru Proxy Health Check
 *
 * Pre-flight health check for the claude-code-proxy Docker container.
 * Cached for 30s on success, not cached on failure (allows immediate retry).
 *
 * Throws plain Error (not FailoverError) intentionally — a dead proxy means
 * ALL tiers are unreachable, so model-level fallback is pointless.
 */

const DEFAULT_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 30_000;

export type ProxyHealthResult = {
  ok: boolean;
  status?: number;
  latencyMs: number;
  error?: string;
};

let cachedResult: {
  url: string;
  result: ProxyHealthResult;
  expiresAt: number;
} | null = null;

let inflightPromise: Promise<ProxyHealthResult> | null = null;

async function doCheck(
  proxyUrl: string,
  timeoutMs: number,
): Promise<ProxyHealthResult> {
  const healthUrl = proxyUrl.replace(/\/+$/, "") + "/health";
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(healthUrl, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);

    const latencyMs = Date.now() - start;
    const result: ProxyHealthResult = {
      ok: res.ok,
      status: res.status,
      latencyMs,
    };

    // Only cache successful results — failures should allow immediate retry
    if (result.ok) {
      cachedResult = {
        url: proxyUrl,
        result,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
    }

    return result;
  } catch (error: unknown) {
    const latencyMs = Date.now() - start;
    const message =
      error instanceof Error ? error.message : String(error);
    return { ok: false, latencyMs, error: message };
  }
}

/**
 * Check proxy health with caching and deduplication.
 * Successful results are cached for 30s. Failures are not cached.
 */
export async function checkProxyHealth(
  proxyUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ProxyHealthResult> {
  // Return cached result if valid
  if (
    cachedResult &&
    cachedResult.url === proxyUrl &&
    Date.now() < cachedResult.expiresAt
  ) {
    return cachedResult.result;
  }

  // Deduplicate concurrent requests
  if (!inflightPromise) {
    inflightPromise = doCheck(proxyUrl, timeoutMs).finally(() => {
      inflightPromise = null;
    });
  }
  return inflightPromise;
}

/**
 * Throws plain Error if proxy is unreachable.
 *
 * Why plain Error and NOT FailoverError:
 * If the proxy is down, ALL tiers (opus/sonnet/haiku) route through the same
 * dead proxy. FailoverError would trigger model fallback which would cycle
 * through sonnet and haiku — hitting the same dead endpoint. Plain Error
 * bypasses the fallback loop entirely and surfaces an actionable message.
 */
export async function ensureProxyHealthy(
  proxyUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const result = await checkProxyHealth(proxyUrl, timeoutMs);
  if (!result.ok) {
    const detail = result.error ?? `HTTP ${result.status}`;
    throw new Error(
      `Cloud.ru proxy at ${proxyUrl} is unreachable (${detail}). ` +
        `Ensure the proxy is running: docker compose -f docker-compose.cloudru-proxy.yml up -d`,
    );
  }
}

/** Clear the health cache (for tests). */
export function clearProxyHealthCache(): void {
  cachedResult = null;
  inflightPromise = null;
}
