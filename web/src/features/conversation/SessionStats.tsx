import { useEffect, useRef, useState } from "react";
import { Glyph } from "../../components/dsh-icons.tsx";
import { GaugeIcon } from "../../components/icons.tsx";
import { formatRunDuration, formatTokens, formatTurnDuration } from "../../lib/duration.ts";
import { StatPanel, StatRow } from "./StatPanel.tsx";
import {
  formatCost,
  formatExactCount,
  formatLatencySeconds,
  formatTokensPerSecond,
  type SessionStats as SessionStatsData,
} from "./stats-model.ts";
import styles from "./SessionStats.module.css";
import { useT } from "../../lib/app-state.ts";

/** Which pill's panel is open. One at a time, as dsh's `openPill` does it. */
type OpenPanel = "time" | "usage" | null;

/**
 * The two figures dsh keeps under the composer: how much work the session did
 * and what it cost.
 *
 * Left pill is time — turns, steps, and decode speed; right pill is tokens —
 * the billed total and the cache-hit share. Both open a details panel on click,
 * except the time pill, which stays a plain label when this client measured no
 * wall times (a session loaded from disk); dsh renders the same fallback.
 */
export function SessionStats({ stats }: { stats: SessionStatsData }) {
  const t = useT();
  const [open, setOpen] = useState<OpenPanel>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // One listener pair for both panels: dsh dismisses on an outside pointer or
  // Escape too, and closing on Escape matters because the pills are keyboard
  // reachable.
  useEffect(() => {
    if (open === null) return;
    const onPointerDown = (event: PointerEvent): void => {
      const root = rootRef.current;
      if (root !== null && event.target instanceof Node && root.contains(event.target)) return;
      setOpen(null);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // dsh hides the whole row until the session has a step or a token.
  if (stats.steps === 0 && stats.totalTokens === 0) return null;

  const setOpenIf = (panel: Exclude<OpenPanel, null>) => (value: boolean) => {
    setOpen(value ? panel : null);
  };

  return (
    <div className={styles.root} ref={rootRef} data-composer-stats>
      {stats.steps > 0 ? (
        <TimePill stats={stats} open={open === "time"} onOpen={setOpenIf("time")} />
      ) : null}
      {stats.totalTokens > 0 ? (
        <UsagePill stats={stats} open={open === "usage"} onOpen={setOpenIf("usage")} />
      ) : null}
    </div>
  );
}

function TimePill({
  stats,
  open,
  onOpen,
}: {
  stats: SessionStatsData;
  open: boolean;
  onOpen: (open: boolean) => void;
}) {
  const t = useT();
  const { timing } = stats;
  const counts = t("stats.counts", { turns: stats.turns, steps: stats.steps });
  const tps =
    stats.tokensPerSecond === null
      ? null
      : `${formatTokensPerSecond(stats.tokensPerSecond)} tok/s`;
  // Ported from pi-turn-metrics' TUI status line: once this client has measured
  // wall times, the pill carries the LLM / Tool / TTFT figures inline, not just
  // inside the detail panel. The three segments hide below the pill's roomy
  // width (the compact style the extension switches to on narrow terminals).
  const measured =
    timing.llmMs > 0 || timing.toolMs > 0 || timing.ttftSteps > 0 || timing.decodeMs > 0;
  const label = (
    <span className={styles.label}>
      {counts}
      {measured ? (
        <span className={styles.timing}>
          {timing.llmMs > 0 ? (
            <>
              <span className={styles.sep} aria-hidden>·</span>
              {`LLM ${formatTurnDuration(timing.llmMs, t)}`}
            </>
          ) : null}
          {timing.toolMs > 0 ? (
            <>
              <span className={styles.sep} aria-hidden>·</span>
              {`Tool ${formatTurnDuration(timing.toolMs, t)}`}
            </>
          ) : null}
          {timing.ttftSteps > 0 ? (
            <>
              <span className={styles.sep} aria-hidden>·</span>
              {`TTFT ${formatTurnDuration(timing.ttftMs / timing.ttftSteps, t)}`}
            </>
          ) : null}
        </span>
      ) : null}
      {tps === null ? null : (
        <>
          <span className={styles.sep} aria-hidden>·</span>
          {tps}
        </>
      )}
    </span>
  );

  if (!measured) {
    return (
      <span className={styles.anchor}>
        <span className={styles.pill}>
          <GaugeIcon width={14} height={14} />
          {label}
        </span>
      </span>
    );
  }

  return (
    <span className={styles.anchor}>
      <button
        type="button"
        className={styles.pill}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={tps === null ? counts : `${counts} · ${tps}`}
        onClick={() => onOpen(!open)}
      >
        <GaugeIcon width={14} height={14} />
        {label}
      </button>
      {open ? (
        <StatPanel icon={<Glyph name="clock" size={14} />} title={t("stats.title")}>
          {timing.llmMs > 0 ? (
            <StatRow label={t("stats.modelTime")} value={formatRunDuration(timing.llmMs, t)} />
          ) : null}
          {timing.toolMs > 0 ? (
            <StatRow label={t("stats.toolTime")} value={formatRunDuration(timing.toolMs, t)} />
          ) : null}
          {timing.ttftSteps > 0 ? (
            <StatRow
              label={t("stats.ttft")}
              value={formatLatencySeconds(timing.ttftMs / timing.ttftSteps, t)}
            />
          ) : null}
          {timing.decodeMs > 0 ? (
            <StatRow
              label={t("stats.tps")}
              value={`${formatTokensPerSecond(stats.tokensPerSecond ?? 0)} tok/s`}
            />
          ) : null}
        </StatPanel>
      ) : null}
    </span>
  );
}

function UsagePill({
  stats,
  open,
  onOpen,
}: {
  stats: SessionStatsData;
  open: boolean;
  onOpen: (open: boolean) => void;
}) {
  const t = useT();
  const total = `${formatTokens(stats.totalTokens)} tok`;
  const cacheHit = stats.cacheHitPercent === null ? null : t("stats.cacheHitPercent", { percent: stats.cacheHitPercent });
  const cost = stats.cost !== null && stats.cost > 0 ? formatCost(stats.cost) : null;
  const { usage } = stats;

  return (
    <span className={styles.anchor}>
      <button
        type="button"
        className={styles.pill}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={[total, cacheHit, cost].filter(Boolean).join(" · ")}
        onClick={() => onOpen(!open)}
      >
        <Glyph name="database" size={14} />
        <span className={styles.label}>
          {total}
          {cacheHit === null ? null : (
            <>
              <span className={styles.sep} aria-hidden>
                ·
              </span>
              {cacheHit}
            </>
          )}
          {cost === null ? null : (
            <>
              <span className={styles.sep} aria-hidden>
                ·
              </span>
              {cost}
            </>
          )}
        </span>
      </button>
      {open ? (
        <StatPanel
          icon={<Glyph name="database" size={14} />}
          title={t("stats.tokenUsage")}
          value={t("stats.usage", { total })}
        >
          {stats.model === null ? null : <StatRow label={t("stats.providerModel")} value={stats.model} route />}
          {stats.cacheHitPercent === null ? null : (
            <StatRow label={t("stats.cacheHit")} value={`${stats.cacheHitPercent}%`} />
          )}
          {stats.cost === null || stats.cost <= 0 ? null : (
            <StatRow label={t("stats.cost")} value={formatCost(stats.cost)} />
          )}
          <StatRow label={t("stats.uncachedInput")} value={tok(usage.input)} />
          <StatRow label={t("stats.cacheRead")} value={tok(usage.cacheRead)} />
          <StatRow label={t("stats.cacheWrite")} value={tok(usage.cacheWrite)} />
          <StatRow label={t("stats.output")} value={tok(usage.output)} />
        </StatPanel>
      ) : null}
    </span>
  );
}

function tok(count: number): string {
  return `${formatExactCount(count)} tok`;
}
