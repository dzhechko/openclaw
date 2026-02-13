/**
 * Auth Choice Handler: Cloud.ru FM
 *
 * Follows the established applyAuthChoice<Provider> pattern.
 * Returns null if the auth choice is not cloudru-fm-*.
 *
 * Flow:
 * 1. Guard: check if choice starts with "cloudru-fm-"
 * 2. Collect API key (opts → env → interactive prompt)
 * 3. Resolve model preset
 * 4. Write provider config to openclaw.json
 * 5. Write CLI backend override (proxy URL + sentinel key + clearEnv)
 * 6. Set model + fallback chain
 * 7. Save API key to .env (NOT to config)
 * 8. Write Docker Compose file
 * 9. Update .gitignore
 * 10. Pre-flight proxy health check (non-blocking warning)
 */

import type {
  ApplyAuthChoiceParams,
  ApplyAuthChoiceResult,
} from "./auth-choice.apply.js";
import {
  formatApiKeyPreview,
  normalizeApiKeyInput,
  validateApiKeyInput,
} from "./auth-choice.api-key.js";
import {
  CLOUDRU_FM_PRESETS,
  CLOUDRU_PROXY_PORT_DEFAULT,
  CLOUDRU_PROXY_SENTINEL_KEY,
  CLOUDRU_CLEAR_ENV_EXTRAS,
  CLOUDRU_COMPOSE_FILENAME,
} from "../config/cloudru-fm.constants.js";
import {
  resolveCloudruModelPreset,
  writeDockerComposeFile,
  writeCloudruEnvFile,
  ensureGitignoreEntries,
} from "./onboard-cloudru-fm.js";
import { checkProxyHealth } from "../agents/cloudru-proxy-health.js";

const CLOUDRU_FM_CHOICES = new Set(Object.keys(CLOUDRU_FM_PRESETS));

export async function applyAuthChoiceCloudruFm(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  // Guard: only handle cloudru-fm-* choices
  if (!CLOUDRU_FM_CHOICES.has(params.authChoice)) {
    return null;
  }

  let nextConfig = params.config;
  const proxyUrl = `http://localhost:${CLOUDRU_PROXY_PORT_DEFAULT}`;

  // -----------------------------------------------------------------------
  // 1. Collect API key
  // -----------------------------------------------------------------------

  let apiKey: string | undefined;

  // Try opts first (non-interactive / --cloudruApiKey flag)
  const optsKey = params.opts?.cloudruApiKey?.trim();
  if (optsKey) {
    apiKey = normalizeApiKeyInput(optsKey);
  }

  // Try environment variable
  if (!apiKey) {
    const envValue = process.env["CLOUDRU_API_KEY"]?.trim();
    if (envValue) {
      const useExisting = await params.prompter.confirm({
        message: `Use existing CLOUDRU_API_KEY (env, ${formatApiKeyPreview(envValue)})?`,
        initialValue: true,
      });
      if (useExisting) {
        apiKey = envValue;
      }
    }
  }

  // Interactive prompt
  if (!apiKey) {
    const key = await params.prompter.text({
      message: "Enter Cloud.ru FM API key",
      validate: validateApiKeyInput,
    });
    apiKey = normalizeApiKeyInput(String(key));
  }

  // -----------------------------------------------------------------------
  // 2. Resolve model preset
  // -----------------------------------------------------------------------

  const preset = resolveCloudruModelPreset(params.authChoice);

  // -----------------------------------------------------------------------
  // 3. Apply provider config
  // -----------------------------------------------------------------------

  const existingProviders = nextConfig.models?.providers ?? {};
  const existingCliBackends =
    nextConfig.agents?.defaults?.cliBackends ?? {};
  const existingClaudeCli = existingCliBackends["claude-cli"] ?? {};

  nextConfig = {
    ...nextConfig,
    models: {
      ...nextConfig.models,
      mode: nextConfig.models?.mode ?? "merge",
      providers: {
        ...existingProviders,
        "cloudru-fm": {
          baseUrl: `http://localhost:${CLOUDRU_PROXY_PORT_DEFAULT}`,
          apiKey: "${CLOUDRU_API_KEY}",
          api: "anthropic-messages" as const,
          models: {
            opus: {
              id: preset.big,
              contextWindow: preset.big.includes("Qwen") ? 128_000 : 200_000,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
            sonnet: {
              id: preset.middle,
              contextWindow: 200_000,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
            haiku: {
              id: preset.small,
              contextWindow: 200_000,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
          },
        },
      },
    },
    agents: {
      ...nextConfig.agents,
      defaults: {
        ...nextConfig.agents?.defaults,
        model: {
          primary: "claude-cli/opus",
          fallbacks: ["claude-cli/sonnet", "claude-cli/haiku"],
        },
        cliBackends: {
          ...existingCliBackends,
          "claude-cli": {
            ...existingClaudeCli,
            command:
              (existingClaudeCli as Record<string, unknown>).command as string ??
              "claude",
            env: {
              ...(existingClaudeCli as Record<string, Record<string, string>>)
                .env,
              ANTHROPIC_BASE_URL: proxyUrl,
              ANTHROPIC_API_KEY: CLOUDRU_PROXY_SENTINEL_KEY,
            },
            clearEnv: [
              "ANTHROPIC_API_KEY",
              "ANTHROPIC_API_KEY_OLD",
              ...CLOUDRU_CLEAR_ENV_EXTRAS,
            ],
          },
        },
      },
    },
  };

  // -----------------------------------------------------------------------
  // 4. Write .env, Docker Compose, .gitignore
  // -----------------------------------------------------------------------

  const workspaceDir = params.agentDir ?? process.cwd();

  await writeCloudruEnvFile({ apiKey, workspaceDir });
  await writeDockerComposeFile({
    workspaceDir,
    port: CLOUDRU_PROXY_PORT_DEFAULT,
    preset,
  });
  await ensureGitignoreEntries({
    workspaceDir,
    entries: [".env", CLOUDRU_COMPOSE_FILENAME],
  });

  // -----------------------------------------------------------------------
  // 5. Pre-flight proxy health check (non-blocking)
  // -----------------------------------------------------------------------

  const health = await checkProxyHealth(proxyUrl);
  if (!health.ok) {
    await params.prompter.note(
      `Cloud.ru proxy at ${proxyUrl} is not reachable. ` +
        `Start it with: docker compose -f ${CLOUDRU_COMPOSE_FILENAME} up -d`,
      "Proxy not running",
    );
  } else {
    await params.prompter.note(
      `Cloud.ru proxy healthy (${health.latencyMs}ms). Model: ${preset.label}`,
      "Proxy connected",
    );
  }

  return { config: nextConfig };
}
