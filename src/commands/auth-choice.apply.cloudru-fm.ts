import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import {
  formatApiKeyPreview,
  normalizeApiKeyInput,
  validateApiKeyInput,
} from "./auth-choice.api-key.js";
import { resolveCloudruModelPreset, writeCloudruEnvFile } from "./onboard-cloudru-fm.js";

/** Proxy base URL for the local cloud.ru FM proxy (default port). */
const CLOUDRU_PROXY_BASE_URL = "http://localhost:8082";

/** Sentinel value stored in the config so the Claude CLI backend has a non-empty key. */
const PROXY_SENTINEL_KEY = "not-a-real-key-proxy-only";

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
  const preset = resolveCloudruModelPreset(authChoice);

  // --- 1. Collect the cloud.ru API key -------------------------------------------

  let apiKey = "";
  let hasCredential = false;

  // Check opts (non-interactive CLI flag).
  const optsKey = (params.opts as Record<string, unknown> | undefined)?.cloudruApiKey;
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
              ANTHROPIC_API_KEY: PROXY_SENTINEL_KEY,
            },
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

  return { config: nextConfig };
}
