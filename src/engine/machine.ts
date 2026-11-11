import {
  architectureInfo,
  integer,
  isTargetImmediate,
  isTargetRegister,
  unsignedWord,
  type Architecture,
} from "../architectures";
import {
  initialState,
  MEMORY_SIZE,
  stepBlock,
  type CpuState,
  type Program,
} from "./cpu";
import type { Expression } from "./expressions";

export function createState(architecture: Architecture = "x86"): CpuState {
  if (architecture === "x86") return initialState();
  const info = architectureInfo(architecture),
    state = initialState();
  state.architecture = architecture;
  state.registers = Object.fromEntries(
    info.registers.map((reg) => [reg.native, info.bits === 64 ? "0" : 0]),
  ) as CpuState["registers"];
  state.registers[info.stack] =
    info.bits === 64 ? String(MEMORY_SIZE) : MEMORY_SIZE;
  if (architecture === "arm") state.registers.PC = 8;
  return state;
}

/** Exact, read-only expression evaluation; register values never pass through a JS float. */
export function evaluateTarget(
  expression: Expression,
  state: CpuState,
): bigint {
  const architecture = state.architecture || "x86",
    info = architectureInfo(architecture);
  let nodes = 0;
  const u = (n: bigint) => BigInt.asUintN(info.bits, n),
    s = (n: bigint) => BigInt.asIntN(info.bits, n);
  const visit = (value: Expression, depth = 0): bigint => {
    if (++nodes > 512 || depth > 48)
      throw new Error("Expression limit exceeded.");
    if (value.kind === "number") {
      if (!isTargetImmediate(String(value.value), architecture))
        throw new Error(`Expected a ${info.bits}-bit integer.`);
      return unsignedWord(value.value, architecture);
    }
    if (value.kind === "register") {
      if (!isTargetRegister(value.register, architecture))
        throw new Error(`Unknown register: ${value.register}`);
      return integer(state.registers[value.register]);
    }
    if (value.kind === "memory") {
      const address = visit(value.address, depth + 1);
      if (address < 0n || address > BigInt(MEMORY_SIZE - info.wordBytes))
        throw new Error("Memory address outside the 4 KB simulation.");
      const view = new DataView(
        state.memory.buffer,
        state.memory.byteOffset,
        state.memory.byteLength,
      );
      return info.bits === 64
        ? view.getBigUint64(Number(address), true)
        : BigInt(view.getUint32(Number(address), true));
    }
    if (value.kind === "unary") {
      const v = visit(value.value, depth + 1);
      return u(
        value.operator === "not"
          ? ~v
          : value.operator === "neg"
            ? -v
            : s(v) < 0n
              ? -s(v)
              : v,
      );
    }
    const a = visit(value.left, depth + 1),
      b = visit(value.right, depth + 1),
      sa = s(a),
      sb = s(b);
    switch (value.operator) {
      case "+":
        return u(a + b);
      case "-":
        return u(a - b);
      case "*":
        return u(a * b);
      case "/":
      case "%":
        if (!sb) throw new Error("Du kannst nicht durch 0 teilen.");
        if (
          architecture.startsWith("x86") &&
          sa === -(1n << BigInt(info.bits - 1)) &&
          sb === -1n
        )
          throw new Error(`Signed ${info.bits}-bit division overflow.`);
        return u(value.operator === "/" ? sa / sb : sa % sb);
      case "min":
        return sa < sb ? a : b;
      case "max":
        return sa > sb ? a : b;
      case "&":
        return a & b;
      case "|":
        return a | b;
      case "^":
        return a ^ b;
      case "<<":
        return u(a << (b & BigInt(info.bits - 1)));
      case ">>":
        return a >> (b & BigInt(info.bits - 1));
      case "=":
        return BigInt(a === b);
      case "!=":
        return BigInt(a !== b);
      case "<":
        return BigInt(sa < sb);
      case "<=":
        return BigInt(sa <= sb);
      case ">":
        return BigInt(sa > sb);
      case ">=":
        return BigInt(sa >= sb);
    }
  };
  return visit(expression);
}

function nativeStep(state: CpuState, program: Program) {
  const instruction = program.instructions[state.pc];
  if (!instruction) {
    state.status = "finished";
    return;
  }
  const architecture = program.architecture!,
    info = architectureInfo(architecture),
    x64 = architecture === "x86_64";
  const u = (n: bigint) => BigInt.asUintN(info.bits, n),
    s = (n: bigint) => BigInt.asIntN(info.bits, n);
  const reg = (name: string): bigint => {
    if (name === "AL") return integer(state.registers.RAX) & 255n;
    if (name === "CL") return integer(state.registers.RCX) & 255n;
    if (!isTargetRegister(name, architecture))
      throw new Error(`Unknown register: ${name}`);
    return integer(state.registers[name]);
  };
  const set = (name: string, value: bigint) => {
    if (name === "AL") {
      set("RAX", (reg("RAX") & ~255n) | (value & 255n));
      return;
    }
    if (!isTargetRegister(name, architecture))
      throw new Error(`Unknown register: ${name}`);
    const n = u(value);
    if (architecture === "arm64" && name === "SP" && n % 16n)
      throw new Error("AArch64 SP must remain 16-byte aligned.");
    state.registers[name] = info.bits === 64 ? n.toString() : Number(n);
  };
  const location = (text: string) => {
    const match = text.match(
      /^\[([A-Z0-9]+)(?:\s*(?:,\s*#|([+-])\s*)(-?\d+))?\](!)?(?:,\s*#(\d+))?$/i,
    );
    if (!match) throw new Error(`Invalid memory operand: ${text}`);
    const offset = BigInt(match[3] || "0") * (match[2] === "-" ? -1n : 1n);
    const address = reg(match[1]) + offset;
    return {
      address,
      base: match[1],
      pre: !!match[4],
      post: BigInt(match[5] || "0"),
    };
  };
  const view = (address: bigint) => {
    if (address < 0n || address > BigInt(MEMORY_SIZE - info.wordBytes))
      throw new Error(`Memory access outside the 4 KB simulation: ${address}.`);
    return new DataView(
      state.memory.buffer,
      state.memory.byteOffset,
      state.memory.byteLength,
    );
  };
  const read = (operand: string): bigint => {
    if (operand.startsWith("[")) {
      const loc = location(operand),
        memory = view(loc.address);
      if (loc.pre) set(loc.base, loc.address);
      const result =
        info.bits === 64
          ? memory.getBigUint64(Number(loc.address), true)
          : BigInt(memory.getUint32(Number(loc.address), true));
      if (loc.post) set(loc.base, reg(loc.base) + loc.post);
      return result;
    }
    return isTargetRegister(operand, architecture) ||
      operand === "AL" ||
      operand === "CL"
      ? reg(operand)
      : u(integer(operand.replace(/^#/, "")));
  };
  const write = (operand: string, value: bigint) => {
    if (!operand.startsWith("[")) {
      set(operand, value);
      return;
    }
    const loc = location(operand),
      memory = view(loc.address);
    if (loc.pre) set(loc.base, loc.address);
    if (info.bits === 64)
      memory.setBigUint64(Number(loc.address), u(value), true);
    else memory.setUint32(Number(loc.address), Number(u(value)), true);
    if (loc.post) set(loc.base, reg(loc.base) + loc.post);
  };
  const push = (n: bigint) => {
    const address = reg(info.stack) - BigInt(info.stackBytes);
    write(`[${info.stack} - ${info.stackBytes}]`, n);
    set(info.stack, address);
  };
  const pop = () => {
    const n = read(`[${info.stack}]`);
    set(info.stack, reg(info.stack) + BigInt(info.stackBytes));
    return n;
  };
  const resultFlags = (n: bigint) => {
    state.flags.ZF = u(n) === 0n;
    state.flags.SF = s(n) < 0n;
    let byte = Number(n & 255n),
      count = 0;
    while (byte) {
      count += byte & 1;
      byte >>>= 1;
    }
    if (x64) state.flags.PF = count % 2 === 0;
  };
  const arithmetic = (
    left: bigint,
    right: bigint,
    subtract: boolean,
    flags: boolean,
  ) => {
    const raw = subtract ? left - right : left + right,
      result = u(raw);
    if (flags) {
      resultFlags(result);
      state.flags.CF = subtract
        ? x64
          ? left < right
          : left >= right
        : raw !== result;
      const signed = subtract ? s(left) - s(right) : s(left) + s(right);
      state.flags.OF = signed !== s(result);
    }
    return result;
  };
  const condition = (code: string) => {
    const f = state.flags,
      less = f.SF !== f.OF;
    return (
      {
        E: f.ZF,
        EQ: f.ZF,
        NE: !f.ZF,
        L: less,
        LT: less,
        LE: less || f.ZF,
        G: !less && !f.ZF,
        GT: !less && !f.ZF,
        GE: !less,
      } as Record<string, boolean>
    )[code];
  };
  const packed = () =>
    x64
      ? 2n |
        BigInt(+state.flags.CF) |
        (BigInt(+state.flags.PF) << 2n) |
        (BigInt(+state.flags.ZF) << 6n) |
        (BigInt(+state.flags.SF) << 7n) |
        (BigInt(+state.flags.OF) << 11n)
      : (BigInt(+state.flags.SF) << 31n) |
        (BigInt(+state.flags.ZF) << 30n) |
        (BigInt(+state.flags.CF) << 29n) |
        (BigInt(+state.flags.OF) << 28n);
  const unpack = (n: bigint) => {
    state.flags.SF = !!(n & (x64 ? 128n : 1n << 31n));
    state.flags.ZF = !!(n & (x64 ? 64n : 1n << 30n));
    state.flags.CF = !!(n & (x64 ? 1n : 1n << 29n));
    state.flags.OF = !!(n & (x64 ? 2048n : 1n << 28n));
    if (x64) state.flags.PF = !!(n & 4n);
  };
  const jump = (label: string) => {
    if (!Object.hasOwn(program.labels, label))
      throw new Error(`Unknown label: ${label}`);
    state.pc = program.labels[label];
  };
  const args = instruction.args || [instruction.a, instruction.b],
    [a, b, c, d] = args;
  const op = instruction.op;
  state.pc++;
  state.steps++;
  state.lastId = instruction.id;
  state.message = `${op} ${args.join(", ")}`;
  if (architecture === "arm") state.registers.PC = state.pc * 4 + 4; // A32 operand reads see the architectural PC+8.
  if (op === "MOV" || op === "MOVZX") write(a, read(b));
  else if (op === "LEA") write(a, location(b).address);
  else if (op === "MOVW" || op === "MOVZ") write(a, read(b) & 65535n);
  else if (op === "MOVT" || op === "MOVK") {
    const shift = op === "MOVT" ? 16n : BigInt((c || "LSL #0").split("#")[1]);
    const mask = 65535n << shift;
    write(a, (reg(a) & ~mask) | ((read(b) & 65535n) << shift));
  } else if (op === "LDR" || op === "LDUR") write(a, read(b));
  else if (op === "STR" || op === "STUR") write(b, read(a));
  else if (["ADD", "SUB", "ADDS", "SUBS"].includes(op))
    write(
      a,
      arithmetic(
        read(x64 ? a : b),
        read(x64 ? b : c),
        op.startsWith("SUB"),
        x64 || op.endsWith("S"),
      ),
    );
  else if (op === "CMP" || op === "TEST") {
    if (op === "CMP") arithmetic(read(a), read(b), true, true);
    else {
      resultFlags(read(a) & read(b));
      state.flags.CF = state.flags.OF = false;
    }
  } else if (op === "INC" || op === "DEC") {
    const carry = state.flags.CF;
    write(a, arithmetic(read(a), 1n, op === "DEC", true));
    state.flags.CF = carry;
  } else if (op === "NEG")
    write(a, arithmetic(0n, read(x64 ? a : b), true, x64));
  else if (op === "RSB" || op === "RSBLT") {
    if (op === "RSB" || condition("LT")) write(a, read(c) - read(b));
  } else if (op === "NOT" || op === "MVN") write(a, ~read(x64 ? a : b));
  else if (["AND", "OR", "ORR", "XOR", "EOR"].includes(op)) {
    const left = read(x64 ? a : b),
      right = read(x64 ? b : c);
    const n =
      op === "AND"
        ? left & right
        : op === "OR" || op === "ORR"
          ? left | right
          : left ^ right;
    write(a, n);
    if (x64) {
      resultFlags(n);
      state.flags.CF = state.flags.OF = false;
    }
  } else if (op === "IMUL" || op === "MUL") {
    const product = s(read(x64 ? a : b)) * s(read(x64 ? b : c));
    write(a, product);
    if (x64) state.flags.CF = state.flags.OF = product !== s(product);
  } else if (op === "CQO") set("RDX", s(reg("RAX")) < 0n ? -1n : 0n);
  else if (op === "IDIV") {
    const divisor = s(read(a));
    if (!divisor) throw new Error("Du kannst nicht durch 0 teilen.");
    const dividend = BigInt.asIntN(128, (reg("RDX") << 64n) | reg("RAX")),
      quotient = dividend / divisor;
    if (quotient !== s(quotient))
      throw new Error("Signed 64-bit division overflow.");
    set("RAX", quotient);
    set("RDX", dividend % divisor);
  } else if (op === "SDIV") {
    const divisor = s(read(c));
    write(a, divisor ? s(read(b)) / divisor : 0n);
  } else if (["SHL", "SHR", "LSL", "LSR"].includes(op)) {
    const n = read(x64 ? a : b),
      count = read(x64 ? b : c) & BigInt(info.bits - 1),
      left = op === "SHL" || op === "LSL";
    const result = left ? u(n << count) : n >> count;
    write(a, result);
    if (x64 && count) {
      resultFlags(result);
      state.flags.CF = !!(
        (n >> (left ? BigInt(info.bits) - count : count - 1n)) &
        1n
      );
      if (count === 1n)
        state.flags.OF = left ? s(result) < 0n !== state.flags.CF : s(n) < 0n;
    }
  } else if (op === "MRS") write(a, packed());
  else if (op === "MSR") unpack(read(b));
  else if (op === "PUSHFQ") push(packed());
  else if (op === "POPFQ") unpack(pop());
  else if (op === "PUSH") push(read(a));
  else if (op === "POP") write(a, pop());
  else if (op.startsWith("SET")) write(a, BigInt(!!condition(op.slice(3))));
  else if (op === "CSET") write(a, BigInt(!!condition(b)));
  else if (op === "CSEL") write(a, read(condition(d) ? b : c));
  else if (op === "CNEG") write(a, condition(c) ? -read(b) : read(b));
  else if (op.startsWith("CMOV")) {
    if (condition(op.slice(4))) write(a, read(b));
  } else if (/^MOV(EQ|NE|LT|LE|GT|GE)$/.test(op)) {
    if (condition(op.slice(3))) write(a, read(b));
  } else if (op === "JMP" || op === "B") jump(a);
  else if (op === "CALL" || op === "BL") {
    if (x64) push(BigInt(state.pc));
    else set(info.link!, BigInt(state.pc * 4));
    jump(a);
  } else if (op === "RET" || op === "BX") {
    const address = x64 ? pop() : read(a || info.link!);
    if (!x64 && address % 4n)
      throw new Error(
        "ARM return addresses must be 4-byte aligned (A32/A64, not Thumb).",
      );
    const target = x64 ? address : address / 4n;
    if (target < 0n || target > BigInt(program.instructions.length))
      throw new Error("Invalid return address.");
    state.pc = Number(target);
  } else if (/^(J(E|NE|G|L|GE|LE)|B[.]?(EQ|NE|LT|LE|GT|GE))$/.test(op)) {
    if (condition(op.startsWith("J") ? op.slice(1) : op.replace(/^B\.?/, "")))
      jump(a);
  } else if (op === "UDF" || op === "BRK")
    throw new Error("Du kannst nicht durch 0 teilen.");
  else if (op !== "NOP")
    throw new Error(`Unsupported native instruction: ${op}`);
  if (architecture === "arm") state.registers.PC = state.pc * 4 + 8;
  if (state.pc >= program.instructions.length) state.status = "finished";
  else if (state.status !== "running") state.status = "paused";
}

export function executeBlock(state: CpuState, program: Program): CpuState {
  if ((state.architecture || "x86") !== (program.architecture || "x86")) {
    state.status = "error";
    state.message = "Program and CPU architectures do not match.";
    return state;
  }
  if (!program.architecture || program.architecture === "x86")
    return stepBlock(state, program);
  if (["finished", "error"].includes(state.status)) return state;
  const run = () => {
    try {
      nativeStep(state, program);
    } catch (error) {
      state.status = "error";
      state.message = error instanceof Error ? error.message : "CPU error";
    }
  };
  const skipHidden = () => {
    const last = state.lastId,
      message = state.message;
    for (
      let limit = 0;
      program.instructions[state.pc]?.hidden &&
      !["finished", "error"].includes(state.status) &&
      limit < 8192;
      limit++
    )
      run();
    if (state.status !== "error") {
      state.lastId = last;
      state.message = message;
    }
  };
  skipHidden();
  if (["finished", "error"].includes(state.status)) return state;
  const before = {
      registers: { ...state.registers },
      flags: { ...state.flags },
      memory: state.memory.slice(),
      pc: state.pc,
    },
    id = program.instructions[state.pc]?.id;
  for (let limit = 0; limit < 8192; limit++) {
    const pc = state.pc;
    run();
    if (
      ["finished", "error"].includes(state.status) ||
      (state.pc !== pc + 1 && !program.instructions[pc]?.internal) ||
      program.instructions[state.pc]?.id !== id ||
      program.instructions[state.pc]?.hidden
    )
      break;
    if (limit === 8191) {
      state.status = "error";
      state.message = "Instruction limit exceeded in one block.";
    }
  }
  state.blocks++;
  if (state.status !== "error") {
    skipHidden();
    if (!["error"].includes(state.status) && id && program.statements?.[id])
      state.message =
        program.statements[id] +
        (state.status === "finished" ? " · Programm beendet." : "");
  }
  if (state.status === "error") Object.assign(state, before);
  return state;
}
