import type { Architecture } from "../architectures";

export const REGISTERS = [
  "EAX",
  "EBX",
  "ECX",
  "EDX",
  "ESI",
  "EDI",
  "ESP",
  "EBP",
] as const;
export type Register = (typeof REGISTERS)[number];
export type Op =
  | "MOV"
  | "MOVZX"
  | "IMUL"
  | "IDIV"
  | "CDQ"
  | "CMOVL"
  | "CMOVG"
  | "SETE"
  | "SETNE"
  | "SETL"
  | "SETLE"
  | "SETG"
  | "SETGE"
  | "PUSHFD"
  | "POPFD"
  | "JGE"
  | "JLE"
  | "LEA"
  | "ADD"
  | "SUB"
  | "INC"
  | "DEC"
  | "NEG"
  | "CMP"
  | "TEST"
  | "XOR"
  | "AND"
  | "OR"
  | "NOT"
  | "SHL"
  | "SHR"
  | "PUSH"
  | "POP"
  | "CALL"
  | "RET"
  | "JMP"
  | "JE"
  | "JNE"
  | "JG"
  | "JL"
  | "NOP";
export type Instruction = {
  id: string;
  op: Op | string;
  a: string;
  b: string;
  args?: string[];
  internal?: boolean;
  hidden?: boolean;
};
export type Program = {
  architecture?: Architecture;
  statements?: Record<string, string>;
  instructions: Instruction[];
  labels: Record<string, number>;
};
export type Flags = {
  ZF: boolean;
  SF: boolean;
  CF: boolean;
  OF: boolean;
  PF: boolean;
};
export type CpuState = {
  architecture?: Architecture;
  registers: Record<Register, number> & Record<string, number | string>;
  flags: Flags;
  memory: Uint8Array;
  pc: number;
  steps: number;
  blocks: number;
  status: "ready" | "running" | "paused" | "finished" | "error";
  lastId: string | null;
  message: string;
};
export const MEMORY_SIZE = 4096;
export const isRegister = (value: string): value is Register =>
  REGISTERS.includes(value.toUpperCase() as Register);
export const isMemory = (value: string) => /^\[.*\]$/.test(value.trim());
export const isImmediate = (value: string) =>
  /^-?(?:0x[\da-f]+|\d+)$/i.test(value.trim()) &&
  Number.isSafeInteger(parseImmediate(value)) &&
  parseImmediate(value) >= -2147483648 &&
  parseImmediate(value) <= 0xffffffff;
export function parseImmediate(value: string) {
  const text = value.trim();
  return text.startsWith("-") ? -Number(text.slice(1)) : Number(text);
}
export function isAddress(value: string) {
  if (!isMemory(value)) return false;
  const body = value.slice(1, -1).replace(/\s/g, "").toUpperCase();
  if (isImmediate(body)) return true;
  const match = body.match(
    /^(EAX|EBX|ECX|EDX|ESI|EDI|ESP|EBP)(?:[+-](0X[\dA-F]+|\d+))?$/,
  );
  return (
    !!match &&
    (!match[2] ||
      (Number.isSafeInteger(Number(match[2])) &&
        Number(match[2]) <= 0xffffffff))
  );
}
export function initialState(): CpuState {
  return {
    registers: {
      EAX: 0,
      EBX: 0,
      ECX: 0,
      EDX: 0,
      ESI: 0,
      EDI: 0,
      ESP: MEMORY_SIZE,
      EBP: 0,
    },
    flags: { ZF: false, SF: false, CF: false, OF: false, PF: false },
    memory: new Uint8Array(MEMORY_SIZE),
    pc: 0,
    steps: 0,
    blocks: 0,
    status: "ready",
    lastId: null,
    message:
      "Bereit, wenn du es bist. Starte dein Programm oder führe einen einzelnen Schritt aus.",
  };
}
function address(state: CpuState, operand: string): number {
  const body = operand.slice(1, -1).replace(/\s/g, "").toUpperCase();
  if (isImmediate(body)) return parseImmediate(body) >>> 0;
  const match = body.match(
    /^(EAX|EBX|ECX|EDX|ESI|EDI|ESP|EBP)(?:([+-])(0X[\dA-F]+|\d+))?$/,
  );
  if (!match) throw new Error(`Ungültige Speicheradresse: ${operand}`);
  return (
    (state.registers[match[1] as Register] +
      (match[2] === "-" ? -1 : 1) * Number(match[3] || 0)) >>>
    0
  );
}
function memoryView(state: CpuState, addr: number) {
  if (addr < 0 || addr > MEMORY_SIZE - 4)
    throw new Error(
      `Speicherzugriff außerhalb des erlaubten Bereichs: 0x${addr.toString(16)}.`,
    );
  return new DataView(
    state.memory.buffer,
    state.memory.byteOffset,
    state.memory.byteLength,
  );
}
function read(state: CpuState, operand: string): number {
  const upper = operand.toUpperCase();
  if (upper === "AL") return state.registers.EAX & 255;
  if (upper === "CL") return state.registers.ECX & 255;
  if (isRegister(upper)) return state.registers[upper];
  if (isMemory(operand)) {
    const addr = address(state, operand);
    return memoryView(state, addr).getUint32(addr, true);
  }
  if (isImmediate(operand)) return parseImmediate(operand) >>> 0;
  throw new Error(`Unbekannter Operand: ${operand}`);
}
function write(state: CpuState, operand: string, value: number) {
  const upper = operand.toUpperCase();
  if (upper === "AL")
    state.registers.EAX =
      ((state.registers.EAX & 0xffffff00) | (value & 255)) >>> 0;
  else if (isRegister(upper)) state.registers[upper] = value >>> 0;
  else if (isMemory(operand)) {
    const addr = address(state, operand);
    memoryView(state, addr).setUint32(addr, value >>> 0, true);
  } else
    throw new Error(
      "Das Ziel muss ein Register oder eine Speicheradresse sein.",
    );
}
function resultFlags(state: CpuState, result: number) {
  const n = result >>> 0;
  state.flags.ZF = n === 0;
  state.flags.SF = (n & 0x80000000) !== 0;
  let byte = n & 255;
  let ones = 0;
  while (byte) {
    ones += byte & 1;
    byte >>>= 1;
  }
  state.flags.PF = ones % 2 === 0;
}
function arithmetic(state: CpuState, a: number, b: number, subtract: boolean) {
  const result = (subtract ? a - b : a + b) >>> 0;
  resultFlags(state, result);
  state.flags.CF = subtract ? a < b : a + b > 0xffffffff;
  state.flags.OF = subtract
    ? !!((a ^ b) & (a ^ result) & 0x80000000)
    : !!(~(a ^ b) & (a ^ result) & 0x80000000);
  return result;
}
function push(state: CpuState, value: number) {
  if (state.registers.ESP < 4 || state.registers.ESP > MEMORY_SIZE)
    throw new Error("Auf dem Stack ist kein Platz. Prüfe ESP (Stackzeiger).");
  const addr = (state.registers.ESP - 4) >>> 0;
  memoryView(state, addr).setUint32(addr, value >>> 0, true);
  state.registers.ESP = addr;
}
function pop(state: CpuState) {
  if (state.registers.ESP === MEMORY_SIZE)
    throw new Error("Der Stack ist leer. Lege zuerst einen Wert darauf.");
  const addr = state.registers.ESP;
  const value = memoryView(state, addr).getUint32(addr, true);
  state.registers.ESP = (addr + 4) >>> 0;
  return value;
}
export function step(state: CpuState, program: Program): CpuState {
  if (state.status === "finished" || state.status === "error") return state;
  const instruction = program.instructions[state.pc];
  if (!instruction) {
    state.status = "finished";
    state.message = "Programm erfolgreich beendet.";
    return state;
  }
  const { op, a, b, id } = instruction;
  state.lastId = id;
  const jump = (label: string) => {
    if (!Object.hasOwn(program.labels, label))
      throw new Error(`Das Label „${label}“ existiert nicht.`);
    state.pc = program.labels[label];
  };
  try {
    state.pc++;
    state.steps++;
    state.message = `${op} ${a}${b ? `, ${b}` : ""}`;
    switch (op) {
      case "MOVZX":
      case "MOV":
        write(state, a, read(state, b));
        state.message = `${b} → ${a}: ${read(state, a)}. Flags bleiben unverändert.`;
        break;
      case "LEA":
        write(state, a, address(state, b));
        break;
      case "IMUL": {
        const product = BigInt(read(state, a) | 0) * BigInt(read(state, b) | 0);
        write(state, a, Number(BigInt.asUintN(32, product)));
        state.flags.CF = state.flags.OF =
          product !== BigInt.asIntN(32, product);
        break;
      }
      case "CDQ":
        state.registers.EDX = state.registers.EAX & 0x80000000 ? 0xffffffff : 0;
        break;
      case "IDIV": {
        const divisor = BigInt(read(state, a) | 0);
        if (divisor === 0n) throw new Error("Du kannst nicht durch 0 teilen.");
        const dividend = BigInt.asIntN(
          64,
          (BigInt(state.registers.EDX) << 32n) | BigInt(state.registers.EAX),
        );
        const quotient = dividend / divisor;
        if (quotient < -2147483648n || quotient > 2147483647n)
          throw new Error(
            "Das Ergebnis der Division passt nicht in einen 32-Bit-Wert.",
          );
        state.registers.EAX = Number(BigInt.asUintN(32, quotient));
        state.registers.EDX = Number(BigInt.asUintN(32, dividend % divisor));
        break;
      }
      case "CMOVL":
      case "CMOVG": {
        const less = state.flags.SF !== state.flags.OF;
        if (op === "CMOVL" ? less : !state.flags.ZF && !less)
          write(state, a, read(state, b));
        break;
      }
      case "SETE":
      case "SETNE":
      case "SETL":
      case "SETLE":
      case "SETG":
      case "SETGE": {
        const less = state.flags.SF !== state.flags.OF;
        const condition =
          op === "SETE"
            ? state.flags.ZF
            : op === "SETNE"
              ? !state.flags.ZF
              : op === "SETL"
                ? less
                : op === "SETLE"
                  ? state.flags.ZF || less
                  : op === "SETG"
                    ? !state.flags.ZF && !less
                    : !less;
        write(state, a, +condition);
        break;
      }
      case "PUSHFD":
        push(
          state,
          2 |
            +state.flags.CF |
            (+state.flags.PF << 2) |
            (+state.flags.ZF << 6) |
            (+state.flags.SF << 7) |
            (+state.flags.OF << 11),
        );
        break;
      case "POPFD": {
        const flags = pop(state);
        Object.assign(state.flags, {
          CF: !!(flags & 1),
          PF: !!(flags & 4),
          ZF: !!(flags & 64),
          SF: !!(flags & 128),
          OF: !!(flags & 2048),
        });
        break;
      }
      case "ADD":
      case "SUB":
      case "CMP": {
        const result = arithmetic(
          state,
          read(state, a),
          read(state, b),
          op !== "ADD",
        );
        if (op !== "CMP") write(state, a, result);
        else
          state.message = `Vergleich ${a} mit ${b}: ZF = ${+state.flags.ZF}, SF = ${+state.flags.SF}. Die Operanden bleiben unverändert.`;
        break;
      }
      case "INC":
      case "DEC": {
        const carry = state.flags.CF;
        write(state, a, arithmetic(state, read(state, a), 1, op === "DEC"));
        state.flags.CF = carry;
        state.message = `${a} wird um 1 ${op === "INC" ? "erhöht" : "verringert"} → ${read(state, a)}. CF bleibt unverändert.`;
        break;
      }
      case "NEG":
        write(state, a, arithmetic(state, 0, read(state, a), true));
        break;
      case "NOT":
        write(state, a, ~read(state, a));
        break;
      case "XOR":
      case "AND":
      case "OR":
      case "TEST": {
        const left = read(state, a),
          right = read(state, b);
        const result =
          op === "XOR"
            ? left ^ right
            : op === "OR"
              ? left | right
              : left & right;
        if (op !== "TEST") write(state, a, result);
        resultFlags(state, result);
        state.flags.CF = false;
        state.flags.OF = false;
        break;
      }
      case "SHL":
      case "SHR": {
        const count = read(state, b) & 31;
        if (!count) break;
        const old = read(state, a);
        const result = op === "SHL" ? old << count : old >>> count;
        state.flags.CF =
          op === "SHL"
            ? !!(old & (1 << (32 - count)))
            : !!(old & (1 << (count - 1)));
        if (count === 1)
          state.flags.OF =
            op === "SHL"
              ? !!(result & 0x80000000) !== state.flags.CF
              : !!(old & 0x80000000);
        resultFlags(state, result);
        write(state, a, result);
        break;
      }
      case "JMP":
        jump(a);
        state.message = `Unbedingter Sprung zu „${a}“.`;
        break;
      case "JE":
      case "JNE":
      case "JG":
      case "JGE":
      case "JLE":
      case "JL": {
        const condition =
          op === "JE"
            ? state.flags.ZF
            : op === "JNE"
              ? !state.flags.ZF
              : op === "JG"
                ? !state.flags.ZF && state.flags.SF === state.flags.OF
                : op === "JGE"
                  ? state.flags.SF === state.flags.OF
                  : op === "JLE"
                    ? state.flags.ZF || state.flags.SF !== state.flags.OF
                    : state.flags.SF !== state.flags.OF;
        if (condition) jump(a);
        state.message = `${op}: ${condition ? `Sprung zu „${a}“` : "Kein Sprung"} (ZF=${+state.flags.ZF}, SF=${+state.flags.SF}, OF=${+state.flags.OF}).`;
        break;
      }
      case "PUSH":
        push(state, read(state, a));
        break;
      case "POP":
        write(state, a, pop(state));
        break;
      case "CALL":
        push(state, state.pc);
        jump(a);
        break;
      case "RET": {
        const target = pop(state);
        if (target > program.instructions.length)
          throw new Error("Ungültige Rücksprungadresse auf dem Stack.");
        state.pc = target;
        break;
      }
      case "NOP":
        break;
    }
    if (state.pc >= program.instructions.length) {
      state.status = "finished";
      state.message += " Programm beendet.";
    } else if (state.status !== "running") state.status = "paused";
  } catch (error) {
    state.status = "error";
    state.message =
      error instanceof Error ? error.message : "Unbekannter CPU-Fehler.";
  }
  return state;
}
/** One visible statement, including any lowered expression instructions, is one UI step. */
export function stepBlock(state: CpuState, program: Program): CpuState {
  if (["finished", "error"].includes(state.status)) return state;
  const skipInternal = () => {
    const lastId = state.lastId,
      message = state.message;
    let count = 0;
    while (
      program.instructions[state.pc]?.hidden &&
      !["finished", "error"].includes(state.status) &&
      count++ < 4096
    )
      step(state, program);
    if (state.status !== "error") {
      state.lastId = lastId;
      state.message = message;
    }
  };
  skipInternal();
  if (["finished", "error"].includes(state.status)) return state;
  const id = program.instructions[state.pc]?.id;
  if (!id) return step(state, program);
  const before = {
    registers: { ...state.registers },
    flags: { ...state.flags },
    memory: state.memory.slice(),
    pc: state.pc,
  };
  for (let limit = 0; limit < 4096; limit++) {
    const pc = state.pc;
    step(state, program);
    if (
      state.status === "error" ||
      state.status === "finished" ||
      state.pc !== pc + 1 ||
      program.instructions[state.pc]?.id !== id ||
      program.instructions[state.pc]?.hidden
    )
      break;
    if (limit === 4095) {
      state.status = "error";
      state.message = "Dieser Block benötigt zu viele interne Schritte.";
    }
  }
  state.blocks++;
  if (state.status !== "error") skipInternal();
  if (state.status === "error") {
    state.registers = before.registers;
    state.flags = before.flags;
    state.memory = before.memory;
    state.pc = before.pc;
  }
  return state;
}
export const hex = (value: number, length = 8) =>
  (value >>> 0).toString(16).toUpperCase().padStart(length, "0");
