# Cloud.ru Foundation Models

[Cloud.ru Foundation Models](https://cloud.ru/ru/ai-foundation-models) provide access to Russian LLM models (GLM-4.7, Qwen3-Coder) through OpenClaw via a local Docker proxy.

## Available Models

| Model | ID | Context | Notes |
|-------|----|---------|-------|
| GLM-4.7 | `zai-org/GLM-4.7` | 200K | 358B MoE, thinking mode |
| GLM-4.7-FlashX | `zai-org/GLM-4.7-FlashX` | 200K | Speed/quality balance |
| GLM-4.7-Flash | `zai-org/GLM-4.7-Flash` | 200K | **Free tier** |
| Qwen3-Coder-480B | `Qwen/Qwen3-Coder-480B-A35B-Instruct` | 128K | Code-specialized |

## Quick Setup

```bash
# Run wizard and select "Cloud.ru FM"
npx openclaw onboard

# Start the proxy
docker compose -f docker-compose.cloudru-proxy.yml up -d
```

## How It Works

OpenClaw uses [claude-code-proxy](https://github.com/fuergaosi233/claude-code-proxy) to translate Anthropic API protocol to OpenAI-compatible protocol used by cloud.ru FM API.

```
Claude Code CLI -> localhost:8082 (proxy) -> cloud.ru FM API
```

The proxy maps Claude Code tiers to cloud.ru models:
- **opus** -> BIG_MODEL (e.g., GLM-4.7)
- **sonnet** -> MIDDLE_MODEL (e.g., GLM-4.7-FlashX)
- **haiku** -> SMALL_MODEL (e.g., GLM-4.7-Flash)

## Prerequisites

- Docker >= 24.0
- Cloud.ru API key ([get one here](https://cloud.ru/ru/ai-foundation-models))

## Full Documentation

See the [Cloud.ru FM documentation](../cloudru-fm/index.md) for:
- [Installation guide](../cloudru-fm/installation.md)
- [User guide](../cloudru-fm/user-guide.md)
- [Operations & monitoring](../cloudru-fm/operations.md)
- [Architecture](../cloudru-fm/architecture.md)
