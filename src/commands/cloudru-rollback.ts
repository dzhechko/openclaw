/**
 * Cloud.ru FM Configuration Rollback
 *
 * Idempotent rollback of all wizard-applied Cloud.ru FM configuration.
 *
 * Removes:
 * - agents.defaults.cliBackends["claude-cli"].env.ANTHROPIC_BASE_URL
 * - agents.defaults.cliBackends["claude-cli"].env.ANTHROPIC_API_KEY
 * - models.providers["cloudru-fm"]
 *
 * Does NOT remove:
 * - .env file (API key may be used for other purposes)
 * - agents.defaults.model (may have been set by user)
 * - Docker Compose file
 * - Docker container
 */

import { promises as fs } from "node:fs";

export async function rollbackCloudruFmConfig(
  configPath: string,
): Promise<{ rolled: boolean; reason?: string }> {
  let raw: string;
  try {
    raw = await fs.readFile(configPath, "utf-8");
  } catch {
    return { rolled: false, reason: "Config file not found" };
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { rolled: false, reason: "Config file is not valid JSON" };
  }

  let changed = false;

  // Remove cloudru-fm provider
  const models = config["models"] as Record<string, unknown> | undefined;
  if (models) {
    const providers = models["providers"] as
      | Record<string, unknown>
      | undefined;
    if (providers && "cloudru-fm" in providers) {
      delete providers["cloudru-fm"];
      changed = true;
      // Clean up empty providers object
      if (Object.keys(providers).length === 0) {
        delete models["providers"];
      }
    }
  }

  // Remove proxy env from claude-cli backend
  const agents = config["agents"] as Record<string, unknown> | undefined;
  const defaults = agents?.["defaults"] as
    | Record<string, unknown>
    | undefined;
  const cliBackends = defaults?.["cliBackends"] as
    | Record<string, unknown>
    | undefined;
  const claudeCli = cliBackends?.["claude-cli"] as
    | Record<string, unknown>
    | undefined;

  if (claudeCli) {
    const env = claudeCli["env"] as Record<string, string> | undefined;
    if (env) {
      if ("ANTHROPIC_BASE_URL" in env) {
        delete env["ANTHROPIC_BASE_URL"];
        changed = true;
      }
      if ("ANTHROPIC_API_KEY" in env) {
        delete env["ANTHROPIC_API_KEY"];
        changed = true;
      }
      // Clean up empty env
      if (Object.keys(env).length === 0) {
        delete claudeCli["env"];
      }
    }

    // Remove extended clearEnv (reset to default)
    if (claudeCli["clearEnv"]) {
      delete claudeCli["clearEnv"];
      changed = true;
    }

    // Clean up empty claude-cli
    if (Object.keys(claudeCli).length === 0 && cliBackends) {
      delete cliBackends["claude-cli"];
    }
  }

  if (!changed) {
    return { rolled: false, reason: "No Cloud.ru FM configuration found" };
  }

  const json = JSON.stringify(config, null, 2) + "\n";
  await fs.writeFile(configPath, json, { encoding: "utf-8", mode: 0o600 });
  return { rolled: true };
}
