/**
 * Cloud.ru Foundation Models — Constants & Presets
 *
 * Single Source of Truth for all Cloud.ru FM integration constants.
 * Every other file in the integration imports from here.
 */

// ---------------------------------------------------------------------------
// Model IDs (full cloud.ru API identifiers)
// ---------------------------------------------------------------------------

export const CLOUDRU_FM_MODELS = {
  "glm-4.7": "zai-org/GLM-4.7",
  "glm-4.7-flashx": "zai-org/GLM-4.7-FlashX",
  "glm-4.7-flash": "zai-org/GLM-4.7-Flash",
  "qwen3-coder-480b": "Qwen/Qwen3-Coder-480B-A35B-Instruct",
} as const;

export type CloudruModelId = (typeof CLOUDRU_FM_MODELS)[keyof typeof CLOUDRU_FM_MODELS];

// ---------------------------------------------------------------------------
// Preset type
// ---------------------------------------------------------------------------

export type CloudruModelPreset = {
  /** Full cloud.ru model ID for opus / BIG_MODEL tier */
  big: string;
  /** Full cloud.ru model ID for sonnet / MIDDLE_MODEL tier */
  middle: string;
  /** Full cloud.ru model ID for haiku / SMALL_MODEL tier */
  small: string;
  /** Human-readable label shown in wizard */
  label: string;
  /** Whether the default model is free tier */
  free: boolean;
};

// ---------------------------------------------------------------------------
// Presets (wizard choices → model tiers)
// ---------------------------------------------------------------------------

export const CLOUDRU_FM_PRESETS: Record<string, CloudruModelPreset> = {
  "cloudru-fm-glm47": {
    big: CLOUDRU_FM_MODELS["glm-4.7"],
    middle: CLOUDRU_FM_MODELS["glm-4.7-flashx"],
    small: CLOUDRU_FM_MODELS["glm-4.7-flash"],
    label: "GLM-4.7 (Full)",
    free: false,
  },
  "cloudru-fm-flash": {
    big: CLOUDRU_FM_MODELS["glm-4.7-flash"],
    middle: CLOUDRU_FM_MODELS["glm-4.7-flash"],
    small: CLOUDRU_FM_MODELS["glm-4.7-flash"],
    label: "GLM-4.7-Flash (Free)",
    free: true,
  },
  "cloudru-fm-qwen": {
    big: CLOUDRU_FM_MODELS["qwen3-coder-480b"],
    middle: CLOUDRU_FM_MODELS["glm-4.7-flashx"],
    small: CLOUDRU_FM_MODELS["glm-4.7-flash"],
    label: "Qwen3-Coder-480B",
    free: false,
  },
} as const;

// ---------------------------------------------------------------------------
// Proxy constants
// ---------------------------------------------------------------------------

export const CLOUDRU_PROXY_PORT_DEFAULT = 8082;
export const CLOUDRU_BASE_URL = "https://foundation-models.api.cloud.ru/v1";
export const CLOUDRU_PROXY_IMAGE = "legard/claude-code-proxy:v1.0.0";
export const CLOUDRU_PROXY_SENTINEL_KEY = "not-a-real-key-proxy-only";
export const CLOUDRU_COMPOSE_FILENAME = "docker-compose.cloudru-proxy.yml";

// ---------------------------------------------------------------------------
// Extended clearEnv — keys to remove from subprocess environment
// ---------------------------------------------------------------------------

export const CLOUDRU_CLEAR_ENV_EXTRAS: readonly string[] = [
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "GEMINI_API_KEY",
  "AWS_SECRET_ACCESS_KEY",
  "AZURE_OPENAI_API_KEY",
  "CLOUDRU_API_KEY",
] as const;
