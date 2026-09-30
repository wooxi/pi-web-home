import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_DIR } from "./config.ts";

/**
 * Approval gating for spawned pi sessions, backed by the `pi-auto-approval`
 * extension, vendored into this repository.
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
 * The extension is vendored into this repository at
 * `extensions/pi-auto-approval/` (Apache-2.0, from Europa2061/pi-auto-approval).
 * Returns the entry file's absolute path, or null when the checkout is
 * incomplete — sessions then run without the approval gate and the API
 * reports `available: false`.
 */
export function approvalExtensionEntry(): string | null {
  const entry = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../extensions/pi-auto-approval/index.ts",
  );
  return existsSync(entry) ? entry : null;
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

/** The effective approval state: mode plus the classifier model reference. */
export interface ApprovalSettings {
  mode: ApprovalMode;
  /** `provider/id`, or null for "follow the session model". */
  classifierModel: string | null;
}

/** The effective state: `enabled: false` reads as `off`. Unknown → defaults. */
export function readApprovalSettings(): ApprovalSettings {
  const parsed = parseConfigFile(approvalConfigPath());
  if (parsed.enabled === false) return { mode: "off", classifierModel: null };
  return {
    mode: parsed.mode === "auto" ? "auto" : "fallback",
    classifierModel: typeof parsed.classifierModel === "string" && parsed.classifierModel.length > 0
      ? parsed.classifierModel
      : null,
  };
}

/**
 * Set the classifier model without touching the mode. `null` means "follow
 * the active session model".
 */
export function writeClassifierModel(value: string | null): void {
  const path = approvalConfigPath();
  const current = parseConfigFile(path);
  const next = {
    ...DEFAULT_CONFIG,
    ...current,
    classifierModel: value,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, "\t")}\n`);
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
  // Keep the extension's JSONL audit log next to the rest of the app state
  // instead of inside the vendored source tree.
  process.env.PI_AUTO_APPROVAL_LOGS_DIR = join(DATA_DIR, "approval-logs");
  if (!existsSync(approvalConfigPath())) {
    writeApprovalMode("fallback");
  }
}
