import {
  architectureInfo,
  architectureLabel,
  canWriteRegister,
  integer,
  isTargetImmediate,
  isTargetRegister,
  type Architecture,
} from "../architectures";
import type { CompileResult, SourceLine } from "./compiler";
import type { Program } from "./cpu";
import type { Expression, VisualSource } from "./expressions";

const conditions: Record<string, string> = {
  "=": "EQ",
  "!=": "NE",
  "<": "LT",
  "<=": "LE",
  ">": "GT",
  ">=": "GE",
};
const xconditions: Record<string, string> = {
  EQ: "E",
  NE: "NE",
  LT: "L",
  LE: "LE",
  GT: "G",
  GE: "GE",
};

export function compileTarget(
  source: VisualSource[],
  architecture: Exclude<Architecture, "x86">,
): CompileResult {
  const info = architectureInfo(architecture),
    x64 = architecture === "x86_64",
    arm64 = architecture === "arm64";
  const describe = (value: Expression): string =>
    value.kind === "number"
      ? String(value.value)
      : value.kind === "register"
        ? value.register
        : value.kind === "memory"
          ? `[${describe(value.address)}]`
          : value.kind === "unary"
            ? `${value.operator}(${describe(value.value)})`
            : `(${describe(value.left)} ${value.operator} ${describe(value.right)})`;
  const statements: Record<string, string> = Object.create(null);
  for (const block of source)
    if (block.op !== "LABEL" && !statements[block.id])
      statements[block.id] =
        `${block.op} ${block.a}${block.value ? `, ${describe(block.value)}` : block.b ? `, ${block.b}` : ""}`.trim();
  const program: Program = {
    architecture,
    statements,
    instructions: [],
    labels: Object.create(null),
  };
  const comment = x64 ? ";" : "//";
  const lines: SourceLine[] = [
    {
      id: null,
      kind: "comment",
      text: `${comment} scratchsembly · ${architectureLabel(architecture)} · ${info.bits}-bit`,
    },
    {
      id: null,
      kind: "comment",
      text: `${comment} ${info.registers.map((r) => `${r.name}=${r.native}`).join(" ")}`,
    },
    ...(x64
      ? ["bits 64", "section .text"]
      : arm64
        ? [".arch armv8-a", ".text"]
        : [
            ".syntax unified",
            ".arch armv7-a",
            ".arch_extension idiv",
            ".arm",
            ".text",
          ]
    ).map((text) => ({ id: null, kind: "directive" as const, text })),
  ];
  const errors: CompileResult["errors"] = [];
  const names = new Set(source.filter((b) => b.op === "LABEL").map((b) => b.a));
  let serial = 0;
  const unique = () => {
    let name: string;
    do {
      name = `__scratchsembly_expr_${serial++}`;
    } while (names.has(name));
    names.add(name);
    return name;
  };
  const scratch = x64
    ? ["RAX", "RCX", "RDX", "R11"]
    : arm64
      ? ["X0", "X1", "X2", "X3", "X16"]
      : ["R0", "R1", "R2", "R3", "R12"];
  const [a, b, c] = scratch,
    sp = info.stack,
    slot = info.stackBytes;
  let id = "",
    depth = 0,
    flagsOffset = 0,
    nodes = 0,
    newStackOffset = 0;
  const saved = new Map<string, number>();
  const emit = (op: string, ...args: string[]) => {
    program.instructions.push({
      id,
      op,
      a: args[0] || "",
      b: args[1] || "",
      args,
    });
    const operands = args
      .map((arg) => (x64 ? arg.replace(/\[/g, "qword [") : arg))
      .join(", ");
    lines.push({
      id,
      kind: "instruction",
      op: op.toLowerCase(),
      operands,
      text: `    ${op.toLowerCase().padEnd(6)} ${operands}`.trimEnd(),
    });
  };
  const label = (name: string, user = false) => {
    if (Object.hasOwn(program.labels, name))
      throw new Error(`Duplicate label: ${name}`);
    if (
      !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) ||
      isTargetRegister(name, architecture)
    )
      throw new Error(`Invalid label: ${name}`);
    program.labels[name] = program.instructions.length;
    lines.push({ id: user ? id : null, kind: "label", text: `${name}:` });
  };
  const immediate = (n: number | string | bigint) => `${x64 ? "" : "#"}${n}`;
  const memory = (reg: string, offset = 0) =>
    x64
      ? `[${reg}${offset ? ` ${offset < 0 ? "-" : "+"} ${Math.abs(offset)}` : ""}]`
      : `[${reg}${offset ? `, #${offset}` : ""}]`;
  const load = (reg: string, base: string, offset = 0) =>
    emit(
      x64 ? "MOV" : arm64 && offset < 0 ? "LDUR" : "LDR",
      reg,
      memory(base, offset),
    );
  const store = (reg: string, base: string, offset = 0) =>
    emit(
      x64 ? "MOV" : arm64 && offset < 0 ? "STUR" : "STR",
      memory(base, offset),
      reg,
    );
  // ARM syntax puts the stored register before its address.
  const armStore = (reg: string, base: string, offset = 0) => {
    if (x64) store(reg, base, offset);
    else emit(arm64 && offset < 0 ? "STUR" : "STR", reg, memory(base, offset));
  };
  const move = (dest: string, value: string) => emit("MOV", dest, value);
  const adjust = (n: number) => {
    if (x64) emit("LEA", sp, memory(sp, n));
    else emit(n < 0 ? "SUB" : "ADD", sp, sp, immediate(Math.abs(n)));
    depth -= n;
  };
  const push = (reg: string) => {
    if (x64) emit("PUSH", reg);
    else emit("STR", reg, `[${sp}, #-${slot}]!`);
    depth += slot;
  };
  const pop = (reg: string) => {
    if (x64) emit("POP", reg);
    else emit("LDR", reg, `[${sp}], #${slot}`);
    depth -= slot;
  };
  const literal = (reg: string, value: string | number) => {
    if (!isTargetImmediate(String(value), architecture))
      throw new Error(`Expected a ${info.bits}-bit integer.`);
    const bits = BigInt.asUintN(info.bits, integer(value));
    if (x64) move(reg, bits.toString());
    else if (arm64) {
      emit("MOVZ", reg, immediate(bits & 65535n));
      for (let shift = 16; shift < 64; shift += 16)
        emit(
          "MOVK",
          reg,
          immediate((bits >> BigInt(shift)) & 65535n),
          `LSL #${shift}`,
        );
    } else {
      emit("MOVW", reg, immediate(bits & 65535n));
      emit("MOVT", reg, immediate(bits >> 16n));
    }
  };
  const save = () => {
    depth = 0;
    nodes = 0;
    newStackOffset = 0;
    saved.clear();
    adjust(-slot); // Reserve the eventual user PUSH cell, so it cannot overwrite a saved register.
    if (x64) {
      emit("PUSHFQ");
      depth += slot;
      flagsOffset = depth;
    }
    for (const reg of scratch) {
      push(reg);
      saved.set(reg, depth);
    }
    if (!x64) {
      emit("MRS", a, arm64 ? "NZCV" : "APSR");
      push(a);
      flagsOffset = depth;
    }
    if (x64) emit("LEA", a, memory(sp, depth));
    else emit("ADD", a, sp, immediate(depth));
    push(a);
    saved.set(sp, depth);
  };
  const restore = () => {
    pop(a); // The original-SP snapshot, not a user-visible register change.
    if (!x64) {
      pop(a);
      emit("MSR", arm64 ? "NZCV" : "APSR_nzcvq", a);
    }
    for (const reg of [...scratch].reverse()) pop(reg);
    if (x64) {
      emit("POPFQ");
      depth -= slot;
    }
    adjust(slot);
    if (depth !== 0) throw new Error("Unbalanced compiler stack.");
  };
  const original = (dest: string, reg: string) => {
    if (!isTargetRegister(reg, architecture))
      throw new Error(`Unknown register: ${reg}`);
    if (saved.has(reg)) load(dest, sp, depth - saved.get(reg)!);
    else move(dest, reg);
  };
  const commit = (dest: string, reg: string) => {
    if (!canWriteRegister(dest, architecture))
      throw new Error(
        `Register ${dest} is read-only; use the control blocks for PC.`,
      );
    if (dest === sp) {
      armStore(reg, sp, -slot);
      newStackOffset = depth + slot;
    } else if (saved.has(dest)) armStore(reg, sp, depth - saved.get(dest)!);
    else move(dest, reg);
  };
  const finishStackWrite = () => {
    if (!newStackOffset) return;
    if (!arm64) load(sp, sp, -newStackOffset);
    else {
      load(a, sp, -newStackOffset);
      load(b, sp, -saved.get(sp)!);
      emit("ADD", sp, a, "#0");
      load(a, b, -saved.get(a)!);
      load(b, b, -saved.get(b)!);
    }
  };
  const captureFlags = () => {
    if (x64) {
      emit("PUSHFQ");
      emit("POP", a);
    } else emit("MRS", a, arm64 ? "NZCV" : "APSR");
    armStore(a, sp, depth - flagsOffset);
  };
  const compare = (left: string, right: string) => emit("CMP", left, right);
  const boolean = (condition: string) => {
    if (x64) {
      emit(`SET${xconditions[condition]}`, "AL");
      emit("MOVZX", a, "AL");
    } else if (arm64) emit("CSET", a, condition);
    else {
      move(a, "#0");
      emit(`MOV${condition}`, a, "#1");
    }
  };
  const evaluate = (expr: Expression, nesting = 0) => {
    if (++nodes > 512 || nesting > 48)
      throw new Error("Expression limit exceeded (512 nodes / 48 levels).");
    if (expr.kind === "number") literal(a, expr.value);
    else if (expr.kind === "register") original(a, expr.register);
    else if (expr.kind === "memory") {
      evaluate(expr.address, nesting + 1);
      pop(a);
      load(a, a);
    } else if (expr.kind === "unary") {
      evaluate(expr.value, nesting + 1);
      pop(a);
      if (expr.operator === "not")
        emit(x64 ? "NOT" : "MVN", a, ...(x64 ? [] : [a]));
      else if (expr.operator === "neg") {
        if (x64) emit("NEG", a);
        else if (arm64) emit("NEG", a, a);
        else emit("RSB", a, a, "#0");
      } else {
        compare(a, immediate(0));
        if (x64) {
          move(b, a);
          emit("NEG", b);
          compare(a, "0");
          emit("CMOVL", a, b);
        } else if (arm64) emit("CNEG", a, a, "LT");
        else emit("RSBLT", a, a, "#0");
      }
    } else {
      evaluate(expr.left, nesting + 1);
      evaluate(expr.right, nesting + 1);
      pop(b);
      pop(a);
      const op = expr.operator;
      const basic: Record<string, string> = {
        "+": "ADD",
        "-": "SUB",
        "*": x64 ? "IMUL" : "MUL",
        "&": "AND",
        "|": x64 ? "OR" : "ORR",
        "^": x64 ? "XOR" : "EOR",
      };
      if (basic[op]) emit(basic[op], a, ...(x64 ? [b] : [a, b]));
      else if (op === "/" || op === "%") {
        if (x64) {
          emit("CQO");
          emit("IDIV", b);
          if (op === "%") move(a, c);
        } else {
          const nonzero = unique();
          compare(b, "#0");
          emit(arm64 ? "B.NE" : "BNE", nonzero);
          program.instructions.at(-1)!.internal = true;
          emit(arm64 ? "BRK" : "UDF", "#0");
          label(nonzero);
          emit("SDIV", c, a, b);
          if (op === "%") {
            emit("MUL", c, c, b);
            emit("SUB", a, a, c);
          } else move(a, c);
        }
      } else if (op === "<<" || op === ">>") {
        if (x64) emit(op === "<<" ? "SHL" : "SHR", a, "CL");
        else {
          emit("AND", b, b, immediate(info.bits - 1));
          emit(op === "<<" ? "LSL" : "LSR", a, a, b);
        }
      } else if (op === "min" || op === "max") {
        compare(a, b);
        const condition = op === "min" ? "GT" : "LT";
        if (x64) emit(op === "min" ? "CMOVG" : "CMOVL", a, b);
        else if (arm64) emit("CSEL", a, b, a, condition);
        else emit(`MOV${condition}`, a, b);
      } else if (conditions[op]) {
        compare(a, b);
        boolean(conditions[op]);
      } else throw new Error(`Unknown operator: ${op}`);
    }
    push(a);
  };
  const exprFor = (block: VisualSource): Expression => {
    if (block.value) return block.value;
    const text = block.op === "PUSH" ? block.a : block.b;
    return isTargetRegister(text, architecture)
      ? { kind: "register", register: text }
      : { kind: "number", value: text || "0" };
  };
  for (const block of source) {
    id = block.id;
    const start = program.instructions.length,
      lineStart = lines.length;
    try {
      if (block.op === "LABEL") {
        label(block.a, true);
        continue;
      }
      lines.push({ id, kind: "comment", text: `${comment} ${statements[id]}` });
      if (
        [
          "JMP",
          "JE",
          "JNE",
          "JG",
          "JL",
          "JGE",
          "JLE",
          "CALL",
          "RET",
          "NOP",
        ].includes(block.op)
      ) {
        if (x64) emit(block.op, ...(block.a ? [block.a] : []));
        else {
          const map: Record<string, string> = {
            JMP: "B",
            JE: arm64 ? "B.EQ" : "BEQ",
            JNE: arm64 ? "B.NE" : "BNE",
            JG: arm64 ? "B.GT" : "BGT",
            JL: arm64 ? "B.LT" : "BLT",
            JGE: arm64 ? "B.GE" : "BGE",
            JLE: arm64 ? "B.LE" : "BLE",
            CALL: "BL",
            RET: arm64 ? "RET" : "BX",
            NOP: "NOP",
          };
          emit(
            map[block.op],
            ...(block.op === "RET" ? [info.link!] : block.a ? [block.a] : []),
          );
        }
        continue;
      }
      save();
      if (block.op === "POP") {
        original(b, sp);
        load(a, b);
        commit(block.a, a);
        restore();
        if (newStackOffset) finishStackWrite();
        else adjust(slot);
        depth = 0;
      } else if (block.op === "STORE") {
        if (!block.address || !block.value)
          throw new Error("Memory needs an address and a value.");
        evaluate(block.address);
        evaluate(block.value);
        pop(b);
        pop(a);
        armStore(b, a);
        restore();
      } else {
        evaluate(exprFor(block));
        pop(a);
        if (block.op === "BRANCH") {
          compare(a, immediate(0));
          captureFlags();
          restore();
          emit(x64 ? "JNE" : arm64 ? "B.NE" : "BNE", block.a);
        } else if (block.op === "PUSH") {
          const resultOffset = depth + slot,
            originalA = saved.get(a)!;
          restore();
          load(a, sp, -resultOffset);
          push(a);
          load(a, sp, slot - originalA);
          depth = 0;
        } else {
          const op = block.op;
          if (op === "MOV") commit(block.a, a);
          else if (op === "CMP") {
            original(b, block.a);
            compare(b, a);
            captureFlags();
          } else if (["ADD", "SUB", "INC", "DEC"].includes(op)) {
            original(b, block.a);
            if (op === "INC" || op === "DEC") literal(a, 1);
            if (x64 && (op === "INC" || op === "DEC")) emit(op, b);
            else {
              const instruction = op === "SUB" || op === "DEC" ? "SUB" : "ADD";
              emit(
                x64 ? instruction : `${instruction}S`,
                b,
                ...(x64 ? [a] : [b, a]),
              );
            }
            commit(block.a, b);
            captureFlags();
          } else
            throw new Error(
              `Instruction ${op} is not supported by the ${architectureLabel(architecture)} block subset.`,
            );
          restore();
          finishStackWrite();
        }
      }
    } catch (error) {
      program.instructions.splice(start);
      lines.splice(lineStart);
      errors.push({
        id,
        message: error instanceof Error ? error.message : "Invalid block.",
      });
    }
  }
  for (const instruction of program.instructions) {
    if (
      /^(J(?:MP|E|NE|G|L|GE|LE)|CALL|B(?:\.(?:EQ|NE|LT|LE|GT|GE)|EQ|NE|LT|LE|GT|GE)?|BL)$/.test(
        instruction.op,
      ) &&
      !Object.hasOwn(program.labels, instruction.a)
    )
      errors.push({
        id: instruction.id,
        message: `Unknown label: ${instruction.a}`,
      });
  }
  return {
    program,
    lines,
    errors,
    blockCount: source.length,
    sourceBlocks: source,
  };
}
