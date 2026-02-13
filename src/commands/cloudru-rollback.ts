/**
 * Rollback utility for Cloud.ru FM wizard configuration.
 *
 * Resolves BLOCKING GAP #3 from REQUIREMENTS-VALIDATION.md:
 * "No rollback procedures defined."
 *
 * Removes all Cloud.ru FM-specific entries from the openclaw config file.
 * Safe to call multiple times (idempotent). Gracefully handles missing or
 * malformed config files.
 */

import fs from "node:fs";
import JSON5 from "json5";

/** Keys injected by the Cloud.ru FM wizard that should be removed on rollback. */
const CLOUDRU_ENV_KEYS = ["ANTHROPIC_BASE_URL", "ANTHROPIC_API_KEY"] as const;
const CLOUDRU_PROVIDER_KEY = "cloudru-fm";

/**
 * Remove Cloud.ru FM configuration from an openclaw.json config file.
 *
 * Specifically removes:
 * - `agents.defaults.cliBackends["claude-cli"].env.ANTHROPIC_BASE_URL`
 * - `agents.defaults.cliBackends["claude-cli"].env.ANTHROPIC_API_KEY`
 * - `models.providers["cloudru-fm"]`
 *
 * Does NOT remove:
 * - `agents.defaults.model` (may have been set by user independently)
 * - `.env` file (user may still want the API key for other uses)
 *
 * @param configPath - Absolute path to the openclaw.json file.
 * @throws {Error} If the file exists but cannot be parsed as JSON5.
 */
export async function rollbackCloudruFmConfig(configPath: string): Promise<void> {
  let raw: string;
  try {
    raw = await fs.promises.readFile(configPath, "utf-8");
  } catch {
    // File does not exist or is unreadable -- nothing to roll back.
    return;
  }

  let config: Record<string, unknown>;
  try {
    config = JSON5.parse(raw) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `Cannot parse config at ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!config || typeof config !== "object") {
    return;
  }

  let modified = false;

  // Remove proxy env entries from claude-cli backend.
  const agents = config.agents as Record<string, unknown> | undefined;
  const defaults = agents?.defaults as Record<string, unknown> | undefined;
  const cliBackends = defaults?.cliBackends as Record<string, Record<string, unknown>> | undefined;
  const claudeCli = cliBackends?.["claude-cli"];
  if (claudeCli?.env && typeof claudeCli.env === "object") {
    const env = claudeCli.env as Record<string, unknown>;
    for (const key of CLOUDRU_ENV_KEYS) {
      if (key in env) {
        delete env[key];
        modified = true;
      }
    }
    // Remove empty env object.
    if (Object.keys(env).length === 0) {
      delete claudeCli.env;
    }
    // Remove empty claude-cli entry.
    if (Object.keys(claudeCli).length === 0 && cliBackends) {
      delete cliBackends["claude-cli"];
    }
  }

  // Remove cloudru-fm model provider.
  const models = config.models as Record<string, unknown> | undefined;
  const providers = models?.providers as Record<string, unknown> | undefined;
  if (providers && CLOUDRU_PROVIDER_KEY in providers) {
    delete providers[CLOUDRU_PROVIDER_KEY];
    modified = true;
  }

  if (!modified) {
    return;
  }

  const json = JSON.stringify(config, null, 2).trimEnd().concat("\n");
  await fs.promises.writeFile(configPath, json, { encoding: "utf-8", mode: 0o600 });
}
