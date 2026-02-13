# ADR-002: Wizard Extension — Cloud.ru FM Auth Choice

## Status: PROPOSED

## Date: 2026-02-12

## Bounded Context: Wizard Configuration

## Context

OpenClaw's installation wizard (`configure.wizard.ts`) supports 18+ auth provider
groups (OpenAI, Anthropic, Google, Z.AI, etc.) via a two-step selection flow:
1. Select provider group (`promptAuthChoiceGrouped`)
2. Select specific auth method within group

Users who want to use cloud.ru Evolution Foundation Models need a first-class
wizard experience that auto-configures both the cloud.ru provider AND the
`claude-cli` backend with proxy settings.

### Current Wizard Architecture

```
onboard-types.ts     → AuthChoice union type (47 members)
auth-choice-options.ts → AuthChoiceGroupId union + AUTH_CHOICE_GROUP_DEFS array
auth-choice-prompt.ts  → promptAuthChoiceGrouped() 2-step selection
configure.gateway-auth.ts → promptAuthConfig() dispatches to auth handlers
onboard-custom.ts      → Custom Provider flow (base URL + key + model)
```

### DDD Aggregate: WizardConfiguration

The wizard configuration aggregate manages the flow of user inputs through
provider selection → credential input → model configuration → backend setup.
The Cloud.ru FM extension adds a new bounded context within this aggregate
that cross-cuts into the Agent Execution context (CLI backend config).

## Decision

Add a `"cloudru-fm"` auth choice group to the wizard with the following
sub-choices:

| Choice ID | Label | Description |
|-----------|-------|-------------|
| `cloudru-fm-glm47` | GLM-4.7 (Full) | Top model, 358B MoE, thinking mode |
| `cloudru-fm-flash` | GLM-4.7-Flash (Free) | Free tier, fast, recommended default |
| `cloudru-fm-qwen` | Qwen3-Coder-480B | Code-specialized alternative |

### Type Extensions

```typescript
// onboard-types.ts — extend AuthChoice
| "cloudru-fm-glm47"
| "cloudru-fm-flash"
| "cloudru-fm-qwen"

// auth-choice-options.ts — extend AuthChoiceGroupId
| "cloudru-fm"

// auth-choice-options.ts — add to AUTH_CHOICE_GROUP_DEFS
{
  value: "cloudru-fm",
  label: "Cloud.ru FM",
  hint: "GLM-4.7 / Qwen3 via Claude Code proxy",
  choices: ["cloudru-fm-glm47", "cloudru-fm-flash", "cloudru-fm-qwen"],
}
```

### Wizard Flow

```
Step 1: Model/auth provider → "Cloud.ru FM"
Step 2: Select model → "GLM-4.7-Flash (Free)" [default]
Step 3: API Key → [paste cloud.ru API key]
Step 4: Proxy status → [check/deploy docker-compose]
Step 5: Auto-configure:
  - models.providers.cloudru-fm with baseUrl + apiKey + models
  - agents.defaults.cliBackends.claude-cli.env with proxy URL
  - agents.defaults.model.primary = "cloudru-fm/<model-id>"
```

### Implementation: New File

Create `src/commands/onboard-cloudru-fm.ts` (~150 lines) containing:
- `promptCloudruFmConfig()` — interactive wizard flow
- `applyCloudruFmConfig()` — pure function applying config
- `verifyProxyHealth()` — check proxy connectivity
- `generateDockerCompose()` — generate docker-compose.yml template

### Integration Points

1. **`onboard-types.ts`** — Add 3 new AuthChoice values
2. **`auth-choice-options.ts`** — Add group + options
3. **`configure.gateway-auth.ts:60`** — Add dispatch for `cloudru-fm-*` choices
4. **`auth-choice.apply.ts`** — Register `applyCloudruFmChoice` handler

## Consequences

### Positive

- First-class cloud.ru FM experience in wizard (not buried in "Custom Provider")
- Auto-configures both provider AND claude-cli backend in one flow
- Default model (GLM-4.7-Flash) is free — zero barrier to entry
- Follows existing wizard patterns (2-step selection, verification, apply)

### Negative

- 4 files modified in upstream + 1 new file created
- Maintenance burden if cloud.ru changes model IDs
- Proxy deployment step adds complexity to wizard

### Domain Events

| Event | Trigger | Handler |
|-------|---------|---------|
| `CloudruFmProviderConfigured` | User completes wizard | Write to openclaw.json |
| `ClaudeCliBackendConfigured` | Provider configured | Update cliBackends.env |
| `ProxyHealthChecked` | After config apply | Verify proxy reachability |

## References

- `src/commands/onboard-types.ts:5-47` — AuthChoice type
- `src/commands/auth-choice-options.ts:39-165` — AUTH_CHOICE_GROUP_DEFS
- `src/commands/auth-choice-prompt.ts` — promptAuthChoiceGrouped
- `src/commands/configure.gateway-auth.ts:46-103` — promptAuthConfig
- `src/commands/onboard-custom.ts` — Custom Provider flow (reference pattern)
