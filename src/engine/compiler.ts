import { BLOCKS } from "../blocks";
import type { Architecture } from "../architectures";
import { compileTarget } from "./target-compiler";
import {
  isAddress,
  isImmediate,
  isMemory,
  isRegister,
  parseImmediate,
  type Instruction,
  type Program,
} from "./cpu";

import { lowerExpressions, type VisualSource } from "./expressions";
export type SourceBlock = VisualSource;
export type SourceLine = {
  id: string | null;
  text: string;
  kind: "comment" | "directive" | "label" | "instruction";
  op?: string;
  operands?: string;
};
export type CompileResult = {
  program: Program;
  lines: SourceLine[];
  errors: { id: string; message: string }[];
  blockCount: number;
  /** All editor blocks, including parked/unreachable blocks; not an execution count. */
  workspaceBlockCount?: number;
  sourceBlocks: SourceBlock[];
};
const JUMPS = ["JMP", "JE", "JNE", "JG", "JL", "JGE", "JLE", "CALL"];
const INTERNAL: Record<string, { operands: number }> = {
  PUSHFD: { operands: 0 },
  POPFD: { operands: 0 },
  CDQ: { operands: 0 },
  IMUL: { operands: 2 },
  IDIV: { operands: 1 },
  MOVZX: { operands: 2 },
  CMOVL: { operands: 2 },
  CMOVG: { operands: 2 },
  JGE: { operands: 1 },
  JLE: { operands: 1 },
  SETE: { operands: 1 },
  SETNE: { operands: 1 },
  SETL: { operands: 1 },
  SETLE: { operands: 1 },
  SETG: { operands: 1 },
  SETGE: { operands: 1 },
};
const READ_ONLY = ["CMP", "TEST", "PUSH"];
const labelPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function compile(
  sourceBlocks: SourceBlock[],
  architecture: Architecture = "x86",
): CompileResult {
  if (architecture !== "x86") return compileTarget(sourceBlocks, architecture);
  const lowered = lowerExpressions(sourceBlocks);
  const blocks = lowered.blocks;
  const program: Program = {
    instructions: [],
    labels: Object.create(null) as Record<string, number>,
  };
  const lines: SourceLine[] = [
    {
      id: null,
      text: "; A=EAX B=EBX C=ECX D=EDX E=ESI F=EDI G=EBP H=ESP",
      kind: "comment",
    },
    { id: null, text: "bits 32", kind: "directive" },
    { id: null, text: "section .text", kind: "directive" },
    { id: null, text: "", kind: "comment" },
  ];
  const errors: CompileResult["errors"] = [...lowered.errors];
  for (const block of blocks) {
    const { id, op } = block;
    const a = block.a.trim(),
      b = block.b.trim();
    const definition = BLOCKS.find((item) => item.op === op) || INTERNAL[op];
    const error = (message: string) =>
      errors.push({ id, message: `${op}: ${message}` });
    if (!definition) {
      error("Unbekannter Block.");
      continue;
    }
    if (op === "LABEL") {
      if (!labelPattern.test(a))
        error(
          "Ein Label muss mit einem Buchstaben oder Unterstrich beginnen und darf nur Buchstaben, Zahlen und Unterstriche enthalten.",
        );
      if (
        isRegister(a) ||
        Object.hasOwn(INTERNAL, a.toUpperCase()) ||
        BLOCKS.some((item) => item.op.toLowerCase() === a.toLowerCase())
      )
        error("Dieser Name ist als Register oder Instruktion reserviert.");
      if (Object.hasOwn(program.labels, a))
        error(`Das Label „${a}“ wird mehrfach verwendet.`);
      program.labels[a] = program.instructions.length;
      lines.push({ id, text: `${a}:`, kind: "label" });
      continue;
    }
    if (op.startsWith("SET") && a !== "AL")
      error("SETcc benötigt das interne Byte-Register AL.");
    if (definition.operands && !JUMPS.includes(op) && !op.startsWith("SET")) {
      if (!(
        isRegister(a) ||
        isAddress(a) ||
        (READ_ONLY.includes(op) && isImmediate(a))
      ))
        error(`„${a}“ ist kein gültiger Zieloperand.`);
      if (["CMP", "TEST"].includes(op) && isImmediate(a))
        error("Der erste Operand darf keine Konstante sein.");
      if (op === "POP" && !isRegister(a))
        error("POP unterstützt in dieser Version nur Register als Ziel.");
      if (definition.operands === 2) {
        if (!(
          isRegister(b) ||
          isAddress(b) ||
          isImmediate(b) ||
          (op === "MOVZX" && b === "AL") ||
          (["SHL", "SHR"].includes(op) && b === "CL")
        ))
          error(`„${b}“ ist kein gültiger Quelloperand.`);
        if (isMemory(a) && isMemory(b))
          error(
            "Zwei Speicheroperanden sind nicht erlaubt. Verwende ein Register als Zwischenschritt.",
          );
        if (op === "LEA" && (!isRegister(a) || !isAddress(b)))
          error("LEA benötigt ein Zielregister und eine Speicheradresse.");
        if (
          ["SHL", "SHR"].includes(op) &&
          b !== "CL" &&
          (!isImmediate(b) || parseImmediate(b) < 0 || parseImmediate(b) > 255)
        )
          error(
            "Die Schiebeanzahl muss eine Konstante zwischen 0 und 255 sein.",
          );
      }
    }
    const operands =
      definition.operands === 2
        ? `${a}, ${b}`
        : definition.operands === 1
          ? a
          : "";
    // Memory operands are explicitly dword-sized, including immediate-to-memory instructions.
    const assemblyOperands = operands.replace(/\[/g, "dword [");
    lines.push({
      id,
      text: `    ${op.toLowerCase().padEnd(5)} ${assemblyOperands}`.trimEnd(),
      kind: "instruction",
      op: op.toLowerCase(),
      operands: assemblyOperands,
    });
    program.instructions.push({ id, op: op as Instruction["op"], a, b });
  }
  for (const instruction of program.instructions) {
    if (
      JUMPS.includes(instruction.op) &&
      !Object.hasOwn(program.labels, instruction.a)
    ) {
      errors.push({
        id: instruction.id,
        message: `${instruction.op}: Das Label „${instruction.a}“ existiert nicht.`,
      });
    }
  }
  return {
    program,
    lines,
    errors,
    blockCount: sourceBlocks.length,
    sourceBlocks,
  };
}

export function assemblyText(result: CompileResult) {
  return result.lines.map((line) => line.text).join("\n") + "\n";
}
