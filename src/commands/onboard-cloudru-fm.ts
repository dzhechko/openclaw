import fs from "node:fs/promises";
import path from "node:path";
import {
  CLOUDRU_FM_PRESETS,
  CLOUDRU_PROXY_PORT_DEFAULT,
  type CloudruModelPreset,
} from "../config/cloudru-fm.constants.js";
import {
  generateProxyDockerCompose,
  CLOUDRU_COMPOSE_FILENAME,
} from "../agents/cloudru-proxy-template.js";
import type { AuthChoice } from "./onboard-types.js";

// Re-export for convenience.
export type { CloudruModelPreset } from "../config/cloudru-fm.constants.js";

/**
 * Resolves an AuthChoice to the corresponding Cloud.ru FM model preset.
 * Uses CLOUDRU_FM_PRESETS from the centralized constants file (single source of truth).
 */
export function resolveCloudruModelPreset(choice: AuthChoice): CloudruModelPreset {
  const preset = CLOUDRU_FM_PRESETS[choice];
  if (!preset) {
    throw new Error(`Unknown cloud.ru FM preset: ${choice}`);
  }
  return preset;
}

/**
 * Generates and writes a Docker Compose file for the cloud.ru FM proxy.
 * Delegates to `generateProxyDockerCompose` from cloudru-proxy-template.ts
 * (single source of truth for the template).
 */
export async function writeDockerComposeFile(params: {
  workspaceDir: string;
  preset: CloudruModelPreset;
  port?: number;
}): Promise<string> {
  const yaml = generateProxyDockerCompose({
    preset: params.preset,
    port: params.port ?? CLOUDRU_PROXY_PORT_DEFAULT,
  });
  const filePath = path.join(params.workspaceDir, CLOUDRU_COMPOSE_FILENAME);
  await fs.writeFile(filePath, yaml, "utf-8");
  return filePath;
}

/**
 * Writes (or overwrites) a `.env` file in the workspace with the Cloud.ru API key.
 * The file is also added to `.gitignore` via {@link ensureGitignoreEntries}.
 */
export async function writeCloudruEnvFile(params: {
  apiKey: string;
  workspaceDir: string;
}): Promise<void> {
  const envPath = path.join(params.workspaceDir, ".env");
  let existing = "";
  try {
    existing = await fs.readFile(envPath, "utf-8");
  } catch {
    // File does not exist yet — start fresh.
  }

  const lines = existing.split("\n");
  const keyLine = `CLOUDRU_API_KEY=${params.apiKey}`;
  const idx = lines.findIndex((l) => l.startsWith("CLOUDRU_API_KEY="));
  if (idx >= 0) {
    lines[idx] = keyLine;
  } else {
    lines.push(keyLine);
  }

  const content = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  await fs.writeFile(envPath, content, "utf-8");

  await ensureGitignoreEntries({
    workspaceDir: params.workspaceDir,
    entries: [".env", "docker-compose.cloudru-proxy.yml"],
  });
}

/**
 * Idempotently adds entries to the workspace `.gitignore`.
 * Entries that already appear (exact line match) are skipped.
 */
export async function ensureGitignoreEntries(params: {
  workspaceDir: string;
  entries: string[];
}): Promise<void> {
  const gitignorePath = path.join(params.workspaceDir, ".gitignore");
  let existing = "";
  try {
    existing = await fs.readFile(gitignorePath, "utf-8");
  } catch {
    // File does not exist yet.
  }

  const existingLines = new Set(existing.split("\n").map((l) => l.trim()));
  const toAdd = params.entries.filter((entry) => !existingLines.has(entry));
  if (toAdd.length === 0) {
    return;
  }

  const suffix = existing.endsWith("\n") || existing === "" ? "" : "\n";
  const appended = existing + suffix + toAdd.join("\n") + "\n";
  await fs.writeFile(gitignorePath, appended, "utf-8");
}
