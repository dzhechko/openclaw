/**
 * Cloud.ru FM model mapping for claude-code-proxy.
 *
 * Maps Claude Code tier names (opus/sonnet/haiku) to cloud.ru model IDs
 * via the proxy's BIG_MODEL / MIDDLE_MODEL / SMALL_MODEL environment
 * variables. The fallback chain operates at the Claude tier level --
 * never at the cloud.ru model level (CRITICAL-006, X-003).
 *
 * Tier mapping:
 *   opus   -> BIG_MODEL    (proxy env)
 *   sonnet -> MIDDLE_MODEL (proxy env)
 *   haiku  -> SMALL_MODEL  (proxy env)
 */

import {
  CLOUDRU_FM_MODELS,
  CLOUDRU_FM_PRESETS,
  type CloudruModelPreset,
} from "../config/cloudru-fm.constants.js";

/** Claude Code tier slot names used by the proxy. */
export type CloudruModelTier = "big" | "middle" | "small";

/** Describes a single tier mapping entry. */
export interface CloudruModelMapping {
  /** Claude Code model alias (opus, sonnet, haiku). */
  claudeName: "opus" | "sonnet" | "haiku";
  /** Full cloud.ru model ID assigned to this tier slot. */
  cloudruModel: string;
  /** Proxy tier slot. */
  tier: CloudruModelTier;
  /** Optional fallback model ID if the primary is unavailable. */
  fallback?: string;
  /** Whether this model is on the free tier. */
  free: boolean;
}

/**
 * Named preset groups keyed by a short identifier.
 * Each preset defines BIG/MIDDLE/SMALL model assignments.
 */
export const CLOUDRU_MODEL_PRESETS = {
  "glm47-full": {
    big: CLOUDRU_FM_MODELS["glm-4.7"],
    middle: CLOUDRU_FM_MODELS["glm-4.7-flashx"],
    small: CLOUDRU_FM_MODELS["glm-4.7-flash"],
  },
  "glm47-flash-free": {
    big: CLOUDRU_FM_MODELS["glm-4.7-flash"],
    middle: CLOUDRU_FM_MODELS["glm-4.7-flash"],
    small: CLOUDRU_FM_MODELS["glm-4.7-flash"],
  },
  "qwen3-coder": {
    big: CLOUDRU_FM_MODELS["qwen3-coder-480b"],
    middle: CLOUDRU_FM_MODELS["glm-4.7-flashx"],
    small: CLOUDRU_FM_MODELS["glm-4.7-flash"],
  },
} as const;

/**
 * Per-model fallback chains at the cloud.ru model level.
 * Used by the proxy for internal retry before returning an error
 * to Claude Code.  Claude Code's own fallback operates at the
 * tier level (opus -> sonnet -> haiku) and is independent of
 * these chains.
 */
export const CLOUDRU_FALLBACK_CHAINS: Record<string, readonly string[]> = {
  [CLOUDRU_FM_MODELS["glm-4.7"]]: [
    CLOUDRU_FM_MODELS["glm-4.7-flashx"],
    CLOUDRU_FM_MODELS["glm-4.7-flash"],
  ],
  [CLOUDRU_FM_MODELS["qwen3-coder-480b"]]: [
    CLOUDRU_FM_MODELS["glm-4.7"],
    CLOUDRU_FM_MODELS["glm-4.7-flash"],
  ],
  [CLOUDRU_FM_MODELS["glm-4.7-flashx"]]: [CLOUDRU_FM_MODELS["glm-4.7-flash"]],
  [CLOUDRU_FM_MODELS["glm-4.7-flash"]]: [], // Terminal -- no further fallback
};

/**
 * Returns the ordered fallback chain for a given cloud.ru model ID.
 * If the model has no known chain, returns an empty array.
 */
export function getCloudruFallbackChain(model: string): readonly string[] {
  return CLOUDRU_FALLBACK_CHAINS[model] ?? [];
}

/**
 * Resolves a wizard AuthChoice value to its corresponding model preset.
 * Returns `undefined` for unrecognized choices.
 */
export function resolveCloudruPreset(authChoice: string): CloudruModelPreset | undefined {
  return CLOUDRU_FM_PRESETS[authChoice];
}
