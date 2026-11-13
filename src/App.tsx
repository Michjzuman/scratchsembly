import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Code2,
  Download,
  FilePlus2,
  FolderOpen,
  Globe2,
  Maximize2,
  PanelLeft,
  Redo2,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
  Braces,
  Moon,
  Sun,
} from "lucide-react";
import {
  BlockEditor,
  type EditorHandle,
  type WorkspaceData,
  validateWorkspaceData,
} from "./components/BlockEditor";
import { RuntimePanel } from "./components/RuntimePanel";
import { CodePanel, type LogEntry } from "./components/CodePanel";
import { Dialog } from "./components/Dialog";
import { EXAMPLES } from "./blocks";
import { friendlyText } from "./registers";
import { assemblyText, compile, type CompileResult } from "./engine/compiler";
import { type CpuState } from "./engine/cpu";
import type { WorkerCommand } from "./engine/runner.worker";
import {
  LANGUAGES,
  loadLanguage,
  localizeMessage,
  setLanguage,
  statementText,
  t,
  type Language,
} from "./i18n";

import { applyColorMode, COLOR_MODE_KEY, loadColorMode } from "./appearance";

import {
  ARCHITECTURES,
  architectureInfo,
  architectureLabel,
  isArchitecture,
  type Architecture,
} from "./architectures";
import { createState } from "./engine/machine";
import type { BlockInfo } from "./block-help";

type Project = {
  version: 1;
  architecture?: Architecture;
  name: string;
  workspace: WorkspaceData;
};
type Modal =
  "examples" | "learn" | "help" | "new" | "welcome" | "block-info" | null;
const STORAGE_KEY = "asmblocks.project.v1"; // Preserve projects from the previous name.
function readProject(): Project | null {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return data?.version === 1 &&
      typeof data.name === "string" &&
      (data.architecture === undefined || isArchitecture(data.architecture)) &&
      data.workspace &&
      typeof data.workspace === "object"
      ? data
      : null;
  } catch {
    return null;
  }
}
function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exampleMeta(index: number) {
  const english = [
    [
      "My first countdown",
      "Count down from 5. start jumps to the loop entry point.",
    ],
    [
      "The sum of 1 to 10",
      "Add the integers from 1 to 10. The result is in A.",
    ],
    [
      "A trip through the stack",
      "Push two values, then pop them in reverse order.",
    ],
    ["Calculating with values", "Set C to (A + B) × 3. A and B are unchanged."],
  ];
  return {
    name: t(EXAMPLES[index].name, english[index][0]),
    description: t(EXAMPLES[index].description, english[index][1]),
  };
}
export default function App() {
  const [colorMode, setColorMode] = useState(loadColorMode);
  useLayoutEffect(() => applyColorMode(colorMode), [colorMode]);
  const [language, setUILanguage] = useState<Language>(() => {
    const value = loadLanguage();
    setLanguage(value);
    return value;
  });
  const [initialProject] = useState(readProject);
  const projectReady = useRef(!!initialProject);
  const firstSavePending = useRef(false);
  const [architecture, setProjectArchitecture] = useState<Architecture>(
    initialProject?.architecture || "x86",
  );
  const [newArchitecture, setNewArchitecture] =
    useState<Architecture>(architecture);
  const [editorData, setEditorData] = useState<WorkspaceData | null>(
    initialProject?.workspace || {},
  );
  const architectureRef = useRef(architecture);
  architectureRef.current = architecture;
  const [name, setName] = useState(initialProject?.name || exampleMeta(0).name);
  const [result, setResult] = useState<CompileResult>(() => compile([]));
  const [state, setState] = useState<CpuState>(() => createState(architecture));
  const [changed, setChanged] = useState<string[]>([]),
    [logs, setLogs] = useState<LogEntry[]>([]),
    [breakpoints, setBreakpoints] = useState<string[]>([]);
  const [blockInfo, setBlockInfo] = useState<BlockInfo | null>(null);
  const [modal, setModal] = useState<Modal>(initialProject ? null : "welcome"),
    [menu, setMenu] = useState<"file" | "edit" | null>(null);
  const [saved, setSaved] = useState<"saved" | "saving" | "error">("saved"),
    [delay, setDelay] = useState(500);
  const [view, setView] = useState<"blocks" | "assembly">("blocks"),
    [showValues, setShowValues] = useState(false),
    [toast, setToast] = useState("");
  const editor = useRef<EditorHandle>(null),
    worker = useRef<Worker | null>(null),
    fileInput = useRef<HTMLInputElement>(null);
  const resultRef = useRef(result),
    nameRef = useRef(name),
    stateRef = useRef(state),
    workspaceRef = useRef<WorkspaceData | null>(null),
    signature = useRef("");
  nameRef.current = name;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
      undefined,
    ),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }, []);
  const saveProject = useCallback((workspace?: WorkspaceData) => {
    const data = workspace || workspaceRef.current;
    if (!data || !projectReady.current) return false;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          architecture: architectureRef.current,
          name:
            nameRef.current.trim() ||
            t("Unbenanntes Projekt", "Untitled project"),
          workspace: data,
        }),
      );
      setSaved("saved");
      return true;
    } catch {
      setSaved("error");
      return false;
    }
  }, []);
  const onWorkspaceChange = useCallback(
    (next: CompileResult, workspace: WorkspaceData) => {
      resultRef.current = next;
      setResult(next);
      workspaceRef.current = workspace;
      const nextSignature = JSON.stringify({
        program: next.program,
        errors: next.errors,
      });
      if (signature.current !== nextSignature) {
        signature.current = nextSignature;
        worker.current?.postMessage({
          type: "load",
          program: next.program,
        } satisfies WorkerCommand);
        setLogs([]);
        setChanged([]);
      }
      if (projectReady.current) {
        setSaved("saving");
        clearTimeout(saveTimer.current);
        if (firstSavePending.current) {
          firstSavePending.current = false;
          saveProject(workspace);
        } else
          saveTimer.current = setTimeout(() => saveProject(workspace), 450);
      }
    },
    [saveProject],
  );
  useEffect(() => {
    const cpuWorker = new Worker(
      new URL("./engine/runner.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = cpuWorker;
    cpuWorker.onmessage = (event: MessageEvent<CpuState>) => {
      const next = event.data,
        previous = stateRef.current;
      if ((next.architecture || "x86") !== architectureRef.current) return;
      setChanged(
        Object.keys(next.registers).filter(
          (register) =>
            previous.registers[register] !== next.registers[register],
        ),
      );
      if (next.steps !== previous.steps && next.steps > 0)
        setLogs((current) =>
          [
            ...current,
            {
              step: next.steps,
              message: next.message,
              error: next.status === "error",
            },
          ].slice(-100),
        );
      stateRef.current = next;
      setState(next);
    };
    cpuWorker.onerror = () =>
      notify(
        t(
          "Die CPU konnte nicht gestartet werden. Bitte neu laden.",
          "The CPU could not start. Please reload.",
        ),
      );
    cpuWorker.postMessage({
      type: "load",
      program: resultRef.current.program,
    } satisfies WorkerCommand);
    return () => {
      cpuWorker.terminate();
      worker.current = null;
    };
  }, [notify]);
  useEffect(() => {
    if (workspaceRef.current && projectReady.current) {
      clearTimeout(saveTimer.current);
      setSaved("saving");
      saveTimer.current = setTimeout(() => saveProject(), 450);
    }
  }, [name, saveProject]);
  useEffect(() => {
    const flush = () => saveProject();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      clearTimeout(saveTimer.current);
      clearTimeout(toastTimer.current);
    };
  }, [saveProject]);
  const send = useCallback(
    (command: WorkerCommand) => worker.current?.postMessage(command),
    [],
  );
  useEffect(() => {
    send({ type: "breakpoints", ids: breakpoints });
  }, [breakpoints, send]);
  const toggleBreakpoint = useCallback(
    (id: string) =>
      setBreakpoints((current) =>
        current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id],
      ),
    [],
  );
  const run = useCallback(() => {
    if (state.status === "running") send({ type: "pause" });
    else if (!result.errors.length && result.blockCount)
      send({ type: "run", delay, breakpoints });
  }, [state.status, result, delay, breakpoints, send]);
  const start = useCallback(() => {
    if (!result.errors.length && result.blockCount) {
      setLogs([]);
      send({ type: "start", delay, breakpoints });
    }
  }, [result, delay, breakpoints, send]);
  const singleStep = useCallback(() => {
    if (
      !result.errors.length &&
      result.blockCount &&
      !["finished", "error"].includes(state.status)
    )
      send({ type: "step" });
  }, [result, state.status, send]);
  const stop = useCallback(() => {
    send({ type: "reset" });
    setLogs([]);
  }, [send]);
  const closeModal = useCallback(() => setModal(null), []);
  const showBlockInfo = useCallback((info: BlockInfo) => {
    setBlockInfo(info);
    setModal("block-info");
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement).closest(
          'input, textarea, select, [contenteditable="true"], .blocklyWidgetDiv',
        ) ||
        modal
      )
        return;
      if (
        event.code === "Space" &&
        !(event.target as HTMLElement).closest(
          'button, a, [role="tab"], .stack-scroll, .register-values',
        )
      ) {
        event.preventDefault();
        run();
      }
      if (event.key === "F10") {
        event.preventDefault();
        singleStep();
      }
      if (event.key === "Escape") {
        setMenu(null);
        setShowValues(false);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        notify(
          saveProject()
            ? t("Projekt gespeichert.", "Project saved.")
            : t(
                "Speichern nicht möglich. Bitte herunterladen.",
                "Cannot save locally. Please download your project.",
              ),
        );
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [run, singleStep, modal, saveProject, notify]);
  function changeLanguage(value: Language) {
    setLanguage(value);
    setUILanguage(value);
    setMenu(null);
    try {
      localStorage.setItem("assembly-playground.language", value);
    } catch {
      /* Optional preference. */
    }
  }
  function chooseExample(index: number) {
    const title = exampleMeta(index).name;
    setName(title);
    nameRef.current = title;
    editor.current?.loadExample(EXAMPLES[index].blocks);
    setBreakpoints([]);
    setModal(null);
    setView("blocks");
  }
  async function importProject(file?: File) {
    if (!file) return;
    if (file.size > 2_000_000) {
      notify(
        t(
          "Die Datei ist zu groß (maximal 2 MB).",
          "The file is too large (maximum 2 MB).",
        ),
      );
      return;
    }
    const previous = editor.current?.save();
    try {
      const project = JSON.parse(await file.text());
      if (
        project.version !== 1 ||
        (project.architecture !== undefined &&
          !isArchitecture(project.architecture)) ||
        typeof project.name !== "string" ||
        !project.workspace ||
        typeof project.workspace !== "object" ||
        Array.isArray(project.workspace)
      )
        throw new Error("format");
      const target: Architecture = project.architecture || "x86";
      validateWorkspaceData(project.workspace, target);
      clearTimeout(saveTimer.current);
      if (target !== architecture) {
        architectureRef.current = target;
        setEditorData(project.workspace);
        setProjectArchitecture(target);
        const fresh = createState(target);
        stateRef.current = fresh;
        setState(fresh);
      } else editor.current?.load(project.workspace);
      setName(project.name.slice(0, 80));
      nameRef.current = project.name.slice(0, 80);
      setBreakpoints([]);
      setView("blocks");
      notify(t("Projekt geöffnet.", "Project opened."));
    } catch {
      if (previous) editor.current?.load(previous);
      notify(
        t(
          "Das ist keine gültige Projektdatei.",
          "This is not a valid project file.",
        ),
      );
    }
    if (fileInput.current) fileInput.current.value = "";
  }
  function exportProject(format: "asm" | "json") {
    const filename = (name.trim() || "program")
      .toLowerCase()
      .replace(/[^a-z0-9äöüß_-]+/g, "-");
    if (format === "asm") {
      if (result.errors.length) {
        notify(
          t(
            "Behebe zuerst die Programmfehler.",
            "Fix the program errors first.",
          ),
        );
        return;
      }
      download(
        assemblyText(result),
        `${filename}.${architecture.startsWith("arm") ? "s" : "asm"}`,
        "text/plain",
      );
    } else
      download(
        JSON.stringify(
          {
            version: 1,
            architecture,
            name: name.trim() || "Untitled project",
            workspace: editor.current?.save(),
          },
          null,
          2,
        ),
        `${filename}.scratchsembly.json`,
        "application/json",
      );
    setMenu(null);
  }
  const activeId = state.message.startsWith("Breakpoint")
    ? result.program.instructions[state.pc]?.id || null
    : state.lastId;
  const blocked =
    result.errors.length > 0 ||
    !result.blockCount ||
    (result.program.architecture || "x86") !== architecture;
  const savedLabel =
    saved === "saved"
      ? t("Lokal gespeichert", "Saved locally")
      : saved === "saving"
        ? t("Speichert …", "Saving …")
        : t("Speichern fehlgeschlagen", "Save failed");
  const fileMenu = (
    <div className="scratch-menu" role="menu">
      <button
        role="menuitem"
        onClick={() => {
          setNewArchitecture(architecture);
          setModal("new");
          setMenu(null);
        }}
      >
        <FilePlus2 size={16} />
        {t("Neu", "New")}
      </button>
      <button
        role="menuitem"
        onClick={() => {
          fileInput.current?.click();
          setMenu(null);
        }}
      >
        <Upload size={16} />
        {t("Vom Computer laden", "Load from computer")}
      </button>
      <button role="menuitem" onClick={() => exportProject("json")}>
        <Download size={16} />
        {t("Auf dem Computer speichern", "Save to computer")}
      </button>
      <hr />
      <button
        role="menuitem"
        disabled={!!result.errors.length}
        onClick={() => exportProject("asm")}
      >
        <Code2 size={16} />
        {t("Assembly exportieren", "Export assembly")}
      </button>
    </div>
  );
  return (
    <div className="scratch-app" data-architecture={architecture}>
      <header className="scratch-header">
        <a
          href="#"
          className="scratchsembly-logo"
          aria-label="scratchsembly"
          onClick={(event) => {
            event.preventDefault();
            setModal("examples");
          }}
        >
          scratchsembly
        </a>
        <nav
          className="header-menu"
          aria-label={t("Projektmenü", "Project menu")}
        >
          <div className="menu-anchor">
            <button
              className={menu === "file" ? "open" : ""}
              onClick={() => setMenu(menu === "file" ? null : "file")}
              aria-expanded={menu === "file"}
            >
              {t("Datei", "File")}
              <ChevronDown size={12} />
            </button>
            {menu === "file" && fileMenu}
          </div>
          <div className="menu-anchor edit-menu">
            <button
              className={menu === "edit" ? "open" : ""}
              onClick={() => setMenu(menu === "edit" ? null : "edit")}
              aria-expanded={menu === "edit"}
            >
              {t("Bearbeiten", "Edit")}
              <ChevronDown size={12} />
            </button>
            {menu === "edit" && (
              <div className="scratch-menu" role="menu">
                <button
                  role="menuitem"
                  onClick={() => {
                    editor.current?.undo();
                    setMenu(null);
                  }}
                >
                  <Undo2 size={16} />
                  {t("Rückgängig", "Undo")}
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    editor.current?.undo(true);
                    setMenu(null);
                  }}
                >
                  <Redo2 size={16} />
                  {t("Wiederholen", "Redo")}
                </button>
              </div>
            )}
          </div>
          <button className="tutorial-button" onClick={() => setModal("learn")}>
            <BookOpen size={17} />
            {t("Anleitung", "Guide")}
          </button>
        </nav>
        <input
          className="project-name"
          aria-label={t("Projektname", "Project name")}
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            if (!name.trim())
              setName(t("Unbenanntes Projekt", "Untitled project"));
          }}
        />
        <span
          className="project-architecture"
          title={`${architectureLabel(architecture)} · ${architectureInfo(architecture).bits}-bit`}
          aria-label={t("Projektarchitektur", "Project architecture")}
        >
          {architectureLabel(architecture)}
        </span>
        <span
          className={`save-mark ${saved}`}
          title={savedLabel}
          aria-label={savedLabel}
        >
          {saved === "error" ? "!" : <Check size={16} />}
        </span>
        <div className="header-right">
          <button
            className="theme-toggle"
            aria-label={t("Dunkler Modus", "Dark mode")}
            aria-pressed={colorMode === "dark"}
            title={
              colorMode === "dark"
                ? t("Heller Modus", "Light mode")
                : t("Dunkler Modus", "Dark mode")
            }
            onClick={() => {
              const next = colorMode === "dark" ? "light" : "dark";
              setColorMode(next);
              try {
                localStorage.setItem(COLOR_MODE_KEY, next);
              } catch {
                /* Optional preference. */
              }
            }}
          >
            {colorMode === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <label
            className="language-menu"
            title={t(
              "Mnemonics für die Architektur dieses Projekts. Die Sprache ändert die Architektur nicht.",
              "Mnemonics for this project's architecture. Language does not change the architecture.",
            )}
          >
            <Globe2 size={17} />
            <select
              aria-label={t("Sprache", "Language")}
              value={language}
              onChange={(event) =>
                changeLanguage(event.target.value as Language)
              }
            >
              {LANGUAGES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => setModal("examples")}
            aria-label={t("Beispiele", "Examples")}
          >
            <FolderOpen size={18} />
            <span>{t("Beispiele", "Examples")}</span>
          </button>
          <button
            onClick={() => setModal("help")}
            aria-label={t("Hilfe", "Help")}
          >
            <CircleHelp size={20} />
          </button>
        </div>
        {menu && (
          <button
            className="menu-cover"
            aria-label={t("Menü schließen", "Close menu")}
            onClick={() => setMenu(null)}
          />
        )}
      </header>
      <main className="scratch-main">
        <section
          className="coding-area"
          aria-label={t("Programmeditor", "Program editor")}
        >
          <div className="code-tabbar">
            <div
              className="scratch-tabs"
              role="tablist"
              aria-label={t("Ansicht", "View")}
            >
              <button
                role="tab"
                aria-selected={view === "blocks"}
                aria-controls="blocks-view"
                className={view === "blocks" ? "selected" : ""}
                onClick={() => setView("blocks")}
              >
                <PanelLeft size={18} />
                Blocks
              </button>
              <button
                role="tab"
                aria-selected={view === "assembly"}
                aria-controls="assembly-view"
                className={view === "assembly" ? "selected" : ""}
                onClick={() => setView("assembly")}
              >
                <Code2 size={18} />
                Assembly
              </button>
            </div>
            <div className="compact-tools">
              {view === "blocks" && (
                <button
                  className="palette-toggle"
                  onClick={() => editor.current?.togglePalette()}
                  aria-label={t("Blockpalette", "Block palette")}
                >
                  <PanelLeft size={17} />
                </button>
              )}
              <button
                className="mobile-values-button"
                onClick={() => setShowValues(!showValues)}
              >
                <Braces size={17} />
                {t("Werte", "Values")}
              </button>
            </div>
          </div>
          <div
            className="workspace-shell"
            data-program-blocks={result.blockCount}
          >
            <div
              id="blocks-view"
              role="tabpanel"
              aria-label="Blocks"
              className="workspace-canvas"
              hidden={view !== "blocks"}
            >
              <BlockEditor
                key={architecture}
                ref={editor}
                architecture={architecture}
                initialData={editorData}
                onChange={onWorkspaceChange}
                activeId={activeId}
                breakpoints={breakpoints}
                onToggleBreakpoint={toggleBreakpoint}
                onBlockInfo={showBlockInfo}
                language={language}
                state={state}
                visible={view === "blocks"}
              />
              {!(result.workspaceBlockCount ?? result.blockCount) && (
                <p className="empty-workspace">
                  {t("Ziehe einen Block hierher.", "Drag a block here.")}
                </p>
              )}
              {result.errors.length > 0 && (
                <button
                  className="program-error"
                  onClick={() =>
                    editor.current?.focusBlock(result.errors[0].id)
                  }
                >
                  {localizeMessage(friendlyText(result.errors[0].message))}
                </button>
              )}
              <div className="scratch-zoom">
                <button
                  onClick={() => editor.current?.zoom(1)}
                  aria-label={t("Vergrößern", "Zoom in")}
                >
                  <ZoomIn size={20} />
                </button>
                <button
                  onClick={() => editor.current?.zoom(-1)}
                  aria-label={t("Verkleinern", "Zoom out")}
                >
                  <ZoomOut size={20} />
                </button>
                <button
                  onClick={() => editor.current?.fit()}
                  aria-label={t("Blöcke einpassen", "Fit blocks")}
                >
                  <Maximize2 size={17} />
                </button>
              </div>
            </div>
            {view === "assembly" && (
              <div
                id="assembly-view"
                role="tabpanel"
                aria-label="Assembly"
                className="assembly-view"
              >
                <CodePanel
                  result={result}
                  activeId={activeId}
                  breakpoints={breakpoints}
                  onBreakpoint={toggleBreakpoint}
                  logs={logs}
                  onClearLogs={() => setLogs([])}
                  onFocusBlock={(id) => {
                    setView("blocks");
                    requestAnimationFrame(() => editor.current?.focusBlock(id));
                  }}
                />
              </div>
            )}
          </div>
        </section>
        <RuntimePanel
          architecture={architecture}
          state={state}
          changed={changed}
          blocked={blocked}
          delay={delay}
          onDelay={(value) => {
            setDelay(value);
            send({ type: "speed", delay: value });
          }}
          onStart={start}
          onPause={run}
          onStep={singleStep}
          onStop={stop}
          mobileOpen={showValues}
          onClose={() => setShowValues(false)}
        />
      </main>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden-file"
        aria-label={t("Projektdatei importieren", "Import project file")}
        onChange={(event) => void importProject(event.target.files?.[0])}
      />
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button
            className="plain-icon"
            onClick={() => setToast("")}
            aria-label={t("Meldung schließen", "Close notification")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal === "examples" && (
        <Dialog
          title={t("Beispiele", "Examples")}
          eyebrow=""
          onClose={closeModal}
        >
          <p className="dialog-intro">
            {t(
              "Such dir ein Programm zum Ausprobieren aus.",
              "Choose a program to try.",
            )}
          </p>
          <div className="example-list">
            {EXAMPLES.map((example, index) => {
              const meta = exampleMeta(index);
              return (
                <button onClick={() => chooseExample(index)} key={example.id}>
                  <span className={`example-block-icon example-${index}`}>
                    {["5", "+", "↕", "×"][index]}
                  </span>
                  <span>
                    <strong>{meta.name}</strong>
                    <small>{meta.description}</small>
                  </span>
                  <span className="example-arrow">›</span>
                </button>
              );
            })}
          </div>
          <p className="dialog-note">
            {t(
              "Ein Beispiel ersetzt das aktuelle Programm. Du kannst es vorher unter „Datei“ speichern.",
              "An example replaces the current program. You can save yours from the File menu first.",
            )}
          </p>
        </Dialog>
      )}
      {modal === "learn" && (
        <Dialog
          title={t("So funktioniert’s", "How it works")}
          eyebrow=""
          onClose={closeModal}
        >
          <ol className="tutorial-steps">
            <li>
              <strong>{t("Blocks zusammenstecken", "Connect blocks")}</strong>
              <p>
                {t(
                  "start ist der Einstieg. Jede Marke ist ein eigener Ereigniskopf. Mit Sprüngen und Aufrufen erreichst du diese Teile des Programms.",
                  "start is the entry point. Every label is its own event head. Reach these parts of the program with jumps and calls.",
                )}
              </p>
              <div className="demo-block data-block">
                {statementText("setze", "set", "mov")} <span>A ▾</span>{" "}
                {statementText("auf", "to", ",")} <span>5</span>
              </div>
            </li>
            <li>
              <strong>
                {t("Werte direkt ansehen", "Inspect values directly")}
              </strong>
              <p>
                {t(
                  "Klicke auf einen runden oder sechseckigen Wert-Block: Die Vorschau zeigt den aktuellen Wert, ohne das Programm auszuführen. Leere Zahlenfelder bedeuten 0.",
                  "Click a round or hexagonal value block to see its current value without running the program. Empty number inputs mean 0.",
                )}
              </p>
            </li>
            <li>
              <strong>
                {t("Ausführen und beobachten", "Run and observe")}
              </strong>
              <p>
                {t(
                  "Start beginnt von vorne. Schritt führt einen Befehlsblock aus. Rechts stehen alle Register und darunter alle aktiven Stack-Werte. Zum Löschen ziehst du einen Block zurück in die Palette.",
                  "Start runs from the beginning. Step executes one statement block. All registers and active stack values are on the right. Delete a block by dragging it back into the palette.",
                )}
              </p>
            </li>
          </ol>
          <p className="dialog-note">
            {t(
              "Die Architektur wird beim Erstellen des Projekts gewählt. Assembly zeigt passenden NASM-Code (x86) oder GNU-Assembler-Code (ARM). Die Ausführung im Browser ist simuliert.",
              "Choose the architecture when creating a project. Assembly shows matching NASM (x86) or GNU assembler (ARM) source. Browser execution is simulated.",
            )}
          </p>
          <button className="dialog-primary" onClick={closeModal}>
            {t("Los geht’s!", "Got it!")}
          </button>
        </Dialog>
      )}
      {modal === "help" && (
        <Dialog
          title={t("Tastenkürzel", "Keyboard shortcuts")}
          eyebrow=""
          onClose={closeModal}
        >
          <div className="shortcut-list">
            {[
              [
                t("Leertaste", "Space"),
                t("Start / Pause / Fortsetzen", "Start / pause / resume"),
              ],
              ["F10", t("Ein Befehlsblock", "One statement block")],
              ["⌘ / Ctrl + S", t("Lokal speichern", "Save locally")],
              ["⌘ / Ctrl + Z", t("Rückgängig", "Undo")],
              [
                "Del / ⌫",
                t("Ausgewählten Block löschen", "Delete selected block"),
              ],
            ].map(([key, text]) => (
              <p key={key}>
                <strong>{key}</strong>
                <span>{text}</span>
              </p>
            ))}
          </div>
          <p className="dialog-note">
            {t(
              "Rechtsklick auf einen Befehlsblock setzt einen Breakpoint. Ein Klick auf einen Wert zeigt seine Vorschau. Projekte bleiben lokal in diesem Browser.",
              "Right-click a statement block to set a breakpoint. Click a value to preview it. Projects stay local to this browser.",
            )}
          </p>
          <button className="dialog-primary" onClick={() => setModal("learn")}>
            {t("Anleitung öffnen", "Open guide")}
          </button>
        </Dialog>
      )}
      {modal === "block-info" && blockInfo && (
        <Dialog
          title={t("Block-Info", "Block info")}
          eyebrow=""
          onClose={closeModal}
        >
          <p className="dialog-intro block-info-content">
            <strong>{blockInfo.title}</strong>
            <br />
            {blockInfo.description}
          </p>
          <p className="dialog-note">
            {architectureLabel(architecture)} ·{" "}
            {architectureInfo(architecture).bits}-bit
            <br />
            {t(
              "Diese Info führt keinen Block aus.",
              "Opening info does not execute the block.",
            )}
          </p>
        </Dialog>
      )}
      {(modal === "new" || modal === "welcome") && (
        <Dialog
          title={
            modal === "welcome"
              ? t("Architektur wählen", "Choose an architecture")
              : t("Neues Projekt", "New project")
          }
          eyebrow=""
          onClose={closeModal}
          dismissible={modal !== "welcome"}
        >
          <p className="dialog-intro">
            {modal === "welcome"
              ? t(
                  "Wähle die Architektur für dein erstes Projekt. Später kannst du unter Datei → Neu eine andere wählen.",
                  "Choose the architecture for your first project. You can choose another with File → New later.",
                )
              : t(
                  "Das aktuelle Programm wird ersetzt. Möchtest du es vorher herunterladen?",
                  "The current program will be replaced. Would you like to download it first?",
                )}
          </p>
          <fieldset className="architecture-choice">
            <legend>
              {t("Architektur des neuen Projekts", "New project architecture")}
            </legend>
            {ARCHITECTURES.map((target) => (
              <label
                key={target}
                className={newArchitecture === target ? "selected" : ""}
              >
                <input
                  type="radio"
                  name="architecture"
                  value={target}
                  checked={newArchitecture === target}
                  onChange={() => setNewArchitecture(target)}
                />
                <strong>{architectureLabel(target)}</strong>
                <span>{architectureInfo(target).bits}-bit</span>
              </label>
            ))}
          </fieldset>
          <div className="dialog-buttons">
            {modal !== "welcome" && (
              <button
                className="dialog-secondary"
                onClick={() => exportProject("json")}
              >
                {t("Herunterladen", "Download")}
              </button>
            )}
            <button
              className="dialog-primary"
              onClick={() => {
                const firstProject = modal === "welcome";
                projectReady.current = true;
                firstSavePending.current = firstProject;
                const title = firstProject
                  ? exampleMeta(0).name
                  : t("Unbenanntes Projekt", "Untitled project");
                setName(title);
                nameRef.current = title;
                clearTimeout(saveTimer.current);
                if (newArchitecture !== architecture) {
                  architectureRef.current = newArchitecture;
                  setEditorData(firstProject ? null : {});
                  setProjectArchitecture(newArchitecture);
                  const fresh = createState(newArchitecture);
                  stateRef.current = fresh;
                  setState(fresh);
                } else
                  editor.current?.loadExample(
                    firstProject ? EXAMPLES[0].blocks : [],
                  );
                setBreakpoints([]);
                setView("blocks");
                setModal(null);
              }}
            >
              {modal === "welcome"
                ? t("Projekt erstellen", "Create project")
                : t("Neu anfangen", "Start fresh")}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
