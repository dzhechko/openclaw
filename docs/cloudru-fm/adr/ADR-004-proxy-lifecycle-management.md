# ADR-004: Proxy Lifecycle Management

## Status: PROPOSED

## Date: 2026-02-12

## Bounded Context: Proxy Management

## Context

The claude-code-proxy Docker container is a critical infrastructure dependency for
the cloud.ru FM integration. It must be deployed, monitored, and recoverable.
The wizard should handle initial deployment, and OpenClaw should verify proxy
health before routing requests.

### DDD Aggregate: ProxyLifecycle

Manages the proxy container state machine:
```
UNDEPLOYED → DEPLOYING → RUNNING → HEALTHY
                                  ↓
                              UNHEALTHY → RECOVERING → HEALTHY
                                  ↓
                              STOPPED
```

## Decision

### 1. Docker Compose Generation

The wizard generates a `docker-compose.cloudru-proxy.yml` file in the OpenClaw
workspace directory. This file is NOT committed to git (added to .gitignore).

Template variables:
- `${CLOUDRU_API_KEY}` — user's cloud.ru API key (from .env)
- `${PROXY_PORT}` — default 8082
- `${BIG_MODEL}` — default "zai-org/GLM-4.7"
- `${MIDDLE_MODEL}` — default "Qwen/Qwen3-Coder-480B-A35B-Instruct"
- `${SMALL_MODEL}` — default "zai-org/GLM-4.7-Flash"

### 2. Health Check Integration

Add proxy health verification to the wizard flow:

```typescript
async function verifyProxyHealth(proxyUrl: string): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
}> {
  try {
    const res = await fetchWithTimeout(
      `${proxyUrl}/health`,
      { method: "GET" },
      5000
    );
    return { ok: res.ok, status: res.status };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
```

### 3. Runtime Health Monitoring

OpenClaw should verify proxy health before routing to `claude-cli` backend.
If unhealthy, fall back to direct API call or queue the request.

Implementation: Add a pre-flight check in `runCliAgent()` or at the
`agent-runner.ts` routing layer.

## Consequences

### Positive

- Automated proxy deployment from wizard
- Health monitoring prevents silent failures
- Docker restart policy handles transient crashes
- Separation of concerns: proxy config in workspace, not in openclaw.json

### Negative

- Requires Docker installed on host
- docker-compose file is workspace-specific, not portable
- Health check adds latency to first request
- No automatic proxy updates (manual image pull)

### Security Considerations

- Docker compose uses `.env` file — MUST be in .gitignore
- Proxy binds to 127.0.0.1 ONLY — no external access
- API key stored in .env, never in openclaw.json
- Container runs with default Docker security profile

## References

- `docker-compose.yml` template in RESEARCH.md section 2.2
- Docker health check: `curl -f http://localhost:8082/health`
- cloud.ru API: `https://foundation-models.api.cloud.ru/v1/`
