import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  approvalConfigPath,
  ensureApprovalEnvironment,
  isApprovalMode,
  readApprovalMode,
  writeApprovalMode,
} from "./approval.ts";

let configRoot: string;

beforeEach(async () => {
  configRoot = await realpath(await mkdtemp(join(tmpdir(), "piws-approval-")));
  process.env.PI_AUTO_APPROVAL_CONFIG_PATH = join(configRoot, "auto-approval-config.jsonc");
});

afterEach(async () => {
  delete process.env.PI_AUTO_APPROVAL_CONFIG_PATH;
  await rm(configRoot, { recursive: true, force: true });
});

describe("approval config", () => {
  it("honors the PI_AUTO_APPROVAL_CONFIG_PATH override", () => {
    expect(approvalConfigPath()).toBe(join(configRoot, "auto-approval-config.jsonc"));
  });

  it("reads fallback when no config file exists yet", () => {
    expect(readApprovalMode()).toBe("fallback");
  });

  it("ensureApprovalEnvironment sets the env and writes the default config", async () => {
    delete process.env.PI_AUTO_APPROVAL_CONFIG_PATH;
    ensureApprovalEnvironment();
    expect(process.env.PI_AUTO_APPROVAL_CONFIG_PATH).toContain("auto-approval-config.jsonc");
    expect(readApprovalMode()).toBe("fallback");
    const parsed = JSON.parse(await readFile(approvalConfigPath(), "utf8")) as Record<string, unknown>;
    expect(parsed.enabled).toBe(true);
    expect(parsed.mode).toBe("fallback");
    expect(parsed.audit).toBe(true);
  });

  it("writes and reads each mode", async () => {
    writeApprovalMode("auto");
    expect(readApprovalMode()).toBe("auto");
    writeApprovalMode("fallback");
    expect(readApprovalMode()).toBe("fallback");
    writeApprovalMode("off");
    expect(readApprovalMode()).toBe("off");
    const parsed = JSON.parse(await readFile(approvalConfigPath(), "utf8")) as Record<string, unknown>;
    // `off` keeps the file's mode a valid one — disabling is `enabled: false`.
    expect(parsed.enabled).toBe(false);
    expect(parsed.mode).toBe("fallback");
  });

  it("preserves fields the extension owns, including JSONC comments", async () => {
    await writeFile(
      approvalConfigPath(),
      `{\n\t// classifier picked for cost\n\t"classifierModel": "provider/cheap",\n\t"allow": ["read", "glob"],\n}`,
    );
    writeApprovalMode("auto");
    const parsed = JSON.parse(await readFile(approvalConfigPath(), "utf8")) as Record<string, unknown>;
    expect(parsed.classifierModel).toBe("provider/cheap");
    expect(parsed.allow).toEqual(["read", "glob"]);
    expect(parsed.enabled).toBe(true);
    expect(parsed.mode).toBe("auto");
  });

  it("recovers from a corrupted config file", async () => {
    await writeFile(approvalConfigPath(), "{ not json");
    expect(readApprovalMode()).toBe("fallback");
    writeApprovalMode("auto");
    expect(readApprovalMode()).toBe("auto");
  });
});

describe("isApprovalMode", () => {
  it("accepts the three modes and rejects everything else", () => {
    expect(isApprovalMode("off")).toBe(true);
    expect(isApprovalMode("fallback")).toBe(true);
    expect(isApprovalMode("auto")).toBe(true);
    expect(isApprovalMode("yolo")).toBe(false);
    expect(isApprovalMode(undefined)).toBe(false);
    expect(isApprovalMode(1)).toBe(false);
  });
});
