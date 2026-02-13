# Cloud.ru Foundation Models Integration

OpenClaw supports [Cloud.ru Foundation Models](https://cloud.ru/ru/ai-foundation-models) as a first-class LLM provider via a local Docker proxy.

## Quick Start

```bash
# 1. Clone and setup
git clone https://github.com/dzhechko/openclaw.git
cd openclaw && git checkout cloudru-fm && npm install

# 2. Run wizard — select "Cloud.ru FM"
npx openclaw onboard

# 3. Start proxy
docker compose -f docker-compose.cloudru-proxy.yml up -d

# 4. Use
npx openclaw run --prompt "Hello, write a sort function in Python"
```

## Model Presets

| Preset | Big Model | Middle Model | Small Model | Free? |
|--------|-----------|-------------|-------------|-------|
| GLM-4.7 (Full) | GLM-4.7 | GLM-4.7-FlashX | GLM-4.7-Flash | No |
| GLM-4.7-Flash | GLM-4.7-Flash | GLM-4.7-Flash | GLM-4.7-Flash | Yes |
| Qwen3-Coder-480B | Qwen3-Coder-480B | GLM-4.7-FlashX | GLM-4.7-Flash | No |

## Documentation

| Document | Audience | Description |
|----------|----------|-------------|
| [Installation](installation.md) | Users | Step-by-step setup guide |
| [User Guide](user-guide.md) | Users | Daily usage, FAQ, troubleshooting |
| [Operations](operations.md) | Admins | Monitoring, updates, security, backup |
| [Architecture](architecture.md) | Developers | System design, components, dependencies |
| [Functionality](functionality.md) | All | Feature overview and capabilities |

## Architecture Decisions

| ADR | Title |
|-----|-------|
| [ADR-001](adr/ADR-001-cloudru-fm-proxy-integration.md) | Cloud.ru FM Integration via Claude Code Proxy |
| [ADR-002](adr/ADR-002-wizard-cloudru-auth-choice.md) | Wizard Extension — Cloud.ru FM Auth Choice |
| [ADR-003](adr/ADR-003-claude-code-agentic-engine.md) | Claude Code as Agentic Execution Engine |
| [ADR-004](adr/ADR-004-proxy-lifecycle-management.md) | Proxy Lifecycle Management |
| [ADR-005](adr/ADR-005-model-mapping-fallback-strategy.md) | Model Mapping and Fallback Strategy |

## How It Works

```
User -> openclaw onboard -> selects "Cloud.ru FM"
  -> Wizard collects API key
  -> Configures openclaw.json + proxy
  -> Generates docker-compose.cloudru-proxy.yml

Claude Code CLI -> localhost:8082 (proxy) -> cloud.ru FM API
```

## Source Files

### New files (on `cloudru-fm` branch)
- `src/config/cloudru-fm.constants.ts` — models, presets, proxy config (SoT)
- `src/commands/auth-choice.apply.cloudru-fm.ts` — wizard handler
- `src/commands/onboard-cloudru-fm.ts` — .env writer, gitignore, preset resolver
- `src/commands/cloudru-rollback.ts` — config rollback utility
- `src/agents/cloudru-proxy-template.ts` — Docker Compose generator
- `src/agents/cloudru-proxy-health.ts` — health check with 30s cache

### Modified files
- `src/commands/onboard-types.ts` — 3 new AuthChoice values
- `src/commands/auth-choice-options.ts` — cloudru-fm group
- `src/commands/auth-choice.apply.ts` — handler registration
