# ADR-003: Claude Code as Agentic Execution Engine

## Status: PROPOSED

## Date: 2026-02-12

## Bounded Context: Agent Execution

## Context

OpenClaw routes user messages through an agent execution pipeline. When the provider
is `claude-cli`, OpenClaw spawns Claude Code as a subprocess via `runCliAgent()` in
`cli-runner.ts`. Claude Code then processes the user's message with its full agentic
architecture — multi-step reasoning, tool calling, MCP servers, session persistence.

### User's Strategic Insight

> "Claude Code's architecture makes task quality HIGHER than model quality alone."

This is architecturally correct because Claude Code:
1. **Decomposes** complex tasks into sub-steps internally
2. **Orchestrates** tools (file read/write, bash, search) autonomously
3. **Maintains** session state across conversation turns
4. **Applies** CLAUDE.md project instructions persistently
5. **Validates** its own output through multi-step verification

The underlying model (GLM-4.7) benefits from this "chassis" — producing results
that exceed what the model alone would generate via direct API call.

### DDD Aggregate: AgentExecution

The agent execution aggregate encapsulates the complete lifecycle of a user
message being processed by an agent backend. For the `claude-cli` provider,
this aggregate includes subprocess spawning, I/O management, session persistence,
and result parsing.

## Decision

Use OpenClaw's **existing** `claude-cli` backend (`cli-backends.ts`, `cli-runner.ts`)
as the primary execution path for cloud.ru FM conversations.

### Execution Flow

```
1. User sends message (Telegram/Web/WhatsApp)
2. OpenClaw gateway receives message
3. agent-runner.ts:378 — isCliProvider() returns true for "claude-cli"
4. runCliAgent() spawns subprocess:
   claude -p --output-format json --dangerously-skip-permissions \
     --model opus \
     --session-id <session-id> \
     --append-system-prompt "<openclaw-system-prompt>" \
     "<user-message>"
5. Environment injected:
   ANTHROPIC_BASE_URL=http://localhost:8082  (proxy)
   ANTHROPIC_API_KEY=cloudru-proxy-key
6. Claude Code → proxy → cloud.ru FM → response
7. Response parsed as JSON → delivered to user
```

### Session Continuity

The `claude-cli` backend uses `sessionMode: "always"` and passes `--session-id`
on every call. When a session exists, `resumeArgs` are used with `--resume`.
This means Claude Code maintains full conversation context across messages.

### Known Limitation: Tools Disabled

`cli-runner.ts:82-83` injects:
```typescript
"Tools are disabled in this session. Do not call tools."
```

This **prevents** Claude Code from using file operations, bash, etc. within
OpenClaw sessions. For the initial integration, this is acceptable because:
- OpenClaw manages its own tool layer (skills, MCP, web search)
- Enabling Claude Code tools would require workspace isolation per user
- Security implications of arbitrary tool execution per user message

**Future ADR** may address enabling selective tools for trusted users.

## Consequences

### Positive

- Zero code changes to OpenClaw core — config-only integration
- Full Claude Code reasoning pipeline enhances model output quality
- Session persistence provides conversation continuity
- System prompt injection (`--append-system-prompt`) customizes behavior
- JSON output parsing provides structured results

### Negative

- Subprocess overhead: ~2-5s startup per cold call
- `serialize: true` limits to 1 concurrent request globally
- Tools disabled limits Claude Code to pure reasoning (no file ops)
- No streaming to end user (batch response only)
- Claude Code stderr/stdout parsing may be fragile

### Invariants (DDD)

1. **Session Identity**: Every OpenClaw conversation maps to exactly one Claude Code
   session ID. This is an aggregate invariant enforced by `resolveSessionIdToSend()`.
2. **Backend Resolution**: `resolveCliBackendConfig("claude-cli", cfg)` must always
   return a valid config. Null result throws `"Unknown CLI backend"`.
3. **Environment Isolation**: `clearEnv` removes `ANTHROPIC_API_KEY` before applying
   user-configured `env`. This prevents key leakage between backends.

## References

- `src/agents/cli-backends.ts:30-53` — DEFAULT_CLAUDE_BACKEND config
- `src/agents/cli-runner.ts:35-324` — runCliAgent() full implementation
- `src/agents/cli-runner.ts:82-83` — Tools disabled injection
- `src/auto-reply/reply/agent-runner.ts:378` — CLI provider routing
- `src/auto-reply/reply/agent-runner.claude-cli.test.ts` — Integration test
