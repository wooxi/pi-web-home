import { useRef } from "react";
import { ChevronIcon, FolderIcon } from "../../components/icons.tsx";
import { actions, appStore, useT } from "../../lib/app-state.ts";
import { useStore } from "../../lib/store.ts";
import { Composer } from "./Composer.tsx";
import { useComposerState } from "./useComposerState.ts";
import styles from "./NewSessionHero.module.css";

/** Workspace chooser shown above the composer. */
function WorkspaceSelect() {
  const t = useT();
  const state = useStore(appStore);
  const current = state.projects.find((project) => project.id === state.selectedProjectId);
  return (
    <details className={styles.selector}>
      <summary className={styles.selectorButton}>
        <span className={styles.selectorGlyph}>
          <FolderIcon />
        </span>
        {current ? current.title : t("hero.chooseWorkspace")}
        <span className={styles.selectorCaret}>
          <ChevronIcon />
        </span>
      </summary>
      <div className={styles.menu} role="listbox">
        {state.projects.length === 0 ? (
          <p className={styles.warning}>{t("hero.noWorkspace")}</p>
        ) : (
          state.projects.map((project) => (
            <button
              key={project.id}
              type="button"
              role="option"
              aria-selected={project.id === state.selectedProjectId}
              className={styles.menuItem}
              title={project.path}
              onClick={(event) => {
                event.preventDefault();
                void actions.selectProject(project.id);
                actions.expandProject(project.id);
                const host = event.currentTarget.closest("details");
                if (host instanceof HTMLDetailsElement) host.open = false;
              }}
            >
              <span className={styles.selectorGlyph}>
                <FolderIcon />
              </span>
              <span>{project.title}</span>
            </button>
          ))
        )}
      </div>
    </details>
  );
}

/**
 * The empty state shown when no conversation is open, modelled on dsh's hero:
 * brand mark, workspace chooser, and a large composer.
 *
 * The card is the *shared* session composer (see `Composer`, variant `hero`) —
 * same slash completion, same attachment paths, same toolbar cluster — pointed
 * at a submit that creates the session instead of delivering to one. The model
 * choice rides the first message: pi resolves the list from the project rather
 * than from a session, so no process has to exist for the choice to be offered.
 */
export function NewSessionHero() {
  const t = useT();
  const state = useStore(appStore);

  const project = state.projects.find((candidate) => candidate.id === state.selectedProjectId);
  // pi's own default until the user picks another one; `selectModel` on this
  // path only remembers the choice, which `startDraftSession` then hands to the
  // session it creates.
  const composer = useComposerState({
    sessionPath: null,
    projectId: state.selectedProjectId,
  });
  // The hero opens a *new* session, while every built-in command acts on an
  // existing one (/compact, /export, /session, /name), so offering them here
  // would just be a menu of things that cannot work yet.
  const commands = (
    state.selectedProjectId ? (state.commands[state.selectedProjectId] ?? []) : []
  ).filter((command) => command.source !== "builtin");

  const newSessionModelRef = useRef(state.newSessionModel);
  newSessionModelRef.current = state.newSessionModel;

  const start = async (
    message: string,
    _mode: "prompt" | "steer" | "followUp",
    images: Parameters<typeof actions.startDraftSession>[2],
  ): Promise<boolean> => {
    if (!project) return false;
    // Creates the draft immediately and queues the message for the session
    // that replaces it once pi is ready. Only a model the user actually chose
    // is passed on: null means "start on pi's default", which is not the same
    // request as naming the model pi would have picked anyway.
    actions.startDraftSession(project.id, message, images, newSessionModelRef.current);
    return true;
  };

  return (
    <div className={styles.hero}>
      <div className={styles.inner}>
        <div className={styles.titleRow}>
          <span className={styles.mark} aria-hidden>
            π
          </span>
          <h1 className={styles.title}>{t("hero.title")}</h1>
          <span className={styles.badge}>{t("hero.badge")}</span>
        </div>

        <div className={styles.selectors}>
          <WorkspaceSelect />
        </div>

        <Composer
          variant="hero"
          isStreaming={false}
          projectReady={Boolean(project)}
          disabled={!project}
          commands={commands}
          session={{
            model: composer.state?.model ?? null,
            models: composer.state?.models ?? null,
            context: null,
            loading: composer.modelsLoading,
            onRequestLive: () => void composer.ensureLive(),
            onSelectModel: (provider, id) => void composer.selectModel(provider, id),
          }}
          onSend={(message, _mode, images) => start(message, _mode, images)}
          onAbort={() => {}}
        />
      </div>
    </div>
  );
}
