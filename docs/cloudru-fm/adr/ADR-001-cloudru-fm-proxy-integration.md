# ADR-001: Cloud.ru FM Integration via Claude Code Proxy

## Status: PROPOSED

## Date: 2026-02-12

## Bounded Context: Agent Execution / Proxy Management

## Context

OpenClaw needs to use cloud.ru Evolution Foundation Models (GLM-4.7, GLM-4.7-Flash,
Qwen3-Coder-480B) as the LLM backend for user-facing conversations. The user's
strategic decision is to leverage Claude Code's multi-agent architecture (tool calling,
MCP, multi-step reasoning, session persistence) to boost task quality beyond what the
raw model provides alone.

### Problem

Claude Code speaks the Anthropic API protocol (`x-api-key`, `anthropic-version`,
`/messages`). Cloud.ru FM speaks OpenAI-compatible protocol (`Authorization: Bearer`,
`/v1/chat/completions`). Additionally, Claude Code requests models by Anthropic names
(`claude-opus-4-6`, `claude-sonnet-4-5`, `claude-haiku-4-5`) while cloud.ru uses its
own model IDs (`zai-org/GLM-4.7`, `Qwen/Qwen3-Coder-480B-A35B-Instruct`).

### Forces

- Protocol incompatibility (Anthropic vs OpenAI)
- Model name mismatch (Claude names vs cloud.ru names)
- Tool calling format differences (Anthropic tool_use vs OpenAI function_calling)
- GLM-4.7 known tool calling instabilities (sglang #15721)
- Need for localhost-only security (API key exposure)
- Docker-based deployment preferred for isolation

## Decision

Use **claude-code-proxy** (Docker image `legard/claude-code-proxy:latest`) as the
protocol translation layer between Claude Code and cloud.ru FM API.

### Architecture

```
OpenClaw runCliAgent()
  → spawns: claude -p --output-format json
    → Claude Code (ANTHROPIC_BASE_URL=http://localhost:8082)
      → claude-code-proxy (Docker, port 8082)
        → cloud.ru FM API (https://foundation-models.api.cloud.ru/v1/)
```

### Proxy Configuration

```yaml
# docker-compose.yml
services:
  claude-code-proxy:
    image: legard/claude-code-proxy:latest
    ports:
      - "127.0.0.1:8082:8082"
    environment:
      OPENAI_API_KEY: "${CLOUDRU_API_KEY}"
      OPENAI_BASE_URL: "https://foundation-models.api.cloud.ru/v1"
      BIG_MODEL: "zai-org/GLM-4.7"
      MIDDLE_MODEL: "Qwen/Qwen3-Coder-480B-A35B-Instruct"
      SMALL_MODEL: "zai-org/GLM-4.7-Flash"
      HOST: "0.0.0.0"
      PORT: "8082"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8082/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### OpenClaw CLI Backend Override

```json
{
  "agents": {
    "defaults": {
      "cliBackends": {
        "claude-cli": {
          "env": {
            "ANTHROPIC_BASE_URL": "http://localhost:8082",
            "ANTHROPIC_API_KEY": "cloudru-proxy-key"
          }
        }
      }
    }
  }
}
```

This works because `mergeBackendConfig()` in `cli-backends.ts:95-110` merges
user-provided `env` with the default backend config, and `cli-runner.ts:222-228`
applies the merged env to the subprocess.

## Consequences

### Positive

- Zero changes to Claude Code itself — only env config
- Zero changes to OpenClaw core — uses existing `claude-cli` backend
- Full multi-agent architecture available (tool calling, MCP, sessions)
- GLM-4.7-Flash is free tier — zero cost for basic usage
- Docker isolation for proxy — clean deployment

### Negative

- Additional infrastructure component (proxy Docker container)
- Single point of failure (proxy crash = no LLM)
- Proxy does not support multi-provider routing
- GLM-4.7 tool calling instability may surface through Claude Code
- `serialize: true` in default backend limits to 1 concurrent request

### Risks

| Risk | Probability | Impact | Mitigation |
|------|:-----------:|:------:|-----------|
| Proxy crashes under load | Low | High | Docker restart policy, health checks |
| GLM tool calling failures | Medium | High | Proxy validation, fallback to text |
| API key exposure | Low | Critical | localhost-only binding, .env files |
| Rate limit (15 req/s) | Medium | Medium | Request queuing in OpenClaw |
| Streaming timeout | Medium | Low | Increase REQUEST_TIMEOUT env |

## Alternatives Considered

1. **OpenCode CLI as backend** — Natively supports cloud.ru but lacks Claude Code's
   agentic depth (no CLAUDE.md, no hooks, no swarms). Score: 7.6/10 vs 8.0/10.
2. **Direct API calls** — Simpler but loses multi-step reasoning, tool orchestration,
   and session persistence that Claude Code provides.
3. **Fork Claude Code** — Too invasive, maintenance burden on every upstream update.

## References

- `src/agents/cli-backends.ts` — CLI backend configuration and merging
- `src/agents/cli-runner.ts` — CLI agent execution (subprocess spawning)
- [claude-code-proxy](https://github.com/fuergaosi233/claude-code-proxy)
- [Cloud.ru FM API](https://cloud.ru/docs/foundation-models/ug/topics/api-ref)
- [sglang #15721](https://github.com/sgl-project/sglang/issues/15721) — GLM tool call bug
