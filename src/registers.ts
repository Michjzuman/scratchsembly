import {
  architectureInfo,
  canWriteRegister,
  getArchitecture,
  signedWord,
  type Architecture,
} from "./architectures";
import { t } from "./i18n";

export function getRegisterNames(
  architecture: Architecture = getArchitecture(),
) {
  return architectureInfo(architecture).registers.map((reg) => ({
    ...reg,
    detail: registerDetail(reg.native, architecture),
  }));
}
export function registerDetail(
  native: string,
  architecture: Architecture = getArchitecture(),
) {
  const role = architectureInfo(architecture).registers.find(
    (r) => r.native === native,
  )?.role;
  return role === "stack"
    ? t(
        "Stackzeiger: bestimmt die Spitze des Stacks.",
        "Stack pointer: controls the top of the stack.",
      )
    : role === "frame"
      ? t(
          "Basiszeiger; auch als allgemeines Register nutzbar.",
          "Frame pointer; also usable as a general register.",
        )
      : role === "link"
        ? t(
            "Link-Register: Rücksprungadresse nach einem Aufruf.",
            "Link register: return address after a call.",
          )
        : role === "pc"
          ? t("Programmzähler (nur lesbar).", "Program counter (read-only).")
          : t("Allgemeines Register", "General-purpose register");
}
/** Legacy x86 aliases stay stable for old projects. Other architectures use getRegisterNames. */
export const REGISTER_NAMES = getRegisterNames("x86");
export const registerName = (native: string) =>
  getRegisterNames().find((reg) => reg.native === native)?.name || native;
export const registerOptions = (target = false): [string, string][] =>
  getRegisterNames()
    .filter((reg) => !target || canWriteRegister(reg.native))
    .map((reg) => [
      target && reg.role === "stack" ? `${reg.name} (Stack)` : reg.name,
      reg.native,
    ]);
export const friendlyText = (text: string) =>
  text.replace(
    /\b(?:EAX|EBX|ECX|EDX|ESI|EDI|EBP|ESP|RAX|RBX|RCX|RDX|RSI|RDI|RBP|RSP|R\d+|X\d+|SP|LR|PC)\b/g,
    registerName,
  );
export const signed = (value: number | string) => Number(signedWord(value));
