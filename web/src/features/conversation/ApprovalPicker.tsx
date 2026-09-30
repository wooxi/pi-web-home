import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import clsx from "clsx";
import { CheckIcon } from "../../components/icons.tsx";
import { Glyph } from "../../components/dsh-icons.tsx";
import { actions, appStore, useT } from "../../lib/app-state.ts";
import { useStoreSelector } from "../../lib/store.ts";
import { api, type ApprovalMode, type ApprovalState } from "../../lib/api.ts";
import styles from "./ApprovalPicker.module.css";

const MODES: ApprovalMode[] = ["fallback", "auto", "off"];

/**
 * The approval-gate mode switch, sitting left of the model picker.
 *
 * The gate is the bundled pi-auto-approval extension: every tool call passes
 * its fast path, then an AI classifier, then (in smart mode) a human dialog
 * rendered by this very composer. The three modes are global — one config file
 * backs every session — so the control reads and writes server state directly
 * instead of anything session-local, and live sessions are synced by the
 * server (`/auto-approval <mode>` runs as a prompt, which pi executes
 * immediately even mid-run).
 */
export function ApprovalPicker() {
  const t = useT();
  const [state, setState] = useState<ApprovalState | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  /** Set while a switch request is in flight; the menu rows disable on it. */
  const [pending, setPending] = useState(false);

  const refresh = (): void => {
    api
      .getApproval()
      .then(setState)
      .catch(() => setState({ available: false, mode: "fallback", classifierModel: null }));
  };

  useEffect(refresh, []);

  // The extension announces every mode change it executes — including ones
  // made by a `/auto-approval` command typed in a session — through a notify.
  // That lands in the shared notice, so the pill can follow along.
  const notice = useStoreSelector(appStore, (state_) => state_.notice);
  useEffect(() => {
    if (notice !== null && notice.includes("auto-approval state:")) refresh();
  }, [notice]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      const root = rootRef.current;
      if (root !== null && event.target instanceof Node && root.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) menuRef.current?.focus();
  }, [open]);

  if (state === null || !state.available) return null;

  const choose = (mode: ApprovalMode): void => {
    if (pending || mode === state.mode) {
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    setPending(true);
    // Optimistic: the config write is fast, the fan-out to live sessions is
    // what may take a moment, and a stale pill is worse than a bold one.
    setState({ available: true, mode, classifierModel: state.classifierModel });
    api
      .updateApproval({ mode })
      .then((next) => setState(next))
      .catch((err: Error) => {
        refresh();
        actions.setNotice(err.message);
      })
      .finally(() => setPending(false));
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((current) => (current + delta + MODES.length) % MODES.length);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const mode = MODES[highlight];
      if (mode) choose(mode);
    }
  };

  const modeName = (mode: ApprovalMode): string => t(`approval.${mode}` as const);

  return (
    <span className={styles.anchor} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("approval.currentLabel", { mode: modeName(state.mode) })}
        title={t("approval.currentLabel", { mode: modeName(state.mode) })}
        onClick={() => {
          setOpen(!open);
          setHighlight(MODES.indexOf(state.mode));
        }}
      >
        <Glyph name="checklist" size={13} />
        <span className={styles.triggerLabel}>{t("approval.pill", { mode: modeName(state.mode) })}</span>
        <Glyph name="chevronDown" size={12} />
      </button>

      {open ? (
        <div
          ref={menuRef}
          className={styles.menu}
          role="listbox"
          aria-label={t("approval.menuLabel")}
          tabIndex={-1}
          onKeyDown={onKeyDown}
        >
          {MODES.map((mode, index) => (
            <button
              key={mode}
              type="button"
              role="option"
              aria-selected={index === highlight}
              data-index={index}
              className={clsx(styles.item, index === highlight && styles.itemActive)}
              disabled={pending}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => choose(mode)}
            >
              <span className={styles.itemText}>
                <span className={styles.itemName}>{modeName(mode)}</span>
                <span className={styles.itemDesc}>{t(`approval.${mode}Desc` as const)}</span>
              </span>
              {mode === state.mode ? <CheckIcon /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}
