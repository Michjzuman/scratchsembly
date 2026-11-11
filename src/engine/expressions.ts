import {
  isAddress,
  isImmediate,
  isRegister,
  parseImmediate,
  type Register,
} from "./cpu";

export type BinaryOperator =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "min"
  | "max"
  | "&"
  | "|"
  | "^"
  | "<<"
  | ">>"
  | "="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">=";
export type UnaryOperator = "neg" | "abs" | "not";
export type Expression =
  | { kind: "number"; value: number | string }
  | { kind: "register"; register: string }
  | {
      kind: "binary";
      operator: BinaryOperator;
      left: Expression;
      right: Expression;
    }
  | { kind: "unary"; operator: UnaryOperator; value: Expression }
  | { kind: "memory"; address: Expression };
export type VisualSource = {
  id: string;
  op: string;
  a: string;
  b: string;
  value?: Expression;
  address?: Expression;
};
export type NativeSource = { id: string; op: string; a: string; b: string };
export const number = (value: number | string): Expression => ({
  kind: "number",
  value,
});
export const register = (value: string): Expression => ({
  kind: "register",
  register: value,
});
export const binary = (
  operator: BinaryOperator,
  left: Expression,
  right: Expression,
): Expression => ({ kind: "binary", operator, left, right });
const comparison: Partial<Record<BinaryOperator, string>> = {
  "=": "E",
  "!=": "NE",
  "<": "L",
  "<=": "LE",
  ">": "G",
  ">=": "GE",
};

export function operandExpression(operand: string): Expression {
  const text = operand.trim().toUpperCase();
  if (isRegister(text)) return register(text);
  if (isImmediate(text)) return number(parseImmediate(text));
  if (isAddress(text)) {
    const body = text.slice(1, -1).replace(/\s/g, "");
    if (isImmediate(body))
      return { kind: "memory", address: number(parseImmediate(body)) };
    const match = body.match(
      /^(EAX|EBX|ECX|EDX|ESI|EDI|ESP|EBP)(?:([+-])(0X[\dA-F]+|\d+))?$/,
    )!;
    const base = register(match[1] as Register);
    return {
      kind: "memory",
      address: match[3]
        ? binary(match[2] === "+" ? "+" : "-", base, number(Number(match[3])))
        : base,
    };
  }
  throw new Error(`„${operand}“ ist kein gültiger Wert.`);
}
function direct(expression: Expression): string | null {
  if (expression.kind === "number") return String(expression.value);
  if (expression.kind === "register") return expression.register;
  if (expression.kind === "memory") {
    const address = direct(expression.address);
    if (address && !address.includes("[")) return `[${address}]`;
  }
  return null;
}
/**
 * Lower expression trees to real x86, not synthetic EVAL instructions.
 * A snapshot on the user stack preserves every register and all modelled flags.
 * Register leaves always read that original snapshot, including the original ESP.
 * The result lives at [original ESP - 40] after restoration, until the consuming instruction.
 */
class ExpressionEmitter {
  readonly instructions: NativeSource[] = [];
  private depth = 0;
  private nodes = 0;
  private readonly offsets: Record<Register, number> = {
    EAX: 8,
    EBX: 12,
    ECX: 16,
    EDX: 20,
    ESI: 24,
    EDI: 28,
    EBP: 32,
    ESP: 36,
  };
  constructor(private readonly id: string) {}
  emit(op: string, a = "", b = "") {
    this.instructions.push({ id: this.id, op, a, b });
  }
  push(a: string) {
    this.emit("PUSH", a);
    this.depth += 4;
  }
  pop(a: string) {
    this.emit("POP", a);
    this.depth -= 4;
  }
  save() {
    this.emit("PUSHFD");
    this.depth = 4;
    for (const reg of ["EAX", "EBX", "ECX", "EDX", "ESI", "EDI", "EBP"])
      this.push(reg);
    this.emit("LEA", "EAX", "[ESP + 32]");
    this.push("EAX");
  }
  restore() {
    this.emit("LEA", "ESP", "[ESP + 4]");
    this.depth -= 4;
    for (const reg of ["EBP", "EDI", "ESI", "EDX", "ECX", "EBX", "EAX"])
      this.pop(reg);
    this.emit("POPFD");
    this.depth -= 4;
    if (this.depth !== 0)
      throw new Error(
        "Interner Fehler: Der temporäre Stack ist nicht ausgeglichen.",
      );
  }
  evaluate(expression: Expression, nesting = 0) {
    if (++this.nodes > 512)
      throw new Error(
        "Ein Ausdruck darf höchstens 512 Werte und Operatoren enthalten.",
      );
    if (nesting > 48)
      throw new Error(
        "Der Ausdruck ist zu tief verschachtelt (maximal 48 Ebenen).",
      );
    if (expression.kind === "number") {
      if (
        !Number.isInteger(expression.value) ||
        !isImmediate(String(expression.value))
      )
        throw new Error("Zahlen müssen ganze 32-Bit-Werte sein.");
      this.push(String(expression.value));
      return;
    }
    if (expression.kind === "register") {
      if (!isRegister(expression.register))
        throw new Error("Unbekanntes Register.");
      this.push(`[ESP + ${this.depth - this.offsets[expression.register]}]`);
      return;
    }
    if (expression.kind === "memory") {
      this.evaluate(expression.address, nesting + 1);
      this.pop("EAX");
      this.push("[EAX]");
      return;
    }
    if (expression.kind === "unary") {
      this.evaluate(expression.value, nesting + 1);
      this.pop("EAX");
      if (expression.operator === "neg") this.emit("NEG", "EAX");
      else if (expression.operator === "not") this.emit("NOT", "EAX");
      else {
        this.emit("CDQ");
        this.emit("XOR", "EAX", "EDX");
        this.emit("SUB", "EAX", "EDX");
      }
      this.push("EAX");
      return;
    }
    this.evaluate(expression.left, nesting + 1);
    this.evaluate(expression.right, nesting + 1);
    this.pop("ECX");
    this.pop("EAX");
    const op = expression.operator;
    const simple: Partial<Record<BinaryOperator, string>> = {
      "+": "ADD",
      "-": "SUB",
      "*": "IMUL",
      "&": "AND",
      "|": "OR",
      "^": "XOR",
    };
    if (simple[op]) this.emit(simple[op]!, "EAX", "ECX");
    else if (op === "/" || op === "%") {
      this.emit("CDQ");
      this.emit("IDIV", "ECX");
      if (op === "%") this.emit("MOV", "EAX", "EDX");
    } else if (op === "<<" || op === ">>")
      this.emit(op === "<<" ? "SHL" : "SHR", "EAX", "CL");
    else if (op === "min" || op === "max") {
      this.emit("CMP", "EAX", "ECX");
      this.emit(op === "min" ? "CMOVG" : "CMOVL", "EAX", "ECX");
    } else if (comparison[op]) {
      this.emit("CMP", "EAX", "ECX");
      this.emit(`SET${comparison[op]}`, "AL");
      this.emit("MOVZX", "EAX", "AL");
    } else throw new Error("Unbekannter Operator.");
    this.push("EAX");
  }
  result(expression: Expression) {
    this.save();
    this.evaluate(expression);
    this.pop("EAX");
    this.restore();
    return "[ESP - 40]";
  }
}

export function lowerExpressions(blocks: VisualSource[]): {
  blocks: NativeSource[];
  errors: { id: string; message: string }[];
} {
  const result: NativeSource[] = [];
  const errors: { id: string; message: string }[] = [];
  const labels = new Set(
    blocks.filter((block) => block.op === "LABEL").map((block) => block.a),
  );
  for (const block of blocks) {
    try {
      const emitter = new ExpressionEmitter(block.id);
      if (block.op === "STORE") {
        if (!block.address || !block.value)
          throw new Error(
            "Stecke eine Adresse und einen Wert in den Speicherblock.",
          );
        emitter.save();
        emitter.evaluate(block.address);
        emitter.evaluate(block.value);
        emitter.pop("ECX");
        emitter.pop("EAX");
        emitter.emit("MOV", "[EAX]", "ECX");
        emitter.restore();
      } else if (block.op === "BRANCH") {
        if (!block.value)
          throw new Error("Stecke eine Bedingung in den Sprungblock.");
        if (!labels.has(block.a))
          throw new Error(`Das Label „${block.a}“ existiert nicht.`);
        const condition = block.value;
        const left =
          condition.kind === "binary" ? direct(condition.left) : null;
        const right =
          condition.kind === "binary" ? direct(condition.right) : null;
        const suffix =
          condition.kind === "binary" ? comparison[condition.operator] : null;
        if (condition.kind === "number") {
          if (!isImmediate(String(condition.value)))
            throw new Error("Zahlen müssen ganze 32-Bit-Werte sein.");
          emitter.emit(
            Number(condition.value) >>> 0 ? "JMP" : "NOP",
            Number(condition.value) >>> 0 ? block.a : "",
          );
        } else if (
          suffix &&
          left &&
          right &&
          !isImmediate(left) &&
          !(left.startsWith("[") && right.startsWith("["))
        ) {
          emitter.emit("CMP", left, right);
          emitter.emit(`J${suffix}`, block.a);
        } else {
          const operand = emitter.result(condition);
          emitter.emit("CMP", operand, "0");
          emitter.emit("JNE", block.a);
        }
      } else if (block.value) {
        const operand = direct(block.value) || emitter.result(block.value);
        emitter.emit(block.op, block.a || operand, block.a ? operand : "");
      } else emitter.emit(block.op, block.a, block.b);
      result.push(...emitter.instructions);
    } catch (error) {
      errors.push({
        id: block.id,
        message:
          error instanceof Error ? error.message : "Der Ausdruck ist ungültig.",
      });
    }
  }
  return { blocks: result, errors };
}
