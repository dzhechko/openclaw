# ADR-005: Model Mapping and Fallback Strategy

## Status: PROPOSED

## Date: 2026-02-12

## Bounded Context: Model Routing

## Context

Claude Code internally uses 3 model tiers (Opus, Sonnet, Haiku). The
claude-code-proxy maps these to cloud.ru FM models via environment variables.
GLM-4.7 has known tool calling instabilities that may cause failures at runtime.
A robust fallback strategy is needed.

### DDD Value Object: ModelMapping

```typescript
type ModelMapping = {
  claudeName: "opus" | "sonnet" | "haiku";
  cloudruModel: string;
  tier: "big" | "middle" | "small";
  fallback?: string;
  free: boolean;
};
```

## Decision

### Primary Mapping (Default)

| Claude Code Tier | Proxy Env | Cloud.ru Model | Context | Free |
|-----------------|-----------|---------------|---------|------|
| Opus (BIG) | BIG_MODEL | zai-org/GLM-4.7 | 200K | No |
| Sonnet (MIDDLE) | MIDDLE_MODEL | Qwen/Qwen3-Coder-480B-A35B-Instruct | 128K | No |
| Haiku (SMALL) | SMALL_MODEL | zai-org/GLM-4.7-Flash | 200K | Yes |

### Alternative Mapping (All-GLM, Free)

| Claude Code Tier | Cloud.ru Model | Notes |
|-----------------|---------------|-------|
| Opus | zai-org/GLM-4.7 | Top quality |
| Sonnet | zai-org/GLM-4.7-FlashX | Balanced |
| Haiku | zai-org/GLM-4.7-Flash | Free, fast |

### Wizard Model Selection

The wizard offers 3 choices per ADR-002:

| Choice | Sets BIG_MODEL | Sets MIDDLE_MODEL | Sets SMALL_MODEL |
|--------|---------------|-------------------|-----------------|
| GLM-4.7 (Full) | GLM-4.7 | GLM-4.7-FlashX | GLM-4.7-Flash |
| GLM-4.7-Flash (Free) | GLM-4.7-Flash | GLM-4.7-Flash | GLM-4.7-Flash |
| Qwen3-Coder-480B | Qwen3-Coder-480B | GLM-4.7-FlashX | GLM-4.7-Flash |

### Fallback Chain

When a model fails (timeout, 5xx, tool call error):

```
GLM-4.7 → GLM-4.7-FlashX → GLM-4.7-Flash → ERROR
Qwen3-Coder → GLM-4.7 → GLM-4.7-Flash → ERROR
```

Fallback is handled by OpenClaw's existing `runAgentTurnWithFallback()` in
`agent-runner.ts`, which supports model fallback lists via
`agents.defaults.model.fallbacks` in config.

### GLM-4.7 Tool Calling Mitigations

| Issue | Mitigation | Where |
|-------|-----------|-------|
| Streaming tool call parse crash | Proxy handles internally | claude-code-proxy |
| Tool call simulation in text | Proxy validates response format | claude-code-proxy |
| RLHF refusals | Anti-refusal in system prompt | OpenClaw system prompt |
| Long system prompt attention loss | Keep prompts < 4000 chars | OpenClaw config |
| Thinking mode conflicts | Disable via proxy env | DISABLE_THINKING=true |

## Consequences

### Positive

- Default mapping uses free tier (GLM-4.7-Flash) — zero cost
- Fallback chain provides resilience
- Wizard presets simplify model selection
- Existing fallback infrastructure in OpenClaw handles retries

### Negative

- Model mapping hardcoded in proxy env — requires restart to change
- Fallback changes model mid-conversation (different quality)
- GLM-4.7-Flash has lower quality than paid models
- No dynamic model routing based on task complexity

### Invariants

1. **SMALL_MODEL must always be GLM-4.7-Flash** (free tier guarantee)
2. **Proxy must have all 3 MODEL envs set** (otherwise falls back to defaults)
3. **Model fallback list must terminate** (no circular fallbacks)

## References

- `src/agents/cli-backends.ts:10-28` — CLAUDE_MODEL_ALIASES
- `src/config/types.agent-defaults.ts:23-26` — AgentModelListConfig (primary + fallbacks)
- claude-code-proxy env: BIG_MODEL, MIDDLE_MODEL, SMALL_MODEL
- [Cloud.ru FM Models](https://cloud.ru/products/evolution-foundation-models)
