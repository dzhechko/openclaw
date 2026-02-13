import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import {
  formatApiKeyPreview,
  normalizeApiKeyInput,
  validateApiKeyInput,
} from "./auth-choice.api-key.js";
import { writeCloudruEnvFile } from "./onboard-cloudru-fm.js";
import {
  CLOUDRU_FM_PRESETS,
  CLOUDRU_PROXY_PORT_DEFAULT,
  CLOUDRU_PROXY_SENTINEL_KEY,
  CLOUDRU_CLEAR_ENV_EXTRAS,
  type CloudruModelPreset,
} from "../config/cloudru-fm.constants.js";
import { checkProxyHealth } from "../agents/cloudru-proxy-health.js";

/** Proxy base URL for the local cloud.ru FM proxy. */
const CLOUDRU_PROXY_BASE_URL = `http://localhost:${CLOUDRU_PROXY_PORT_DEFAULT}`;

/**
 * Auth-choice handler for `cloudru-fm-*` choices.
 *
 * Follows the established `applyAuthChoice<Provider>` pattern:
 * returns `null` when the choice does not belong to this handler,
 * otherwise applies provider config, CLI backend env, model selection,
 * and persists the real API key to `.env` (never to `openclaw.json`).
 */
export async function applyAuthChoiceCloudruFm(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  const { authChoice } = params;

  // Guard: only handle cloudru-fm-* choices.
  if (
    authChoice !== "cloudru-fm-glm47" &&
    authChoice !== "cloudru-fm-flash" &&
    authChoice !== "cloudru-fm-qwen"
  ) {
    return null;
  }

  let nextConfig = params.config;
  const preset: CloudruModelPreset | undefined = CLOUDRU_FM_PRESETS[authChoice];
  if (!preset) {
    return null;
  }

  // --- 1. Collect the cloud.ru API key -------------------------------------------

  let apiKey = "";
  let hasCredential = false;

  // Check opts (non-interactive CLI flag).
  const optsKey = params.opts?.cloudruApiKey;
  if (typeof optsKey === "string" && optsKey.trim()) {
    apiKey = normalizeApiKeyInput(optsKey);
    hasCredential = true;
  }

  // Check process environment.
  if (!hasCredential) {
    const envValue = process.env.CLOUDRU_API_KEY?.trim();
    if (envValue) {
      const useExisting = await params.prompter.confirm({
        message: `Use existing CLOUDRU_API_KEY (env, ${formatApiKeyPreview(envValue)})?`,
        initialValue: true,
      });
      if (useExisting) {
        apiKey = envValue;
        hasCredential = true;
      }
    }
  }

  // Prompt interactively.
  if (!hasCredential) {
    await params.prompter.note(
      [
        "Cloud.ru Foundation Models provides access to GLM-4.7, Qwen3-Coder, and more.",
        "Get your API key at: https://cloud.ru/ru/ai-foundation-models",
        `Selected preset: ${preset.label}`,
      ].join("\n"),
      "Cloud.ru FM",
    );
    const key = await params.prompter.text({
      message: "Enter cloud.ru API key",
      validate: validateApiKeyInput,
    });
    apiKey = normalizeApiKeyInput(String(key));
  }

  // --- 2. Apply provider config to openclaw.json ---------------------------------

  const providerId = "cloudru-fm";
  const providers = nextConfig.models?.providers ?? {};

  nextConfig = {
    ...nextConfig,
    models: {
      ...nextConfig.models,
      mode: nextConfig.models?.mode ?? "merge",
      providers: {
        ...providers,
        [providerId]: {
          baseUrl: `${CLOUDRU_PROXY_BASE_URL}/v1`,
          api: "anthropic-messages" as const,
          models: [
            {
              id: "opus",
              name: `${preset.big} (via proxy)`,
              contextWindow: 128_000,
              maxTokens: 16_384,
              input: ["text"] as ["text"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              reasoning: false,
            },
            {
              id: "sonnet",
              name: `${preset.middle} (via proxy)`,
              contextWindow: 128_000,
              maxTokens: 16_384,
              input: ["text"] as ["text"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              reasoning: false,
            },
            {
              id: "haiku",
              name: `${preset.small} (via proxy)`,
              contextWindow: 128_000,
              maxTokens: 16_384,
              input: ["text"] as ["text"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              reasoning: false,
            },
          ],
        },
      },
    },
  };

  // --- 3. Apply CLI backend env override -----------------------------------------

  nextConfig = {
    ...nextConfig,
    agents: {
      ...nextConfig.agents,
      defaults: {
        ...nextConfig.agents?.defaults,
        cliBackends: {
          ...nextConfig.agents?.defaults?.cliBackends,
          "claude-cli": {
            ...nextConfig.agents?.defaults?.cliBackends?.["claude-cli"],
            command:
              nextConfig.agents?.defaults?.cliBackends?.["claude-cli"]?.command ?? "claude",
            env: {
              ...nextConfig.agents?.defaults?.cliBackends?.["claude-cli"]?.env,
              ANTHROPIC_BASE_URL: CLOUDRU_PROXY_BASE_URL,
              ANTHROPIC_API_KEY: CLOUDRU_PROXY_SENTINEL_KEY,
            },
            clearEnv: [
              "ANTHROPIC_API_KEY",
              "ANTHROPIC_API_KEY_OLD",
              ...CLOUDRU_CLEAR_ENV_EXTRAS,
            ],
          },
        },
        // --- 4. Set primary model and fallbacks ----------------------------------
        model: {
          primary: "claude-cli/opus",
          fallbacks: ["claude-cli/sonnet", "claude-cli/haiku"],
        },
      },
    },
  };

  // --- 5. Store API key to .env (NOT openclaw.json) ------------------------------

  const workspaceDir =
    nextConfig.agents?.defaults?.workspace ?? process.cwd();
  await writeCloudruEnvFile({ apiKey, workspaceDir });

  // --- 6. Pre-flight proxy health check (CRIT-01) -------------------------------
  // Non-blocking: warn user if proxy is not reachable, but don't fail onboarding.
  const health = await checkProxyHealth(CLOUDRU_PROXY_BASE_URL);
  if (!health.ok) {
    await params.prompter.note(
      [
        "Warning: proxy is not yet reachable at " + CLOUDRU_PROXY_BASE_URL,
        "Start it with: docker compose -f docker-compose.cloudru-proxy.yml up -d",
        `Error: ${health.error ?? "unknown"}`,
      ].join("\n"),
      "Proxy Status",
    );
  }

  return { config: nextConfig };
}
