import { useEffect, useRef, useState } from "react";
import { useT } from "../lib/app-state.ts";
import styles from "./AppDialog.module.css";

/**
 * In-app replacements for the browser's native `confirm()` / `prompt()`.
 *
 * A module-level queue holds one dialog at a time; `confirmDialog` and
 * `promptDialog` return the same shape the browser dialogs do (`boolean` /
 * `string | null`), so call sites read like the code they replaced — they just
 * render as a styled card above the app instead of a chrome popup the page
 * cannot style.
 *
 * The host renders inside the layout root; without it (a test harness that
 * mounts a caller alone) every queued request simply stays queued and its
 * promise stays pending, exactly like the lightbox's provider-less no-op.
 */

export interface ConfirmOptions {
  title: string;
  /** Supporting sentence; the title carries the question. */
  message?: string;
  /** Red confirm button — for actions that destroy work. */
  danger?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface PromptOptions {
  title: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ActiveDialog {
  kind: "confirm" | "prompt";
  options: ConfirmOptions & PromptOptions;
  resolve: (value: boolean | string | null) => void;
}

let active: ActiveDialog | null = null;
const listeners = new Set<() => void>();

function open(kind: ActiveDialog["kind"], options: ConfirmOptions & PromptOptions): Promise<unknown> {
  // One dialog at a time: a second caller while one is up would race two
  // masks. The queue is drained first-come-first-served by the host closing.
  if (active) {
    return Promise.resolve(kind === "prompt" ? null : false);
  }
  return new Promise((resolve) => {
    active = { kind, options, resolve };
    for (const listener of listeners) listener();
  });
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return open("confirm", options) as Promise<boolean>;
}

export function promptDialog(options: PromptOptions): Promise<string | null> {
  return open("prompt", options) as Promise<string | null>;
}

function close(value: boolean | string | null): void {
  const current = active;
  active = null;
  for (const listener of listeners) listener();
  current?.resolve(value);
}

/** Mount once, next to the layout root. Renders nothing while idle. */
export function AppDialogHost(): React.ReactNode {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (active === null) return;
    setDraft(active.options.initial ?? "");
    if (active.kind === "prompt") {
      // Select the whole default so typing replaces it, like the browser
      // prompt's preselected value.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [active]);

  if (active === null) return null;

  const confirmLabel = active.options.confirmLabel ?? t("dialog.confirm");
  const cancelLabel = active.options.cancelLabel ?? t("dialog.cancel");
  const settle = (value: boolean | string | null): void => {
    close(value);
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      settle(active?.kind === "prompt" ? null : false);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (active?.kind === "prompt") {
        if (draft.trim().length === 0) return;
        settle(draft.trim());
      } else {
        settle(true);
      }
    }
  };

  const isPrompt = active.kind === "prompt";
  const confirmDisabled = isPrompt && draft.trim().length === 0;

  return (
    <div
      className={styles.mask}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (event.target === event.currentTarget) settle(isPrompt ? null : false);
      }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true">
        <h2 className={styles.title}>{active.options.title}</h2>
        {active.options.message === undefined ? null : (
          <p className={styles.message}>{active.options.message}</p>
        )}
        {isPrompt ? (
          <input
            ref={inputRef}
            className={styles.input}
            value={draft}
            placeholder={active.options.placeholder}
            maxLength={120}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
          />
        ) : null}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancel}
            onClick={() => settle(isPrompt ? null : false)}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={active.options.danger ? styles.confirmDanger : styles.confirm}
            disabled={confirmDisabled}
            onClick={() => settle(isPrompt ? draft.trim() : true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
