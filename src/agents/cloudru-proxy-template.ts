/**
 * Cloud.ru Proxy Docker Compose Template Generator
 *
 * Generates a security-hardened Docker Compose YAML for claude-code-proxy.
 * Single source of truth for the proxy container configuration.
 */

import {
  CLOUDRU_BASE_URL,
  CLOUDRU_PROXY_IMAGE,
  CLOUDRU_COMPOSE_FILENAME,
  type CloudruModelPreset,
} from "../config/cloudru-fm.constants.js";

export { CLOUDRU_COMPOSE_FILENAME };

export type ProxyComposeParams = {
  port: number;
  preset: CloudruModelPreset;
};

/**
 * Generate a security-hardened Docker Compose YAML string.
 *
 * Security features:
 * - Pinned image version (not :latest)
 * - Localhost-only binding (127.0.0.1)
 * - no-new-privileges, cap_drop: ALL, read_only
 * - Non-root user (1000:1000)
 * - Resource limits (512 MB RAM, 1 CPU)
 * - Health check (10s interval, 5s timeout, 3 retries)
 */
export function generateProxyDockerCompose(params: ProxyComposeParams): string {
  const { port, preset } = params;

  return `services:
  claude-code-proxy:
    image: ${CLOUDRU_PROXY_IMAGE}
    container_name: openclaw-cloudru-proxy
    ports:
      - "127.0.0.1:${port}:${port}"
    environment:
      OPENAI_API_KEY: "\${CLOUDRU_API_KEY}"
      OPENAI_BASE_URL: "${CLOUDRU_BASE_URL}"
      BIG_MODEL: "${preset.big}"
      MIDDLE_MODEL: "${preset.middle}"
      SMALL_MODEL: "${preset.small}"
      HOST: "0.0.0.0"
      PORT: "${port}"
      DISABLE_THINKING: "true"
    restart: unless-stopped
    user: "1000:1000"
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    read_only: true
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "1.0"
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:${port}/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 10s
`;
}
