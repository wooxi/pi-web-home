import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { DATA_DIR } from "./config.ts";

/**
 * Approval gating for spawned pi sessions, backed by the `pi-auto-approval`
 * extension (an npm dependency of this package).
 *
 * The server owns the extension's config file: it is written under
 * `DATA_DIR`, passed to every spawned pi process through
 * `PI_AUTO_APPROVAL_CONFIG_PATH`, and the entry path is handed to pi's `-e`
 * flag so the extension loads into each session whether or not the user has
 * installed it themselves.
 *
 * Switching the mode means two things, because the extension reads its config
 * once per process: the file is rewritten for sessions that spawn later, and
 * every live session receives `/auto-approval <mode>` — pi executes extension
 * commands on prompt submission (even mid-run), and the command persists the
 * same file.
 */

export type ApprovalMode = "off" | "fallback" | "auto";

const VALID_MODES: readonly ApprovalMode[] = ["off", "fallback", "auto"];

export function isApprovalMode(value: unknown): value is ApprovalMode {
  return typeof value === "string" && (VALID_MODES as readonly string[]).includes(value);
}

/** Where the extension's config lives, honoring its own env overrides. */
export function approvalConfigPath(): string {
  return (
    process.env.PI_AUTO_APPROVAL_CONFIG_PATH?.trim() ||
    join(DATA_DIR, "auto-approval-config.jsonc")
  );
}

/**
 * The extension entry (`index.ts`) inside this package's dependency tree, or
 * null when the package is missing — sessions then run without the approval
 * gate and the API reports `available: false`.
 */
export function approvalExtensionEntry(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const entry = require.resolve("pi-auto-approval");
    return typeof entry === "string" && entry.length > 0 ? entry : null;
  } catch {
    return null;
  }
}

/** The extension's own defaults, with `enabled` flipped on (web-first UX). */
const DEFAULT_CONFIG = {
  enabled: true,
  mode: "fallback",
  classifierModel: null,
  approvalTimeoutSeconds: 30,
  classifierTimeoutSeconds: 90,
  maxConsecutiveDenials: 3,
  safeCommandAllowlist: [] as string[],
  allow: [] as string[],
  deny: [] as string[],
  environment: "",
  audit: true,
};

/** Strip the JSONC comments the extension's own config writer may leave. */
function parseConfigFile(path: string): Record<string, unknown> {
  try {
    const raw = readFileSync(path, "utf8");
    const stripped = raw
      .replace(/\/\*[\S\s]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      // Hand-edited configs often keep a trailing comma; accept them.
      .replace(/,(\s*[}\]])/g, "$1");
    // Malformed JSON is treated like a missing file: callers fall back to
    // defaults rather than blocking session spawn on a bad hand-edit.
    return JSON.parse(stripped) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** The effective mode: `enabled: false` reads as `off`. Unknown → fallback. */
export function readApprovalMode(): ApprovalMode {
  try {
    const parsed = parseConfigFile(approvalConfigPath());
    if (parsed.enabled === false) return "off";
    return parsed.mode === "auto" ? "auto" : "fallback";
  } catch {
    return "fallback";
  }
}

/**
 * Rewrite the config with one mode selected. Everything else the file carried
 * (allowlists, classifier model, timeouts) is preserved; missing fields get
 * the defaults above.
 */
export function writeApprovalMode(mode: ApprovalMode): void {
  const path = approvalConfigPath();
  const current = parseConfigFile(path);
  const next = {
    ...DEFAULT_CONFIG,
    ...current,
    enabled: mode !== "off",
    mode: mode === "off" ? "fallback" : mode,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, "\t")}\n`);
}

/**
 * Wire the environment before any session spawns: the config path env the
 * extension reads, plus a default file so a fresh install starts in the
 * recommended `fallback` mode (smart approval, human fallback in the UI).
 */
export function ensureApprovalEnvironment(): void {
  process.env.PI_AUTO_APPROVAL_CONFIG_PATH = approvalConfigPath();
  if (!existsSync(approvalConfigPath())) {
    writeApprovalMode("fallback");
  }
}
