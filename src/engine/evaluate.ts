import { MEMORY_SIZE, type CpuState } from "./cpu";
import type { Expression } from "./expressions";

/** Read-only Scratch-style value preview. Never runs code or touches registers, flags, or stack. */
export function evaluateExpression(
  expression: Expression,
  state: CpuState,
): number {
  let nodes = 0;
  const evaluate = (value: Expression, depth = 0): number => {
    if (++nodes > 512 || depth > 48)
      throw new Error("Dieser Ausdruck ist zu tief verschachtelt.");
    if (value.kind === "number") {
      if (
        !Number.isInteger(value.value) ||
        Number(value.value) < -2147483648 ||
        Number(value.value) > 0xffffffff
      )
        throw new Error("Zahlen müssen ganze 32-Bit-Werte sein.");
      return Number(value.value) >>> 0;
    }
    if (value.kind === "register")
      return Number(state.registers[value.register]) >>> 0;
    if (value.kind === "memory") {
      const address = evaluate(value.address, depth + 1);
      if (address > MEMORY_SIZE - 4)
        throw new Error(
          `Speicherzugriff außerhalb des erlaubten Bereichs: 0x${address.toString(16)}.`,
        );
      return new DataView(
        state.memory.buffer,
        state.memory.byteOffset,
        state.memory.byteLength,
      ).getUint32(address, true);
    }
    if (value.kind === "unary") {
      const input = evaluate(value.value, depth + 1);
      return (
        (value.operator === "abs"
          ? Math.abs(input | 0)
          : value.operator === "neg"
            ? -input
            : ~input) >>> 0
      );
    }
    const left = evaluate(value.left, depth + 1),
      right = evaluate(value.right, depth + 1);
    const a = left | 0,
      b = right | 0;
    switch (value.operator) {
      case "+":
        return (left + right) >>> 0;
      case "-":
        return (left - right) >>> 0;
      case "*":
        return Math.imul(a, b) >>> 0;
      case "/":
      case "%": {
        if (b === 0) throw new Error("Du kannst nicht durch 0 teilen.");
        if (a === -2147483648 && b === -1)
          throw new Error(
            "Das Ergebnis der Division passt nicht in einen 32-Bit-Wert.",
          );
        return (
          Number(
            value.operator === "/"
              ? BigInt(a) / BigInt(b)
              : BigInt(a) % BigInt(b),
          ) >>> 0
        );
      }
      case "min":
        return Math.min(a, b) >>> 0;
      case "max":
        return Math.max(a, b) >>> 0;
      case "&":
        return (left & right) >>> 0;
      case "|":
        return (left | right) >>> 0;
      case "^":
        return (left ^ right) >>> 0;
      case "<<":
        return (left << (right & 31)) >>> 0;
      case ">>":
        return left >>> (right & 31);
      case "=":
        return +(left === right);
      case "!=":
        return +(left !== right);
      case "<":
        return +(a < b);
      case "<=":
        return +(a <= b);
      case ">":
        return +(a > b);
      case ">=":
        return +(a >= b);
    }
  };
  return evaluate(expression);
}
