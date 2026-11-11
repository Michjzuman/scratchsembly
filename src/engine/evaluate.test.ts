import { describe, expect, it } from "vitest";
import { initialState, stepBlock } from "./cpu";
import { compile } from "./compiler";
import { evaluateExpression } from "./evaluate";
import { binary, number, register, type BinaryOperator } from "./expressions";

describe("read-only current-value preview", () => {
  it.each<BinaryOperator>([
    "+",
    "-",
    "*",
    "/",
    "%",
    "min",
    "max",
    "&",
    "|",
    "^",
    "<<",
    ">>",
    "=",
    "!=",
    "<",
    "<=",
    ">",
    ">=",
  ])(
    "%s agrees with the executed x86 expression without touching the CPU",
    (operator) => {
      const state = initialState();
      state.registers.EAX = 17;
      state.registers.EBX = 3;
      const before = structuredClone(state),
        expression = binary(operator, register("EAX"), register("EBX"));
      const preview = evaluateExpression(expression, state);
      expect(state).toEqual(before);
      const result = compile([
        { id: "value", op: "MOV", a: "ECX", b: "", value: expression },
      ]);
      expect(result.errors).toEqual([]);
      stepBlock(state, result.program);
      expect(state.registers.ECX).toBe(preview);
    },
  );
  it("uses the current registers even while the program is paused or finished", () => {
    const state = initialState(),
      expression = binary(
        "*",
        binary("+", register("EAX"), register("EBX")),
        number(3),
      );
    state.status = "paused";
    state.registers.EAX = 12;
    state.registers.EBX = 4;
    expect(evaluateExpression(expression, state)).toBe(48);
    state.status = "finished";
    state.registers.EBX = 5;
    expect(evaluateExpression(expression, state)).toBe(51);
    expect(state.steps).toBe(0);
    expect(state.blocks).toBe(0);
  });
  it("reads memory without allocating temporary stack storage", () => {
    const state = initialState();
    new DataView(state.memory.buffer).setUint32(4092, 42, true);
    const before = structuredClone(state);
    expect(
      evaluateExpression(
        { kind: "memory", address: binary("-", register("ESP"), number(4)) },
        state,
      ),
    ).toBe(42);
    expect(state).toEqual(before);
  });
  it("reports division errors without modifying any state", () => {
    const state = initialState(),
      before = structuredClone(state);
    expect(() =>
      evaluateExpression(binary("/", number(7), number(0)), state),
    ).toThrow("nicht durch 0");
    expect(() =>
      evaluateExpression(binary("/", number(-2147483648), number(-1)), state),
    ).toThrow("32-Bit");
    expect(state).toEqual(before);
  });
  it("keeps integer truncation, signed remainder and wraparound consistent", () => {
    const state = initialState();
    expect(
      evaluateExpression(binary("/", number(-7), number(2)), state) | 0,
    ).toBe(-3);
    expect(
      evaluateExpression(binary("%", number(-7), number(3)), state) | 0,
    ).toBe(-1);
    expect(
      evaluateExpression(binary("+", number(0xffffffff), number(1)), state),
    ).toBe(0);
  });
});
