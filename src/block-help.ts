import type { Block } from "blockly/core";
import {
  architectureInfo,
  getArchitecture,
  type Architecture,
} from "./architectures";
import { BLOCKS } from "./blocks";
import { t } from "./i18n";
import { registerName } from "./registers";

export type BlockInfo = { title: string; description: string };

/** Read block documentation without evaluating its values or executing instructions. */
export function getBlockInfo(block: Block): BlockInfo {
  const native = String(block.getFieldValue("REG") || "");
  return {
    title:
      block.type === "value_register"
        ? `${t("Register", "Register")} ${registerName(native)} (${native})`
        : block.type === "value_number"
          ? t("Ganze Zahl", "Integer literal")
          : block.toString(100),
    description:
      block.getTooltip() ||
      t(
        "Für diesen Block ist keine weitere Erklärung verfügbar.",
        "No additional information is available for this block.",
      ),
  };
}

/** Shared by instruction tooltips and the Info dialog, including target-specific behavior. */
export function instructionHelp(
  op: string,
  architecture: Architecture = getArchitecture(),
): string {
  const info = architectureInfo(architecture),
    arm = architecture.startsWith("arm");
  const stack = `H (${info.stack})`;
  if (op === "PUSH")
    return (
      t(
        `Verringert ${stack} um ${info.stackBytes} Byte und legt einen ${info.bits}-Bit-Wert auf den Stack. Verändert keine Flags.`,
        `Moves ${stack} down by ${info.stackBytes} bytes and stores one ${info.bits}-bit value on the stack. Flags are unchanged.`,
      ) +
      (info.stackBytes > info.wordBytes
        ? t(
            " Der Stackplatz enthält zusätzlich 8 Byte Ausrichtungspadding.",
            " The slot also contains 8 bytes of alignment padding.",
          )
        : "")
    );
  if (op === "POP")
    return t(
      `Liest einen ${info.bits}-Bit-Wert vom Stack ins Zielregister und erhöht ${stack} um ${info.stackBytes} Byte. Ein leerer Stack stoppt die Ausführung. Verändert keine Flags.`,
      `Reads one ${info.bits}-bit value from the stack into the destination register, then moves ${stack} up by ${info.stackBytes} bytes. An empty stack stops execution. Flags are unchanged.`,
    );
  if (op === "CALL")
    return arm
      ? t(
          `Speichert die Rücksprungadresse in ${info.link} und springt zur Marke. RET kehrt zur nächsten Anweisung zurück. Für verschachtelte Aufrufe muss ${info.link} ausdrücklich gesichert werden.`,
          `Stores the return address in ${info.link}, then jumps to the label. RET returns to the following instruction. Save ${info.link} explicitly before making a nested call.`,
        )
      : t(
          `Legt die Rücksprungadresse in einem ${info.stackBytes}-Byte-Stackplatz ab und springt zur Marke. RET kehrt zur nächsten Anweisung zurück.`,
          `Pushes the return address using a ${info.stackBytes}-byte stack slot, then jumps to the label. RET returns to the following instruction.`,
        );
  if (op === "RET")
    return arm
      ? t(
          `Springt zur Rücksprungadresse in ${info.link}. Nach einem verschachtelten Aufruf muss die zuvor gesicherte Adresse wiederhergestellt sein.`,
          `Returns to the address in ${info.link}. After a nested call, restore the previously saved return address first.`,
        )
      : t(
          "Holt die Rücksprungadresse vom Stack und setzt die Ausführung nach dem zugehörigen CALL fort. Ohne gültige Rücksprungadresse ist das ein Fehler.",
          "Pops the return address from the stack and continues after the matching CALL. A valid return address is required.",
        );
  if (op === "INC" || op === "DEC")
    return t(
      `${op === "INC" ? "Erhöht" : "Verringert"} das Ziel um 1. ${arm ? "Wird als ADDS/SUBS ausgeführt und setzt die ARM-Flags NZCV." : "Aktualisiert die Rechenflags, lässt aber das Carry-Flag CF unverändert."}`,
      `${op === "INC" ? "Increases" : "Decreases"} the destination by 1. ${arm ? "Uses ADDS/SUBS and updates the ARM NZCV flags." : "Updates arithmetic flags but preserves the carry flag CF."}`,
    );
  const english: Record<string, string> = {
    MOV: "Copies a value into the destination register or memory location. The source is unchanged. Flags are unchanged.",
    LEA: "Calculates an address and writes it to the destination register without reading memory. Flags are unchanged.",
    ADD: `Adds the input value to the destination and updates CPU flags. The result wraps to ${info.bits} bits.`,
    SUB: `Subtracts the input value from the destination and updates CPU flags. The result wraps to ${info.bits} bits.`,
    NEG: "Replaces the destination with zero minus its current value and updates CPU flags.",
    CMP: "Compares two values and sets the CPU flags for subsequent conditional jumps (for example, when equal or not equal). Does not change any register value.",
    TEST: "Sets flags from a bitwise AND of the operands without storing the result. Neither operand is changed.",
    XOR: "Combines corresponding bits with exclusive OR: a result bit is set when exactly one input bit is set. Stores the result in the destination and updates flags.",
    AND: "Combines corresponding bits with AND: a result bit is set only when both input bits are set. Stores the result in the destination and updates flags.",
    OR: "Combines corresponding bits with OR: a result bit is set when at least one input bit is set. Stores the result in the destination and updates flags.",
    NOT: `Inverts every bit of the ${info.bits}-bit destination. Flags are unchanged.`,
    SHL: "Shifts the destination bits left. Shifted-out bits are discarded and empty low bits are filled with zero. Updates CPU flags.",
    SHR: "Shifts the destination bits right, filling the high bits with zero rather than copying the sign bit. Updates CPU flags.",
    LABEL:
      "Names an entry point reached by jumps or calls. The label itself is not a CPU instruction.",
    JMP: "Continues execution at the selected label unconditionally. It does not save a return address.",
    JE: "Jumps to the selected label when the zero flag is set, usually after comparing two equal values. Otherwise execution continues with the next block.",
    JNE: "Jumps to the selected label when the zero flag is clear, usually after comparing two different values. Otherwise execution continues with the next block.",
    JG: "Jumps when the last signed comparison was greater: the zero flag is clear and the sign and overflow flags are equal. Otherwise continues with the next block.",
    JL: "Jumps when the last signed comparison was less: the sign and overflow flags differ. Otherwise continues with the next block.",
    NOP: "Performs no operation and continues with the next instruction. Registers and flags are unchanged.",
  };
  const german = (
    BLOCKS.find((block) => block.op === op)?.description || op
  ).replace(/32(?=-Bit| Bits)/g, String(info.bits));
  return t(german, english[op] || op);
}
