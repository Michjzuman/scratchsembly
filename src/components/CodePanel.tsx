import { useEffect, useRef, useState } from "react";
import {
  Code2,
  Terminal,
  Copy,
  Check,
  CircleAlert,
  Trash2,
} from "lucide-react";
import { assemblyText, type CompileResult } from "../engine/compiler";
import { localizeMessage, t } from "../i18n";
import { architectureInfo } from "../architectures";
export type LogEntry = { step: number; message: string; error: boolean };
type Props = {
  result: CompileResult;
  activeId: string | null;
  breakpoints: string[];
  onBreakpoint: (id: string) => void;
  logs: LogEntry[];
  onClearLogs: () => void;
  onFocusBlock: (id: string) => void;
};
export function CodePanel({
  result,
  activeId,
  breakpoints,
  onBreakpoint,
  logs,
  onClearLogs,
  onFocusBlock,
}: Props) {
  const [tab, setTab] = useState<"source" | "console">("source"),
    [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(assemblyText(result));
      setCopied(true);
    } catch {
      setCopyError(true);
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
      setCopyError(false);
    }, 2000);
  }
  return (
    <section
      className="code-panel"
      aria-label={t("Assembly-Quelltext", "Assembly source")}
    >
      <div className="code-panel-heading">
        <div className="code-tabs">
          <button
            className={tab === "source" ? "active" : ""}
            onClick={() => setTab("source")}
          >
            <Code2 size={15} />
            {t("Quelltext", "Source")}
          </button>
          <button
            className={tab === "console" ? "active" : ""}
            onClick={() => setTab("console")}
          >
            <Terminal size={15} />
            {t("Konsole", "Console")}
            {result.errors.length > 0 && (
              <span className="error-count">{result.errors.length}</span>
            )}
          </button>
        </div>
        <div className="code-panel-actions">
          <span className="syntax-label">
            {architectureInfo(result.program.architecture || "x86").syntax}
          </span>
          {tab === "source" ? (
            <button
              className="plain-icon"
              onClick={copy}
              aria-label={t("Assembly kopieren", "Copy assembly")}
              title={copied ? t("Kopiert!", "Copied!") : t("Kopieren", "Copy")}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          ) : (
            <button
              className="plain-icon"
              onClick={onClearLogs}
              aria-label={t("Konsole leeren", "Clear console")}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
      <div
        className={`code-content ${tab === "console" ? "console-content" : ""}`}
      >
        {tab === "source" ? (
          <div className="source-code">
            {result.lines.map((line, index) => (
              <div
                key={index}
                className={`source-line ${line.kind} ${line.id && activeId === line.id ? "current" : ""} ${line.id && result.errors.some((error) => error.id === line.id) ? "has-error" : ""}`}
              >
                <button
                  className={`line-number ${line.id && breakpoints.includes(line.id) ? "has-breakpoint" : ""}`}
                  disabled={!line.id || line.kind !== "instruction"}
                  title={
                    line.id && line.kind === "instruction"
                      ? t(
                          "Breakpoint für diesen Block umschalten",
                          "Toggle breakpoint for this block",
                        )
                      : undefined
                  }
                  onClick={() => line.id && onBreakpoint(line.id)}
                >
                  {index + 1}
                </button>
                <code onDoubleClick={() => line.id && onFocusBlock(line.id)}>
                  {line.kind === "instruction" ? (
                    <>
                      <span className="code-indent"> </span>
                      <span className="code-op">{line.op!.padEnd(5)}</span>{" "}
                      <span>{line.operands}</span>
                    </>
                  ) : (
                    line.text || " "
                  )}
                </code>
              </div>
            ))}
          </div>
        ) : (
          <div className="console-entries">
            {result.errors.map((error, index) => (
              <button
                className="console-entry error"
                key={index}
                onClick={() => onFocusBlock(error.id)}
              >
                <CircleAlert size={14} />
                <span>{localizeMessage(error.message)}</span>
              </button>
            ))}
            {!logs.length && !result.errors.length ? (
              <div className="console-placeholder">
                <Terminal size={18} />
                {t(
                  "Hier erscheinen die Ausführungsschritte.",
                  "Execution steps appear here.",
                )}
              </div>
            ) : (
              logs.map((log, index) => (
                <div
                  className={`console-entry ${log.error ? "error" : ""}`}
                  key={index}
                >
                  <span className="log-step">
                    {String(log.step).padStart(3, "0")}
                  </span>
                  <span>{localizeMessage(log.message)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <div className="code-footer">
        <span>
          {copyError
            ? t(
                "Kopieren nicht verfügbar. Bitte Text manuell auswählen.",
                "Copy is unavailable. Please select the text manually.",
              )
            : tab === "source"
              ? t(
                  "Aus den Blocks generiert · Doppelklick springt zum Block",
                  "Generated from blocks · double-click to locate a block",
                )
              : t(
                  "Die letzten 100 Ausführungsschritte",
                  "Last 100 execution steps",
                )}
        </span>
        <span>
          {result.program.instructions.length}{" "}
          {t("Instruktionen", "instructions")}
        </span>
      </div>
    </section>
  );
}
