import { Pause, Play, SkipForward, Octagon, X } from "lucide-react";
import { useState } from "react";
import { hex, MEMORY_SIZE, type CpuState } from "../engine/cpu";
import { getRegisterNames, registerDetail } from "../registers";
import {
  architectureInfo,
  architectureLabel,
  displayWord,
  integer,
  type Architecture,
} from "../architectures";
import { localizeMessage, t } from "../i18n";

type Props = {
  state: CpuState;
  architecture: Architecture;
  changed: string[];
  blocked: boolean;
  delay: number;
  onDelay: (value: number) => void;
  onStart: () => void;
  onPause: () => void;
  onStep: () => void;
  onStop: () => void;
  mobileOpen: boolean;
  onClose: () => void;
};
export function RuntimePanel({
  state,
  architecture,
  changed,
  blocked,
  delay,
  onDelay,
  onStart,
  onPause,
  onStep,
  onStop,
  mobileOpen,
  onClose,
}: Props) {
  const [format, setFormat] = useState<"dec" | "hex">(() => {
    try {
      return localStorage.getItem("assembly-playground.number-format") === "hex"
        ? "hex"
        : "dec";
    } catch {
      return "dec";
    }
  });
  const info = architectureInfo(architecture);
  const display = (value: number | string | bigint = 0) =>
    displayWord(value, architecture, format);
  const running = state.status === "running",
    paused = state.status === "paused";
  const status = {
    ready: t("Bereit", "Ready"),
    running: t("Läuft", "Running"),
    paused: t("Pausiert", "Paused"),
    finished: t("Beendet", "Finished"),
    error: t("Fehler", "Error"),
  }[state.status];
  const rawPointer = integer(state.registers[info.stack] ?? MEMORY_SIZE);
  const pointer =
    rawPointer >= 0n && rawPointer <= BigInt(MEMORY_SIZE)
      ? Number(rawPointer)
      : MEMORY_SIZE + 1;
  const count =
    pointer <= MEMORY_SIZE
      ? Math.floor((MEMORY_SIZE - pointer) / info.stackBytes)
      : 0;
  const memory = new DataView(
    state.memory.buffer,
    state.memory.byteOffset,
    state.memory.byteLength,
  );
  return (
    <aside
      className={`runtime-panel ${info.registers.length > 8 ? "multi-registers" : ""} ${info.registers.length > 16 ? "many-registers" : ""} ${mobileOpen ? "mobile-open" : ""}`}
      aria-label={t("Register und Stack", "Registers and stack")}
    >
      <div className="run-toolbar">
        <button
          className="start-button"
          onClick={onStart}
          disabled={blocked}
          title={t("Von vorne starten", "Restart from the beginning")}
        >
          <Play size={17} fill="currentColor" />
          Start
        </button>
        <button
          className="stop-button"
          onClick={onStop}
          aria-label={t("Stoppen und zurücksetzen", "Stop and reset")}
          title={t("Stoppen und zurücksetzen", "Stop and reset")}
        >
          <Octagon size={20} fill="currentColor" />
        </button>
        <button
          className="plain-icon pause-control"
          onClick={onPause}
          disabled={!running && !paused}
          aria-label={
            running ? t("Pausieren", "Pause") : t("Fortsetzen", "Resume")
          }
        >
          {running ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button
          className="step-control"
          onClick={onStep}
          disabled={
            blocked || state.status === "finished" || state.status === "error"
          }
          title={t("Ein Befehlsblock (F10)", "One statement block (F10)")}
        >
          <SkipForward size={16} />
          {t("Schritt", "Step")}
        </button>
        <button
          className="plain-icon runtime-close"
          onClick={onClose}
          aria-label={t("Werte schließen", "Close values")}
        >
          <X size={18} />
        </button>
      </div>
      <div className="runtime-content">
        <div className="register-heading">
          <h2>{t("Register", "Registers")}</h2>
          <span className="register-count">{info.registers.length}</span>
          <select
            aria-label={t("Zahlenformat", "Number format")}
            value={format}
            onChange={(event) => {
              const value = event.target.value as "dec" | "hex";
              setFormat(value);
              try {
                localStorage.setItem(
                  "assembly-playground.number-format",
                  value,
                );
              } catch {
                /* Optional preference. */
              }
            }}
          >
            <option value="dec">{t("Dezimal", "Decimal")}</option>
            <option value="hex">Hex</option>
          </select>
          <span className="architecture">
            {architectureLabel(architecture)} · {info.bits}-bit
          </span>
        </div>
        <div
          className="register-values"
          role="list"
          aria-label={t("Registerwerte", "Register values")}
        >
          {getRegisterNames(architecture).map((reg) => (
            <div
              className={`register-row ${changed.includes(reg.native) ? "changed" : ""}`}
              key={reg.native}
              role="listitem"
              title={registerDetail(reg.native, architecture)}
            >
              <strong>{reg.name}</strong>
              <span className="native-register">{reg.native}</span>
              <code data-register={reg.name}>
                {display(state.registers[reg.native] ?? 0)}
              </code>
            </div>
          ))}
        </div>
        <div className={`execution-status ${state.status}`} aria-live="polite">
          <span>{status}</span>
          <span
            title={`${state.steps} ${architectureLabel(architecture)} ${t("Instruktionen", "instructions")}`}
            className="step-counter"
          >
            <b>{state.blocks}</b> {t("Befehle", "blocks")}
          </span>
        </div>
        {state.status === "error" && (
          <p className="runtime-error" role="alert">
            {localizeMessage(state.message)}
          </p>
        )}
        <div className="speed-row">
          <label htmlFor="speed">{t("Tempo", "Speed")}</label>
          <span>{t("langsam", "slow")}</span>
          <input
            id="speed"
            aria-label={t("Ausführungsgeschwindigkeit", "Execution speed")}
            type="range"
            min="0"
            max="3"
            value={[1000, 500, 180, 0].indexOf(delay)}
            onChange={(event) =>
              onDelay([1000, 500, 180, 0][Number(event.target.value)])
            }
          />
          <span>{t("schnell", "fast")}</span>
        </div>
        <section className="stack-panel" aria-label="Stack">
          <div className="stack-heading">
            <h2>Stack</h2>
            <span>
              {count} {t("Werte", "values")}
            </span>
            <code>
              H = 0x{rawPointer.toString(16).toUpperCase().padStart(4, "0")}
            </code>
          </div>
          <div className="stack-columns">
            <span>{t("Adresse", "Address")}</span>
            <span>{t("Wert", "Value")}</span>
          </div>
          <div
            className="stack-scroll"
            tabIndex={0}
            aria-label={t("Stackwerte", "Stack values")}
          >
            {count ? (
              Array.from({ length: count }, (_, index) => {
                const address = pointer + index * info.stackBytes;
                return (
                  <div
                    className={`stack-row ${index === 0 ? "top" : ""}`}
                    key={address}
                  >
                    <code>
                      {index === 0 && <i>H →</i>}0x{hex(address, 4)}
                    </code>
                    <code>
                      {display(
                        info.bits === 64
                          ? memory.getBigUint64(address, true)
                          : memory.getUint32(address, true),
                      )}
                    </code>
                  </div>
                );
              })
            ) : (
              <p className="stack-empty">
                {pointer > MEMORY_SIZE ||
                (pointer > MEMORY_SIZE - info.wordBytes &&
                  pointer !== MEMORY_SIZE)
                  ? t(
                      "H liegt außerhalb des lesbaren Stackbereichs.",
                      "H is outside the readable stack range.",
                    )
                  : t("Der Stack ist leer.", "The stack is empty.")}
              </p>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}
