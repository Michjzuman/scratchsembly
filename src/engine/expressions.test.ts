import { describe, expect, it } from "vitest";
import { compile, assemblyText, type SourceBlock } from "./compiler";
import { initialState, stepBlock, type CpuState } from "./cpu";
import {
  binary as b,
  number as n,
  register as r,
  type Expression,
  type BinaryOperator,
} from "./expressions";

const statement = (
  op: string,
  a: string,
  value?: Expression,
  id = op,
): SourceBlock => ({ id, op, a, b: "", value });
function execute(blocks: SourceBlock[], state = initialState()) {
  const result = compile(blocks);
  expect(result.errors).toEqual([]);
  for (
    let i = 0;
    i < 1000 && !["finished", "error"].includes(state.status);
    i++
  )
    stepBlock(state, result.program);
  return state;
}
function calculate(expression: Expression, state?: CpuState) {
  return execute([statement("MOV", "EAX", expression)], state);
}
describe("round value expressions lowered to real x86", () => {
  it.each<[BinaryOperator, number, number, number]>([
    ["+", 7, 3, 10],
    ["-", 7, 3, 4],
    ["*", -7, 3, -21],
    ["/", 7, 2, 3],
    ["/", -7, 2, -3],
    ["%", 7, 3, 1],
    ["%", -7, 3, -1],
    ["min", -8, 5, -8],
    ["max", -8, 5, 5],
    ["&", 7, 3, 3],
    ["|", 4, 3, 7],
    ["^", 7, 3, 4],
    ["<<", 3, 2, 12],
    [">>", -1, 1, 2147483647],
    ["=", 7, 7, 1],
    ["!=", 7, 7, 0],
    ["<", -1, 0, 1],
    ["<=", -1, -1, 1],
    [">", -1, 1, 0],
    [">=", 1, 1, 1],
  ])(
    "%s computes integer results for %i and %i",
    (operator, left, right, expected) => {
      const state = calculate(b(operator, n(left), n(right)));
      expect(state.status).toBe("finished");
      expect(state.registers.EAX | 0).toBe(expected);
      expect(state.registers.ESP).toBe(4096);
      expect(state.blocks).toBe(1);
    },
  );
  it("evaluates nested trees with normal precedence from their connections", () => {
    const state = calculate(b("*", b("+", n(12), n(4)), n(3)));
    expect(state.registers.EAX).toBe(48);
    expect(state.blocks).toBe(1);
    expect(state.steps).toBeGreaterThan(1);
  });
  it("never exposes temporary register changes between visual steps", () => {
    const state = initialState();
    state.registers = {
      EAX: 7,
      EBX: 3,
      ECX: 8,
      EDX: 0xfffffff7,
      ESI: 100,
      EDI: 200,
      EBP: 300,
      ESP: 4096,
    };
    state.flags = { CF: true, ZF: false, SF: true, OF: true, PF: false };
    const before = structuredClone(state);
    const expression = b(
      "+",
      b("*", b("+", r("EAX"), r("ECX")), b("+", r("EBX"), r("EDX"))),
      b("+", b("+", r("ESI"), r("EDI")), r("EBP")),
    );
    calculate(expression, state);
    expect(state.registers).toEqual({ ...before.registers, EAX: 510 });
    expect(state.flags).toEqual(before.flags);
  });
  it("reads original H/ESP, not the temporary compiler stack pointer", () => {
    const state = calculate(b("+", r("ESP"), n(4)));
    expect(state.registers.EAX).toBe(4100);
    expect(state.registers.ESP).toBe(4096);
  });
  it("restores flags before the consuming ADD sets its own real flags", () => {
    const state = initialState();
    state.registers.EAX = 0xffffffff;
    execute([statement("ADD", "EAX", b("+", n(0), n(1)))], state);
    expect(state.registers.EAX).toBe(0);
    expect(state.flags.CF).toBe(true);
    expect(state.flags.ZF).toBe(true);
  });
  it.each([
    ["abs", -7, 7],
    ["neg", 7, -7],
    ["not", 0, -1],
  ] as const)("supports %s", (operator, value, expected) => {
    expect(
      calculate({ kind: "unary", operator, value: n(value) }).registers.EAX | 0,
    ).toBe(expected);
  });
  it("rejects division by zero without committing hidden temporary state", () => {
    const state = initialState();
    state.registers.EAX = 17;
    const before = structuredClone(state);
    calculate(b("/", n(7), n(0)), state);
    expect(state.status).toBe("error");
    expect(state.message).toContain("nicht durch 0");
    expect(state.registers).toEqual(before.registers);
    expect(state.flags).toEqual(before.flags);
    expect(state.memory).toEqual(before.memory);
  });
  it("reports signed division overflow instead of silently wrapping the quotient", () => {
    const state = calculate(b("/", n(-2147483648), n(-1)));
    expect(state.status).toBe("error");
    expect(state.message).toContain("32-Bit");
  });
  it("reads memory through connected address expressions", () => {
    const state = initialState();
    state.registers.EBX = 12;
    new DataView(state.memory.buffer).setUint32(16, 42, true);
    calculate({ kind: "memory", address: b("+", r("EBX"), n(4)) }, state);
    expect(state.registers.EAX).toBe(42);
    expect(state.registers.EBX).toBe(12);
  });
  it("writes connected address and value expressions without clobbering registers", () => {
    const state = initialState();
    state.registers.EAX = 12;
    state.registers.EBX = 3;
    const before = { ...state.registers };
    execute(
      [
        {
          ...statement("STORE", "", b("*", r("EAX"), r("EBX"))),
          address: b("+", r("EAX"), n(4)),
        },
      ],
      state,
    );
    expect(new DataView(state.memory.buffer).getUint32(16, true)).toBe(36);
    expect(state.registers).toEqual(before);
  });
  it("optimizes simple conditions to CMP and a real conditional jump", () => {
    const result = compile([
      statement("BRANCH", "ende", b(">", r("EAX"), n(0)), "branch"),
      { id: "label", op: "LABEL", a: "ende", b: "" },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.program.instructions.map((item) => item.op)).toEqual([
      "CMP",
      "JG",
    ]);
  });
  it("handles computed conditions and label destinations after expansion", () => {
    const state = execute([
      statement("BRANCH", "ende", b("=", b("*", n(3), n(4)), n(12)), "branch"),
      statement("MOV", "EBX", n(99), "skipped"),
      { id: "label", op: "LABEL", a: "ende", b: "" },
      statement("MOV", "EAX", n(42), "last"),
    ]);
    expect(state.registers.EBX).toBe(0);
    expect(state.registers.EAX).toBe(42);
    expect(state.blocks).toBe(2);
  });
  it("keeps only genuine x86 instructions in the NASM export", () => {
    const result = compile([
      statement("MOV", "ECX", b("%", b("*", n(7), n(3)), n(4))),
    ]);
    const text = assemblyText(result);
    expect(text).toContain("imul");
    expect(text).toContain("idiv");
    expect(text).toContain("pushfd");
    expect(text).toContain("popfd");
    expect(text).not.toMatch(/\b(?:eval|store|branch)\b/i);
  });
});
