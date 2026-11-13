import * as Blockly from "blockly/core";
import * as De from "blockly/msg/de";
import * as En from "blockly/msg/en";
import {
  getLanguage,
  setLanguage,
  statementText,
  t,
  type Language,
} from "./i18n";
import { splitEventSections } from "./event-sections";
import { instructionHelp } from "./block-help";
import { BLOCKS, type BlockSpec } from "./blocks";
import {
  compile,
  type CompileResult,
  type SourceBlock,
} from "./engine/compiler";
import {
  binary,
  number,
  operandExpression,
  register,
  type BinaryOperator,
  type Expression,
  type UnaryOperator,
} from "./engine/expressions";
import {
  getRegisterNames,
  registerOptions,
  registerDetail,
  registerName,
} from "./registers";

import {
  architectureInfo,
  getArchitecture,
  isTargetImmediate,
  isTargetRegister,
  integer,
  setArchitecture,
  type Architecture,
} from "./architectures";

type State = Blockly.serialization.blocks.State;
export const configureBlockArchitecture = (architecture: Architecture) =>
  setArchitecture(architecture);
function targetOperand(text: string): Expression {
  if (getArchitecture() === "x86") return operandExpression(text);
  const value = text.trim().toUpperCase();
  if (isTargetRegister(value)) return register(value);
  if (isTargetImmediate(value))
    return number(
      architectureInfo().bits === 64
        ? integer(value).toString()
        : Number(integer(value)),
    );
  const match = value.match(/^\[([A-Z0-9]+)(?:\s*([+-])\s*(\d+))?\]$/);
  if (match) {
    const base = isTargetRegister(match[1])
      ? register(match[1])
      : targetOperand(match[1]);
    return {
      kind: "memory",
      address: match[3]
        ? binary(match[2] === "+" ? "+" : "-", base, number(Number(match[3])))
        : base,
    };
  }
  throw new Error(`Invalid operand for ${getArchitecture()}: ${text}`);
}
export function configureBlockLanguage(language: Language) {
  setLanguage(language);
  Blockly.setLocale(
    Object.fromEntries(
      Object.entries(language === "de" ? De : En).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
  );
}
configureBlockLanguage(getLanguage());
export const theme = Blockly.Theme.defineTheme("asmblocks", {
  name: "asmblocks",
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: "var(--surface)",
    toolboxBackgroundColour: "var(--surface)",
    toolboxForegroundColour: "var(--text)",
    flyoutBackgroundColour: "var(--palette)",
    flyoutForegroundColour: "var(--text)",
    flyoutOpacity: 1,
    scrollbarColour: "var(--scrollbar)",
    scrollbarOpacity: 0.6,
    insertionMarkerColour: "#808080",
    insertionMarkerOpacity: 0.12,
    replacementGlowColour: "#808080",
    replacementGlowOpacity: 0.12,
    selectedGlowColour: "#808080",
    cursorColour: "#855cd6",
  },
  fontStyle: { family: "Arial, sans-serif", weight: "bold", size: 12 },
  blockStyles: {
    event_blocks: {
      colourPrimary: "#ffbf00",
      colourSecondary: "#e6ac00",
      colourTertiary: "#cc9900",
      hat: "cap",
    },
  },
});
const COLORS = {
  register: "#ff8c1a",
  math: "#59c059",
  logic: "#9966ff",
  flow: "#ffbf00",
  stack: "#4c97ff",
  memory: "#4c97ff",
};
export const BINARY_BLOCKS: {
  type: string;
  operator: BinaryOperator;
  text: string;
  logic?: boolean;
  boolean?: boolean;
  tooltip: string;
}[] = [
  {
    type: "value_add",
    operator: "+",
    text: "+",
    tooltip:
      "Addiert zwei ganze Zahlen. Bei 32-Bit-Überlauf wird das Ergebnis umgebrochen.",
  },
  {
    type: "value_subtract",
    operator: "-",
    text: "−",
    tooltip: "Zieht den rechten Wert vom linken ab.",
  },
  {
    type: "value_multiply",
    operator: "*",
    text: "×",
    tooltip: "Multipliziert zwei ganze Zahlen (x86: IMUL).",
  },
  {
    type: "value_divide",
    operator: "/",
    text: "÷",
    tooltip:
      "Ganzzahlige Division: 7 ÷ 2 ergibt 3. Nachkommastellen werden Richtung 0 abgeschnitten. Division durch 0 stoppt den Block.",
  },
  {
    type: "value_modulo",
    operator: "%",
    text: "mod",
    tooltip:
      "Rest einer ganzzahligen Division: 7 mod 3 ergibt 1. Der Rest hat das Vorzeichen des linken Werts.",
  },
  {
    type: "value_min",
    operator: "min",
    text: "min",
    tooltip: "Der kleinere der beiden vorzeichenbehafteten 32-Bit-Werte.",
  },
  {
    type: "value_max",
    operator: "max",
    text: "max",
    tooltip: "Der größere der beiden vorzeichenbehafteten 32-Bit-Werte.",
  },
  {
    type: "value_equal",
    operator: "=",
    text: "=",
    boolean: true,
    logic: true,
    tooltip: "Wahr, wenn beide Werte gleich sind.",
  },
  {
    type: "value_not_equal",
    operator: "!=",
    text: "≠",
    boolean: true,
    logic: true,
    tooltip: "Wahr, wenn die Werte verschieden sind.",
  },
  {
    type: "value_less",
    operator: "<",
    text: "<",
    boolean: true,
    logic: true,
    tooltip: "Vorzeichenbehafteter Vergleich: links ist kleiner als rechts.",
  },
  {
    type: "value_less_equal",
    operator: "<=",
    text: "≤",
    boolean: true,
    logic: true,
    tooltip: "Wahr, wenn links kleiner oder gleich rechts ist.",
  },
  {
    type: "value_greater",
    operator: ">",
    text: ">",
    boolean: true,
    logic: true,
    tooltip: "Vorzeichenbehafteter Vergleich: links ist größer als rechts.",
  },
  {
    type: "value_greater_equal",
    operator: ">=",
    text: "≥",
    boolean: true,
    logic: true,
    tooltip: "Wahr, wenn links größer oder gleich rechts ist.",
  },
  {
    type: "value_and",
    operator: "&",
    text: "Bit-UND",
    logic: true,
    tooltip:
      "Bitweises UND: Ein Ergebnisbit ist nur gesetzt, wenn das entsprechende Bit in beiden Eingaben gesetzt ist.",
  },
  {
    type: "value_or",
    operator: "|",
    text: "Bit-ODER",
    logic: true,
    tooltip:
      "Bitweises ODER: Ein Ergebnisbit ist gesetzt, wenn das entsprechende Bit in mindestens einer Eingabe gesetzt ist.",
  },
  {
    type: "value_xor",
    operator: "^",
    text: "Bit-XOR",
    logic: true,
    tooltip:
      "Bitweises XOR: Ein Ergebnisbit ist gesetzt, wenn das entsprechende Bit in genau einer Eingabe gesetzt ist.",
  },
  {
    type: "value_shift_left",
    operator: "<<",
    text: "<<",
    logic: true,
    tooltip:
      "Schiebt die Bits nach links. Nur die unteren 5 Bits der Anzahl werden benutzt.",
  },
  {
    type: "value_shift_right",
    operator: ">>",
    text: ">>",
    logic: true,
    tooltip:
      "Schiebt die Bits logisch nach rechts. Links werden Nullen eingesetzt.",
  },
];
const UNARY_BLOCKS: {
  type: string;
  operator: UnaryOperator;
  text: string;
  tooltip: string;
}[] = [
  {
    type: "value_abs",
    operator: "abs",
    text: "Betrag von",
    tooltip:
      "Entfernt das Vorzeichen. Ausnahme: −2147483648 passt als positiver Wert nicht in int32 und bleibt durch 32-Bit-Überlauf unverändert.",
  },
  {
    type: "value_negate",
    operator: "neg",
    text: "Gegenzahl von",
    tooltip: "Bildet die Gegenzahl, z. B. 5 → −5.",
  },
  {
    type: "value_not",
    operator: "not",
    text: "Bits umkehren von",
    tooltip: "Invertiert alle 32 Bits des Werts.",
  },
];
function wordHint(text: string) {
  const bits = architectureInfo().bits;
  return text
    .replace(/32(?=-Bit| Bits|-bit| bits)/g, String(bits))
    .replace(/int32/g, `int${bits}`)
    .replace(/−2147483648/g, `−${1n << BigInt(bits - 1)}`)
    .replace(/unteren 5 Bits/g, `unteren ${bits === 64 ? 6 : 5} Bits`);
}
function operatorHint(op: string) {
  const shiftBits = architectureInfo().bits === 64 ? 6 : 5;
  const hints: Record<string, string> = {
    "+": "Adds two 32-bit integers.",
    "-": "Subtracts the right value from the left.",
    "*": "Multiplies two integers using native instructions. The result wraps to the target word width.",
    "/": "Integer division, truncated towards zero: 7 / 2 = 3. Division by zero stops the block.",
    "%": "Signed division remainder: -7 mod 3 = -1.",
    min: "The smaller signed value.",
    max: "The larger signed value.",
    abs: "Absolute value. The minimum int32 value wraps around.",
    neg: "Negates the value.",
    not: "Inverts all 32 bits.",
    "&": "Bitwise AND: a result bit is set only when the corresponding bit is set in both inputs.",
    "|": "Bitwise OR: a result bit is set when the corresponding bit is set in at least one input.",
    "^": "Bitwise XOR: a result bit is set when the corresponding bit is set in exactly one input.",
    "<<": `Logical left shift. The count uses its lowest ${shiftBits} bits.`,
    ">>": `Logical right shift. The count uses its lowest ${shiftBits} bits.`,
    "=": "True if the values are equal.",
    "!=": "True if the values differ.",
    "<": "Signed less-than comparison.",
    "<=": "Signed less-than-or-equal comparison.",
    ">": "Signed greater-than comparison.",
    ">=": "Signed greater-than-or-equal comparison.",
  };
  return hints[op] || op;
}
const values = ["Number", "Boolean"];
class LiteralField extends Blockly.FieldTextInput {
  constructor(value: string | number = "") {
    super(String(value), (text) =>
      text.trim() === ""
        ? ""
        : isTargetImmediate(text.trim())
          ? integer(text.trim()).toString()
          : null,
    );
    this.setSpellcheck(false);
  }
  protected override getDisplayText_() {
    return super.getDisplayText_() || "\u00a0\u00a0";
  }
}
const numberField = (value: string | number = "") => new LiteralField(value);
const dropdown = (target = false) =>
  new Blockly.FieldDropdown(registerOptions(target));
function labelField(name: string) {
  const field = new Blockly.FieldTextInput(name, (text) => {
    let value = text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ß/g, "ss")
      .trim()
      .replace(/[^a-zA-Z0-9_]+/g, "_")
      .slice(0, 64);
    if (!value) return null;
    if (
      /^\d/.test(value) ||
      value.toLowerCase() === "start" ||
      isTargetRegister(value) ||
      BLOCKS.some((block) => block.op.toLowerCase() === value.toLowerCase())
    )
      value = `${t("Marke", "Label")}_${value}`;
    return value;
  });
  field.maxDisplayLength = 16;
  return field;
}
const mainWorkspace = (block: Blockly.Block) =>
  (block.workspace as Blockly.WorkspaceSvg).targetWorkspace || block.workspace;
class LabelDropdown extends Blockly.FieldDropdown {
  pending = "";
  protected override doClassValidation_(value: string) {
    if (typeof value !== "string") return null;
    this.pending = value;
    return value;
  }
  protected override doValueUpdate_(value: string) {
    this.getOptions(false);
    super.doValueUpdate_(value);
  }
  constructor() {
    super(function () {
      const block = this.getSourceBlock();
      const labels = block
        ? mainWorkspace(block)
            .getBlocksByType("asm_label", false)
            .map((label) => String(label.getFieldValue("A")))
        : [];
      if (
        block &&
        mainWorkspace(block).getBlocksByType("asm_start", false).length
      )
        labels.unshift("start");
      const current = (this as LabelDropdown).pending || this.getValue();
      if (current && !labels.includes(current)) labels.push(current);
      return [...new Set(labels.length ? labels : [t("Marke1", "Label1")])].map(
        (label) => [label, label] as [string, string],
      );
    });
    this.maxDisplayLength = 16;
  }
}
const labelDropdown = () => new LabelDropdown();
function numericShadow(value: number | string = 0): State {
  return { type: "value_number", fields: { NUM: value } };
}
function inputState(expression: Expression): { shadow: State; block?: State } {
  return expression.kind === "number"
    ? { shadow: expressionState(expression) }
    : { shadow: numericShadow(), block: expressionState(expression) };
}
export function expressionState(expression: Expression): State {
  if (expression.kind === "number") return numericShadow(expression.value);
  if (expression.kind === "register")
    return { type: "value_register", fields: { REG: expression.register } };
  if (expression.kind === "memory")
    return {
      type: "value_memory",
      inputs: { ADDRESS: inputState(expression.address) },
    };
  if (expression.kind === "unary")
    return {
      type: UNARY_BLOCKS.find(
        (block) => block.operator === expression.operator,
      )!.type,
      inputs: { VALUE: inputState(expression.value) },
    };
  return {
    type: BINARY_BLOCKS.find((block) => block.operator === expression.operator)!
      .type,
    inputs: {
      LEFT: inputState(expression.left),
      RIGHT: inputState(expression.right),
    },
  };
}
Blockly.Blocks.asm_start = {
  init(this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(
        new Blockly.FieldImage(
          `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M5 3 17 10 5 17Z" fill="#389438" stroke="#23742d" stroke-linejoin="round"/></svg>')}`,
          18,
          18,
          "▶",
        ),
      )
      .appendField("start");
    this.setNextStatement(true);
    this.setStyle("event_blocks");
    this.setTooltip(
      t(
        "Hier startet das Programm. Nur dieser Stapel und darüber angesprungene oder aufgerufene Marken werden ausgeführt. Lose Blöcke bleiben unberücksichtigt.",
        "The program starts here. Only this stack and label sections reached through jumps or calls are executed. Parked blocks are ignored.",
      ),
    );
  },
};
Blockly.Blocks.asm_label = {
  init(this: Blockly.Block) {
    const names = new Set(
      mainWorkspace(this)
        .getBlocksByType("asm_label", false)
        .map((block) => block.getFieldValue("A")),
    );
    const prefix = t("Marke", "Label");
    let index = 1;
    while (names.has(`${prefix}${index}`)) index++;
    const input = this.appendDummyInput();
    if (getLanguage() !== "asm") input.appendField(t("Marke", "label"));
    input.appendField(labelField(`${prefix}${index}`), "A");
    if (getLanguage() === "asm") input.appendField(":");
    this.setNextStatement(true);
    this.setStyle("event_blocks");
    this.setTooltip(
      t(
        "Ein eigener Einstiegspunkt. Mit einem Sprung oder Aufruf erreichst du diesen Block.",
        "An entry point. Reach this block with a jump or call.",
      ),
    );
  },
};
class RegisterField extends Blockly.FieldLabelSerializable {
  protected override getDisplayText_() {
    return registerName(String(this.getValue()));
  }
}
Blockly.Blocks.value_register = {
  init(this: Blockly.Block) {
    this.appendDummyInput().appendField(
      new RegisterField(getRegisterNames()[0].native),
      "REG",
    );
    this.setOutput(true, "Number");
    this.setColour(COLORS.register);
    this.setTooltip(() => {
      const register = getRegisterNames().find(
        (item) => item.native === this.getFieldValue("REG"),
      );
      if (!register) return t("Unbekanntes Register.", "Unknown register.");
      return t(
        `${register.name}: der aktuelle Wert. ${registerDetail(register.native)}. Im Assembly-Export: ${register.native}.`,
        `${register.name}: current value. ${registerDetail(register.native)}. Native register: ${register.native}.`,
      );
    });
  },
};
Blockly.Blocks.value_number = {
  init(this: Blockly.Block) {
    this.appendDummyInput().appendField(numberField(""), "NUM");
    this.setOutput(true, "Number");
    this.setColour(COLORS.math);
    this.setTooltip(
      t(
        "Eine ganze Zahl. Ein leeres Zahlenfeld bedeutet 0.",
        "An integer. An empty number input means 0.",
      ),
    );
  },
};
for (const definition of BINARY_BLOCKS)
  Blockly.Blocks[definition.type] = {
    init(this: Blockly.Block) {
      this.appendValueInput("LEFT").setCheck(values);
      this.appendValueInput("RIGHT")
        .setCheck(values)
        .appendField(
          getLanguage() === "de"
            ? definition.text
            : {
                "Bit-UND": "bit AND",
                "Bit-ODER": "bit OR",
                "Bit-XOR": "bit XOR",
              }[definition.text] || definition.text,
        );
      this.setInputsInline(true);
      this.setOutput(true, definition.boolean ? "Boolean" : "Number");
      this.setColour(definition.logic ? COLORS.logic : COLORS.math);
      this.setTooltip(
        t(
          wordHint(definition.tooltip),
          wordHint(operatorHint(definition.operator)),
        ),
      );
    },
  };
for (const definition of UNARY_BLOCKS)
  Blockly.Blocks[definition.type] = {
    init(this: Blockly.Block) {
      this.appendValueInput("VALUE")
        .setCheck(values)
        .appendField(
          getLanguage() === "de"
            ? definition.text
            : getLanguage() === "asm"
              ? definition.operator
              : {
                  abs: "absolute value of",
                  neg: "negative of",
                  not: "invert bits of",
                }[definition.operator],
        );
      this.setInputsInline(true);
      this.setOutput(true, "Number");
      this.setColour(
        definition.operator === "not" ? COLORS.logic : COLORS.math,
      );
      this.setTooltip(
        t(
          wordHint(definition.tooltip),
          wordHint(operatorHint(definition.operator)),
        ),
      );
    },
  };
Blockly.Blocks.value_memory = {
  init(this: Blockly.Block) {
    this.appendValueInput("ADDRESS")
      .setCheck(values)
      .appendField(
        statementText("Wert an Adresse", "value at address", "dword at"),
      );
    this.setOutput(true, "Number");
    this.setColour(COLORS.memory);
    this.setTooltip(
      t(
        `Liest einen ${architectureInfo().bits}-Bit-Wert. Gültige Startadressen: 0 bis ${4096 - architectureInfo().wordBytes}.`,
        `Reads a ${architectureInfo().bits}-bit value. Valid starting addresses: 0 to ${4096 - architectureInfo().wordBytes}.`,
      ),
    );
  },
};
const statementWords: Record<string, [string, string?, string?]> = {
  MOV: ["setze", "auf"],
  ADD: ["ändere", "um"],
  SUB: ["verringere", "um"],
  INC: ["erhöhe", "um 1"],
  DEC: ["verringere", "um 1"],
  NEG: ["negiere"],
  CMP: ["vergleiche", "mit"],
  TEST: ["teste Bits von", "mit"],
  XOR: ["verknüpfe", "XOR"],
  AND: ["verknüpfe", "UND"],
  OR: ["verknüpfe", "ODER"],
  NOT: ["invertiere Bits von"],
  SHL: ["schiebe", "um", "Bits nach links"],
  SHR: ["schiebe", "um", "Bits nach rechts"],
  LABEL: ["Marke"],
  JMP: ["springe zu"],
  JE: ["springe zu", "wenn gleich"],
  JNE: ["springe zu", "wenn ungleich"],
  JG: ["springe zu", "wenn größer"],
  JL: ["springe zu", "wenn kleiner"],
  PUSH: ["lege", "auf den Stack"],
  POP: ["hole vom Stack nach"],
  CALL: ["rufe", "auf"],
  RET: ["kehre zurück"],
  NOP: ["tue nichts"],
};
const englishWords: Record<string, [string, string?, string?]> = {
  MOV: ["set", "to"],
  ADD: ["change", "by"],
  SUB: ["decrease", "by"],
  INC: ["increase", "by 1"],
  DEC: ["decrease", "by 1"],
  NEG: ["negate"],
  CMP: ["compare", "with"],
  TEST: ["test bits of", "with"],
  XOR: ["combine", "XOR"],
  AND: ["combine", "AND"],
  OR: ["combine", "OR"],
  NOT: ["invert bits of"],
  SHL: ["shift", "by", "bits left"],
  SHR: ["shift", "by", "bits right"],
  JMP: ["jump to"],
  JE: ["jump to", "when equal"],
  JNE: ["jump to", "when not equal"],
  JG: ["jump to", "when greater"],
  JL: ["jump to", "when less"],
  PUSH: ["push", "onto the stack"],
  POP: ["pop into"],
  CALL: ["call"],
  RET: ["return"],
  NOP: ["do nothing"],
};
function wordsFor(op: string): [string, string?, string?] {
  if (getLanguage() !== "asm")
    return getLanguage() === "de" ? statementWords[op] : englishWords[op];
  const arch = getArchitecture();
  if (arch.startsWith("arm")) {
    const a64 = arch === "arm64";
    const names: Record<string, string> = {
      ADD: "adds",
      SUB: "subs",
      INC: "adds",
      DEC: "subs",
      JMP: "b",
      JE: a64 ? "b.eq" : "beq",
      JNE: a64 ? "b.ne" : "bne",
      JG: a64 ? "b.gt" : "bgt",
      JL: a64 ? "b.lt" : "blt",
      CALL: "bl",
      RET: a64 ? "ret" : "bx",
      PUSH: "str",
      POP: "ldr",
    };
    return [
      names[op] || op.toLowerCase(),
      ["INC", "DEC"].includes(op) ? ", #1" : "",
      "",
    ];
  }
  return [
    op.toLowerCase(),
    [
      "MOV",
      "ADD",
      "SUB",
      "CMP",
      "TEST",
      "XOR",
      "AND",
      "OR",
      "SHL",
      "SHR",
    ].includes(op)
      ? ","
      : "",
    "",
  ];
}
const jumps = ["JMP", "JE", "JNE", "JG", "JL", "CALL"];
for (const definition of BLOCKS.filter(
  (block) => !["LEA", "LABEL"].includes(block.op),
))
  Blockly.Blocks[`asm_${definition.op.toLowerCase()}`] = {
    init(this: Blockly.Block) {
      const words = wordsFor(definition.op);
      if (!words) return;
      if (definition.op === "PUSH") {
        this.appendValueInput("VALUE").setCheck(values).appendField(words[0]);
        this.appendDummyInput().appendField(words[1]!);
      } else {
        const input = this.appendDummyInput();
        input.appendField(words[0]);
        if (definition.op === "LABEL") {
          const names = new Set(
            mainWorkspace(this)
              .getBlocksByType("asm_label", false)
              .map((block) => block.getFieldValue("A")),
          );
          let name = 1;
          while (names.has(`Marke${name}`)) name++;
          input.appendField(labelField(`Marke${name}`), "A");
        } else if (jumps.includes(definition.op))
          input.appendField(labelDropdown(), "A");
        else if (definition.operands) input.appendField(dropdown(true), "A");
        if (definition.operands === 2) {
          if (["SHL", "SHR"].includes(definition.op))
            input
              .appendField(words[1]!)
              .appendField(new Blockly.FieldNumber(1, 0, 255, 1), "B")
              .appendField(words[2]!);
          else
            this.appendValueInput("VALUE")
              .setCheck(values)
              .appendField(words[1]!);
        } else if (words[1]) input.appendField(words[1]);
      }
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setColour(
        definition.op === "CMP"
          ? COLORS.logic
          : definition.op === "MOV" ||
              ["math", "logic"].includes(definition.category)
            ? COLORS.register
            : COLORS[
                definition.category === "data" ? "memory" : definition.category
              ],
      );
      this.setTooltip(instructionHelp(definition.op));
    },
  };
Blockly.Blocks.asm_branch = {
  init(this: Blockly.Block) {
    this.appendDummyInput()
      .appendField(
        statementText(
          "springe zu",
          "jump to",
          getArchitecture().startsWith("arm") ? "b" : "jmp",
        ),
      )
      .appendField(labelDropdown(), "A");
    this.appendValueInput("VALUE")
      .setCheck("Boolean")
      .appendField(t("wenn", "if"));
    this.setInputsInline(false);
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(COLORS.flow);
    this.setTooltip(
      t(
        "Springt bei wahrer Bedingung zur Marke. Eine leere Bedingung ist falsch.",
        "Jumps to the label if the condition is true. An empty condition is false.",
      ),
    );
  },
};
Blockly.Blocks.asm_store = {
  init(this: Blockly.Block) {
    this.appendValueInput("ADDRESS")
      .setCheck(values)
      .appendField(
        statementText(
          "Speicher an Adresse",
          "memory at address",
          getArchitecture().startsWith("arm")
            ? "str at"
            : `mov ${architectureInfo().bits === 64 ? "qword" : "dword"} at`,
        ),
      );
    this.appendValueInput("VALUE")
      .setCheck(values)
      .appendField(statementText("setze auf", "set to", ","));
    this.setInputsInline(false);
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(COLORS.memory);
    this.setTooltip(
      t(
        `Schreibt einen ${architectureInfo().bits}-Bit-Wert an eine Adresse von 0 bis ${4096 - architectureInfo().wordBytes}.`,
        `Writes a ${architectureInfo().bits}-bit value at an address from 0 to ${4096 - architectureInfo().wordBytes}.`,
      ),
    );
  },
};

function emptyInputs(...names: string[]): NonNullable<State["inputs"]> {
  return Object.fromEntries(
    names.map((name) => [
      name,
      { shadow: { type: "value_number", fields: { NUM: "" } } },
    ]),
  );
}
function toolboxStatement(op: string): Record<string, unknown> {
  const definition = BLOCKS.find((block) => block.op === op);
  const state: State = { type: `asm_${op.toLowerCase()}` };
  if (
    (definition?.operands === 2 && !["SHL", "SHR"].includes(op)) ||
    op === "PUSH"
  )
    state.inputs = emptyInputs("VALUE");
  if (op === "STORE") state.inputs = emptyInputs("ADDRESS", "VALUE");
  return { kind: "block", ...state, gap: 16 };
}
function category(
  id: string,
  name: string,
  color: string,
  contents: Record<string, unknown>[],
) {
  return {
    kind: "category",
    name,
    colour: color,
    cssConfig: { container: `blocklyToolboxCategoryContainer cat-${id}` },
    contents,
  };
}
const operatorToolbox = (definition: (typeof BINARY_BLOCKS)[number]) => ({
  kind: "block",
  type: definition.type,
  inputs: emptyInputs("LEFT", "RIGHT"),
  gap: 18,
});
export function buildToolbox() {
  return {
    kind: "categoryToolbox",
    contents: [
      category("labels", "Labels", COLORS.flow, [
        { kind: "block", type: "asm_start" },
        { kind: "block", type: "asm_label", gap: 20 },
        ...["JMP", "BRANCH", "JE", "JNE", "JG", "JL", "CALL", "RET"].map(
          toolboxStatement,
        ),
      ]),
      category("memory", t("Speicher", "Memory"), COLORS.memory, [
        ...["PUSH", "POP", "STORE"].map(toolboxStatement),
        {
          kind: "block",
          type: "value_memory",
          inputs: emptyInputs("ADDRESS"),
          gap: 18,
        },
      ]),
      category("math", t("Rechnen", "Operators"), COLORS.math, [
        ...BINARY_BLOCKS.filter((block) => !block.logic).map(operatorToolbox),
        ...UNARY_BLOCKS.filter((block) => block.operator !== "not").map(
          (block) => ({
            kind: "block",
            type: block.type,
            inputs: emptyInputs("VALUE"),
            gap: 16,
          }),
        ),
      ]),
      category("logic", t("Logik", "Logic"), COLORS.logic, [
        toolboxStatement("CMP"),
        ...BINARY_BLOCKS.filter((block) => block.logic).map(operatorToolbox),
        {
          kind: "block",
          type: "value_not",
          inputs: emptyInputs("VALUE"),
        },
      ]),
      category("registers", t("Register", "Registers"), COLORS.register, [
        ...["MOV", "ADD", "SUB", "INC", "DEC"].map(toolboxStatement),
        ...getRegisterNames().map((reg) => ({
          kind: "block",
          ...expressionState(register(reg.native)),
          gap: 12,
        })),
      ]),
    ],
  };
}

export function readExpression(
  block: Blockly.Block | null,
  depth = 0,
): Expression {
  if (!block)
    throw new Error(
      "Hier fehlt noch ein Wert. Ziehe einen runden Block in die freie Stelle.",
    );
  if (depth > 48) throw new Error("Dieser Ausdruck ist zu tief verschachtelt.");
  if (block.type === "value_register")
    return register(block.getFieldValue("REG"));
  if (block.type === "value_number")
    return number(
      architectureInfo().bits === 64
        ? String(block.getFieldValue("NUM") || "0")
        : Number(block.getFieldValue("NUM")),
    );
  if (block.type === "value_memory")
    return {
      kind: "memory",
      address: readExpression(block.getInputTargetBlock("ADDRESS"), depth + 1),
    };
  const unary = UNARY_BLOCKS.find((item) => item.type === block.type);
  if (unary)
    return {
      kind: "unary",
      operator: unary.operator,
      value: readExpression(block.getInputTargetBlock("VALUE"), depth + 1),
    };
  const operator = BINARY_BLOCKS.find((item) => item.type === block.type);
  if (operator)
    return binary(
      operator.operator,
      readExpression(block.getInputTargetBlock("LEFT"), depth + 1),
      readExpression(block.getInputTargetBlock("RIGHT"), depth + 1),
    );
  throw new Error("Dieser Block ist kein Wert.");
}
export function readWorkspace(workspace: Blockly.WorkspaceSvg): CompileResult {
  const blocks: SourceBlock[] = [],
    visible: SourceBlock[] = [],
    errors: CompileResult["errors"] = [];
  const tops = workspace
    .getTopBlocks(true)
    .filter((block) => !block.isInsertionMarker() && !block.outputConnection);
  const starts = tops.filter((block) => block.type === "asm_start");
  const labels = tops
    .filter((block) => block.type === "asm_label")
    .sort((a, b) =>
      String(a.getFieldValue("A")).localeCompare(
        String(b.getFieldValue("A")),
        "en",
      ),
    );
  // Only sections structurally reachable from start participate in compilation.
  // Unused hats and loose blocks remain editable/saved, even if incomplete.
  const labelTargets = new Map<string, Blockly.Block[]>();
  for (const label of labels) {
    const name = String(label.getFieldValue("A"));
    labelTargets.set(name, [...(labelTargets.get(name) || []), label]);
  }
  const reachable = new Set<Blockly.Block>(starts);
  const pending: Blockly.Block[] = [...starts];
  while (pending.length) {
    const head = pending.pop()!;
    let current = head.getNextBlock();
    while (current) {
      if (
        jumps.includes(current.type.replace("asm_", "").toUpperCase()) ||
        current.type === "asm_branch"
      ) {
        const target = String(current.getFieldValue("A") || "");
        for (const label of labelTargets.get(target) || [])
          if (!reachable.has(label)) {
            reachable.add(label);
            pending.push(label);
          }
      }
      current = current.getNextBlock();
    }
  }
  if (tops.length && !starts.length)
    errors.push({ id: tops[0].id, message: "Füge einen start-Block hinzu." });
  if (starts.length > 1)
    errors.push({
      id: starts[1].id,
      message: "Es darf nur einen start-Block geben.",
    });
  const activeLabels = labels.filter((label) => reachable.has(label));
  let end = "__scratchsembly_end";
  const names = new Set(activeLabels.map((block) => block.getFieldValue("A")));
  while (names.has(end)) end += "_";
  let count = 0;
  for (const top of [...starts, ...activeLabels]) {
    const isEvent = ["asm_start", "asm_label"].includes(top.type);
    if (isEvent) {
      const head = {
        id: top.id,
        op: "LABEL",
        a:
          top.type === "asm_start"
            ? "start"
            : String(top.getFieldValue("A") || ""),
        b: "",
      };
      blocks.push(head);
      if (top.type === "asm_label") {
        visible.push(head);
        count++;
      }
    }
    let current: Blockly.Block | null = isEvent ? top.getNextBlock() : top;
    let last: SourceBlock | null = null;
    while (current) {
      count++;
      const block: SourceBlock = {
        id: current.id,
        op: current.type.replace("asm_", "").toUpperCase(),
        a: current.getFieldValue("A") || "",
        b: String(current.getFieldValue("B") ?? ""),
      };
      try {
        if (current.getInput("VALUE"))
          block.value =
            block.op === "BRANCH" && !current.getInputTargetBlock("VALUE")
              ? number(0)
              : readExpression(current.getInputTargetBlock("VALUE"));
        if (current.getInput("ADDRESS"))
          block.address = readExpression(
            current.getInputTargetBlock("ADDRESS"),
          );
        blocks.push(block);
        visible.push(block);
        last = block;
      } catch (error) {
        errors.push({
          id: current.id,
          message: error instanceof Error ? error.message : "Ungültiger Block.",
        });
      }
      current = current.getNextBlock();
    }
    // A label is an entry point, never an implicit continuation of an unrelated script.
    // Share the final user's id so the hidden terminator belongs to that same visible step.
    if (!last || !["JMP", "RET"].includes(last.op))
      blocks.push({ id: last?.id || top.id, op: "JMP", a: end, b: "" });
  }
  if (tops.length)
    blocks.push({
      id: "__scratchsembly_end_event__",
      op: "LABEL",
      a: end,
      b: "",
    });
  const result = compile(blocks, getArchitecture());
  result.blockCount = count;
  result.workspaceBlockCount = workspace
    .getAllBlocks(false)
    .filter((block) => !block.isInsertionMarker()).length;
  result.sourceBlocks = visible;
  for (const instruction of result.program.instructions)
    if (["JMP", "B"].includes(instruction.op) && instruction.a === end)
      instruction.hidden = true;
  for (const line of result.lines)
    if (line.id === "__scratchsembly_end_event__") line.id = null;
  result.errors.unshift(...errors);
  return result;
}

export function specState(spec: BlockSpec): State {
  let type = `asm_${spec.op.toLowerCase()}`;
  const fields: Record<string, string> = {};
  const inputs: NonNullable<State["inputs"]> = {};
  const definition = BLOCKS.find((block) => block.op === spec.op);
  if (spec.op === "PUSH")
    inputs.VALUE = inputState(
      spec.value || targetOperand(spec.a || getRegisterNames()[0].native),
    );
  else if (spec.op === "LEA") {
    type = "asm_mov";
    fields.A = spec.a || getRegisterNames()[0].native;
    inputs.VALUE = inputState(
      (
        targetOperand(spec.b || "[0]") as Extract<
          Expression,
          { kind: "memory" }
        >
      ).address,
    );
  } else {
    if (spec.a)
      fields.A = isTargetRegister(spec.a.toUpperCase())
        ? spec.a.toUpperCase()
        : spec.a;
    if (spec.op === "STORE") {
      inputs.ADDRESS = inputState(spec.address || number(0));
      inputs.VALUE = inputState(spec.value || number(0));
    } else if (spec.value)
      inputs.VALUE =
        spec.op === "BRANCH"
          ? { block: expressionState(spec.value) }
          : inputState(spec.value);
    else if (definition?.operands === 2) {
      if (["SHL", "SHR"].includes(spec.op)) fields.B = spec.b || "1";
      else
        inputs.VALUE = inputState(targetOperand(spec.b || definition.b || "0"));
    }
  }
  if (fields.A?.startsWith("[")) {
    type = "asm_store";
    inputs.ADDRESS = inputState(
      (targetOperand(fields.A) as Extract<Expression, { kind: "memory" }>)
        .address,
    );
    delete fields.A;
  }
  return { type, fields, inputs };
}
/** Mark modern saves so parked blocks are never mistaken for pre-hat legacy scripts. */
export function saveWorkspaceData(workspace: Blockly.Workspace) {
  return {
    ...Blockly.serialization.workspaces.save(workspace),
    scratchsemblyWorkspaceVersion: 1,
  };
}
/** Pure, tested migration before Blockly validates the new dropdown/input schema. */
export function migrateWorkspace(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const cloned = structuredClone(data);
  const legacy = cloned.scratchsemblyWorkspaceVersion !== 1;
  const root = cloned.blocks as { blocks?: State[] } | undefined;
  let count = 0;
  const states: State[] = [];
  function migrate(state: State): State {
    if (++count > 2000) throw new Error("Das Projekt enthält zu viele Blöcke.");
    if (
      state.type.startsWith("asm_") &&
      state.fields &&
      !state.inputs?.VALUE &&
      ("B" in state.fields ||
        state.type === "asm_push" ||
        state.type === "asm_lea")
    ) {
      const replacement = specState({
        op: state.type.replace("asm_", "").toUpperCase() as BlockSpec["op"],
        a: String(state.fields.A || ""),
        b: String(state.fields.B || ""),
      });
      state = {
        ...state,
        type: replacement.type,
        fields: replacement.fields,
        inputs: { ...state.inputs, ...replacement.inputs },
      };
    }
    states.push(state);
    for (const connection of Object.values(state.inputs || {})) {
      if (connection.block) connection.block = migrate(connection.block);
      if (connection.shadow) connection.shadow = migrate(connection.shadow);
    }
    if (state.next?.block) state.next.block = migrate(state.next.block);
    return state;
  }
  if (root?.blocks) root.blocks = root.blocks.map(migrate);
  // `start` is now the event entry point. Keep old labels with that name distinct.
  const reserved = states.filter(
    (state) =>
      state.type === "asm_label" &&
      String(state.fields?.A).toLowerCase() === "start",
  );
  const names = new Set(
    states
      .filter((state) => state.type === "asm_label")
      .map((state) => String(state.fields?.A)),
  );
  const renames = new Map<string, string>();
  for (const label of reserved) {
    const old = String(label.fields!.A);
    if (renames.has(old)) continue;
    let name = `label_${old}`;
    while (names.has(name)) name += "_";
    renames.set(old, name);
    names.add(name);
  }
  const legacyHead = root?.blocks?.filter(
    (state) => !state.type.startsWith("value_"),
  );
  const needsEntry =
    legacy && legacyHead?.length === 1 && reserved.includes(legacyHead[0]);
  for (const state of states)
    if (
      state.fields &&
      (state.type === "asm_label" ||
        jumps.includes(state.type.replace("asm_", "").toUpperCase()) ||
        state.type === "asm_branch")
    ) {
      const replacement = renames.get(String(state.fields.A));
      if (replacement) state.fields.A = replacement;
    }
  if (needsEntry && root?.blocks)
    root.blocks = root.blocks.map((state) =>
      state === legacyHead![0]
        ? {
            type: "asm_start",
            x: state.x ?? 120,
            y: state.y ?? 82,
            next: { block: state },
          }
        : state,
    );
  cloned.scratchsemblyWorkspaceVersion = 1;
  return splitEventSections(cloned, legacy);
}
