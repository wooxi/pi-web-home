import { useEffect, useMemo, useState } from "react";
import { actions, useT } from "../../lib/app-state.ts";
import { api, type ApprovalMode, type ApprovalState } from "../../lib/api.ts";
import { SettingsGroup, SettingsRow, SettingsSelect } from "./SettingsRow.tsx";

/**
 * The approval-gate section: mode and classifier model.
 *
 * Both live in one config file the vendored pi-auto-approval extension reads,
 * and every write fans out to the live sessions, so flipping anything here is
 * effective immediately — no restart, no reload.
 *
 * The classifier list comes from `models.json` via the providers API, which
 * reads the files directly: no pi process has to be cold-started to fill it.
 */
export function ApprovalSection({ className }: { className?: string }) {
  const t = useT();
  const [state, setState] = useState<ApprovalState | null>(null);
  const [providers, setProviders] = useState<
    readonly { id: string; models: readonly { id: string; name?: string }[] }[]
  >([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getApproval().then(setState).catch(() => setState(null));
    api
      .getModels()
      .then((view) => setProviders(view.providers.filter((provider) => provider.configured)))
      .catch(() => setProviders([]));
  }, []);

  const classifierOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [
      { value: "", label: t("approval.classifierCurrent") },
    ];
    for (const provider of providers) {
      for (const entry of provider.models) {
        const ref = `${provider.id}/${entry.id}`;
        options.push({ value: ref, label: `${entry.name ?? entry.id}（${provider.id}）` });
      }
    }
    return options;
  }, [providers, t]);

  if (state === null) return null;

  const save = async (patch: { mode?: ApprovalMode; classifierModel?: string | null }): Promise<void> => {
    setBusy(true);
    try {
      const next = await api.updateApproval(patch);
      setState(next);
    } catch (err) {
      actions.setNotice((err as Error).message);
      api.getApproval().then(setState).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const modeOptions = (["fallback", "auto", "off"] as const).map((mode) => ({
    value: mode,
    label: t(`approval.${mode}` as const),
  }));

  return (
    <div className={className}>
    <SettingsGroup title={t("settings.approval.title")}>
      <SettingsRow title={t("approval.menuLabel")} description={t("settings.approval.modeNote")}>
        <SettingsSelect
          value={state.mode}
          options={modeOptions}
          disabled={busy}
          label={t("approval.menuLabel")}
          onChange={(mode) => void save({ mode })}
        />
      </SettingsRow>
      <SettingsRow title={t("approval.classifierTitle")} description={t("settings.approval.classifierNote")}>
        <SettingsSelect
          value={state.classifierModel ?? ""}
          options={classifierOptions}
          disabled={busy || providers.length === 0}
          label={t("approval.classifierTitle")}
          onChange={(value) => void save({ classifierModel: value.length > 0 ? value : null })}
        />
      </SettingsRow>
    </SettingsGroup>
    </div>
  );
}
