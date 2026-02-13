/**
 * Cloud.ru Foundation Models -- centralized constants.
 *
 * Single source of truth for model IDs, preset configurations,
 * proxy defaults, and sentinel values consumed by M2 (wizard)
 * and M4 (proxy lifecycle).
 *
 * Addresses: R019 (model-ID hardcoding), CRITICAL-006/007 (tier mapping),
 *            WARNING-010 (full model IDs), R013 (pinned image).
 */

/** Full cloud.ru model identifiers as they appear in the FM API. */
export const CLOUDRU_FM_MODELS = {
  "glm-4.7": "zai-org/GLM-4.7",
  "glm-4.7-flashx": "zai-org/GLM-4.7-FlashX",
  "glm-4.7-flash": "zai-org/GLM-4.7-Flash",
  "qwen3-coder-480b": "Qwen/Qwen3-Coder-480B-A35B-Instruct",
} as const;

export type CloudruModelId = (typeof CLOUDRU_FM_MODELS)[keyof typeof CLOUDRU_FM_MODELS];

/** A preset maps Claude tier slots (big/middle/small) to cloud.ru model IDs. */
export type CloudruModelPreset = {
  /** Cloud.ru model ID for BIG_MODEL (proxy tier: opus). */
  big: string;
  /** Cloud.ru model ID for MIDDLE_MODEL (proxy tier: sonnet). */
  middle: string;
  /** Cloud.ru model ID for SMALL_MODEL (proxy tier: haiku). */
  small: string;
  /** Human-readable label shown in the wizard. */
  label: string;
  /** Whether the default (big) model is on the free tier. */
  free: boolean;
};

/**
 * Three wizard-selectable presets.
 *
 * Invariant: `small` is always GLM-4.7-Flash (ADR-005).
 */
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

/** Default proxy port (localhost only). */
export const CLOUDRU_PROXY_PORT_DEFAULT = 8082;

/** Cloud.ru Foundation Models API base URL. */
export const CLOUDRU_BASE_URL = "https://foundation-models.api.cloud.ru/v1";

/** Pinned Docker image -- never use :latest (R013). */
export const CLOUDRU_PROXY_IMAGE = "legard/claude-code-proxy:v1.0.0";

/**
 * Sentinel value set as ANTHROPIC_API_KEY when routing through the proxy.
 * The proxy ignores this key; its purpose is to satisfy the claude CLI
 * requirement for a non-empty key while making it obvious the key is fake.
 */
export const CLOUDRU_PROXY_SENTINEL_KEY = "not-a-real-key-proxy-only";

/**
 * Additional env vars to clear in the cloudru-fm CLI backend override.
 *
 * Per blocking gap #2 fix, these are NOT added to DEFAULT_CLAUDE_BACKEND.
 * They are applied only via the user config written by the wizard handler
 * (auth-choice.apply.cloudru-fm.ts) so that non-cloudru backends remain
 * unaffected.
 */
export const CLOUDRU_CLEAR_ENV_EXTRAS: readonly string[] = [
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "GEMINI_API_KEY",
  "AWS_SECRET_ACCESS_KEY",
  "AZURE_OPENAI_API_KEY",
  "CLOUDRU_API_KEY",
] as const;
