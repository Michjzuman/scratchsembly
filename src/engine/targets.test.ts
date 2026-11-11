import { describe, expect, it } from "vitest";
import {
  architectureInfo,
  displayWord,
  type Architecture,
} from "../architectures";
import { exampleBlocks } from "../examples";
import { EXAMPLES, type BlockSpec } from "../blocks";
import { compile, assemblyText } from "./compiler";
import { createState, executeBlock, evaluateTarget } from "./machine";
import {
  binary,
  number,
  register,
  type Expression,
  type VisualSource,
} from "./expressions";
import { MEMORY_SIZE } from "./cpu";
const targets = ["arm", "arm64", "x86_64"] as const;
function compiled(specs: BlockSpec[], arch: Architecture) {
  return compile(
    exampleBlocks(specs, arch).map((b, i) => ({
      ...b,
      id: String(i),
      a: b.a || "",
      b: b.b || "",
    })),
    arch,
  );
}
function run(specs: BlockSpec[], arch: Architecture) {
  const result = compiled(specs, arch);
  expect(result.errors).toEqual([]);
  const state = createState(arch);
  for (
    let i = 0;
    i < 1000 && !["finished", "error"].includes(state.status);
    i++
  )
    executeBlock(state, result.program);
  return { state, result };
}
for (const arch of targets)
  describe(arch, () => {
    const info = architectureInfo(arch),
      [a, b, c] = info.registers.map((r) => r.native);
    it("runs the existing countdown, sum, stack and nested examples", () => {
      for (const [index, expected] of [
        [0, 0],
        [1, 55],
        [2, 7],
        [3, 12],
      ]) {
        const { state } = run(EXAMPLES[index].blocks, arch);
        expect(state.status).toBe("finished");
        expect(BigInt(state.registers[a])).toBe(BigInt(expected));
        expect(BigInt(state.registers[info.stack])).toBe(BigInt(MEMORY_SIZE));
        if (index === 3) expect(BigInt(state.registers[c])).toBe(48n);
      }
    });
    it("evaluates the same signed integer/bit/comparison expressions in preview and native instructions without changing inputs", () => {
      const expressions: Expression[] = [
        ...[
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
        ].map((op) =>
          binary(
            op as Parameters<typeof binary>[0],
            register("EAX"),
            register("EBX"),
          ),
        ),
        ...["abs", "neg", "not"].map(
          (operator) =>
            ({ kind: "unary", operator, value: register("EAX") }) as Expression,
        ),
      ];
      for (const expression of expressions) {
        const specs: BlockSpec[] = [
          { op: "MOV", a: "EAX", b: "-7" },
          { op: "MOV", a: "EBX", b: "3" },
          { op: "MOV", a: "ECX", value: expression },
        ];
        const result = compiled(specs, arch),
          state = createState(arch);
        expect(result.errors).toEqual([]);
        executeBlock(state, result.program);
        executeBlock(state, result.program);
        const adapted = exampleBlocks([specs[2]], arch)[0].value!;
        const snapshot = structuredClone(state);
        const expected = evaluateTarget(adapted, state);
        expect(state).toEqual(snapshot);
        const flags = { ...state.flags };
        executeBlock(state, result.program);
        expect(state.status, JSON.stringify(expression)).not.toBe("error");
        expect(BigInt(state.registers[c]), JSON.stringify(expression)).toBe(
          expected,
        );
        expect(state.flags).toEqual(flags);
        expect(displayWord(state.registers[a], arch)).toBe("-7");
        expect(BigInt(state.registers[b])).toBe(3n);
        expect(BigInt(state.registers[info.stack])).toBe(4096n);
      }
    });
    it("can use every general register, including saved scratch and extended registers", () => {
      const regs = info.registers.filter(
        (r) => r.role !== "stack" && r.role !== "pc",
      );
      const source: VisualSource[] = regs.map((r, i) => ({
        id: String(i),
        op: "MOV",
        a: r.native,
        b: String(i + 11),
      }));
      const state = createState(arch),
        result = compile(source, arch);
      expect(result.errors).toEqual([]);
      for (let i = 0; i < regs.length; i++) executeBlock(state, result.program);
      expect(state.status).toBe("finished");
      for (const [i, reg] of regs.entries())
        expect(BigInt(state.registers[reg.native]), reg.native).toBe(
          BigInt(i + 11),
        );
      expect(BigInt(state.registers[info.stack])).toBe(4096n);
    });
    it("uses native carry/no-borrow and signed-overflow semantics", () => {
      const result = compiled(
        [
          { op: "MOV", a: "EAX", b: "0" },
          { op: "CMP", a: "EAX", b: "1" },
          {
            op: "MOV",
            a: "EAX",
            b: String((1n << BigInt(info.bits - 1)) - 1n),
          },
          { op: "ADD", a: "EAX", b: "1" },
        ],
        arch,
      );
      const state = createState(arch);
      executeBlock(state, result.program);
      executeBlock(state, result.program);
      expect(state.flags.CF).toBe(arch === "x86_64");
      expect(state.flags.SF).toBe(true);
      executeBlock(state, result.program);
      executeBlock(state, result.program);
      expect(state.flags.OF).toBe(true);
      expect(state.flags.CF).toBe(false);
      expect(state.flags.SF).toBe(true);
    });
    it("reads/writes a native-sized memory word and pushes/pops a native stack slot", () => {
      const { state } = run(
        [
          { op: "STORE", address: number(256), value: number(123) },
          {
            op: "MOV",
            a: "EAX",
            value: { kind: "memory", address: number(256) },
          },
          { op: "PUSH", a: "EAX" },
          { op: "POP", a: "EBX" },
        ],
        arch,
      );
      expect(state.status).toBe("finished");
      expect(BigInt(state.registers[a])).toBe(123n);
      expect(BigInt(state.registers[b])).toBe(123n);
      expect(BigInt(state.registers[info.stack])).toBe(4096n);
    });
    it("preserves registers, flags and SP on arithmetic errors", () => {
      const result = compiled(
        [
          { op: "MOV", a: "EAX", b: "9" },
          { op: "MOV", a: "EBX", value: binary("/", number(8), number(0)) },
        ],
        arch,
      );
      const state = createState(arch);
      executeBlock(state, result.program);
      const before = structuredClone(state);
      executeBlock(state, result.program);
      expect(state.status).toBe("error");
      expect(state.registers).toEqual(before.registers);
      expect(state.memory).toEqual(before.memory);
      expect(state.flags).toEqual(before.flags);
    });
    it("uses actual native call/return and explicit saved LR for nested ARM calls", () => {
      const link = info.link;
      const source: VisualSource[] = [
        { id: "0", op: "CALL", a: "fn", b: "" },
        { id: "1", op: "JMP", a: "done", b: "" },
        { id: "2", op: "LABEL", a: "fn", b: "" },
        ...(link ? [{ id: "3", op: "PUSH", a: link, b: "" }] : []),
        { id: "4", op: "CALL", a: "nested", b: "" },
        ...(link ? [{ id: "5", op: "POP", a: link, b: "" }] : []),
        { id: "6", op: "RET", a: "", b: "" },
        { id: "7", op: "LABEL", a: "nested", b: "" },
        { id: "8", op: "MOV", a, b: "42" },
        { id: "9", op: "RET", a: "", b: "" },
        { id: "10", op: "LABEL", a: "done", b: "" },
      ];
      const result = compile(source, arch),
        state = createState(arch);
      expect(result.errors).toEqual([]);
      for (
        let i = 0;
        i < 30 && state.status !== "finished" && state.status !== "error";
        i++
      )
        executeBlock(state, result.program);
      expect(state.status).toBe("finished");
      expect(BigInt(state.registers[a])).toBe(42n);
      expect(BigInt(state.registers[info.stack])).toBe(4096n);
      expect(assemblyText(result)).toContain(arch === "x86_64" ? "call" : "bl");
    });
    it("writes SP only after restoring its compiler frame, without corrupting registers", () => {
      const { state } = run(
        [
          { op: "MOV", a: "EAX", b: "42" },
          { op: "MOV", a: "ESP", b: "2048" },
          { op: "MOV", a: "EBX", b: "9" },
        ],
        arch,
      );
      expect(state.status).toBe("finished");
      expect(BigInt(state.registers[info.stack])).toBe(2048n);
      expect(BigInt(state.registers[a])).toBe(42n);
      expect(BigInt(state.registers[b])).toBe(9n);
    });
    it("refuses to execute a different architecture's program", () => {
      const result = compiled([{ op: "MOV", a: "EAX", b: "1" }], arch),
        state = createState("x86");
      const registers = { ...state.registers };
      executeBlock(state, result.program);
      expect(state.status).toBe("error");
      expect(state.registers).toEqual(registers);
    });
    it("checks destination registers instead of silently retargeting an invalid project", () => {
      expect(
        compile([{ id: "bad", op: "MOV", a: "EAX", b: "1" }], arch).errors
          .length,
      ).toBeGreaterThan(0);
      expect(
        compile([{ id: "bad", op: "MOV", a: "PC", b: "1" }], arch).errors
          .length,
      ).toBeGreaterThan(0);
    });
  });
for (const arch of ["arm64", "x86_64"] as const)
  it(`${arch} keeps every bit beyond Number.MAX_SAFE_INTEGER`, () => {
    const literal = "9223372036854775807";
    const { state } = run(
      [
        { op: "MOV", a: "EAX", b: literal },
        { op: "ADD", a: "EAX", b: "1" },
        { op: "PUSH", a: "EAX" },
        { op: "POP", a: "EBX" },
      ],
      arch,
    );
    const info = architectureInfo(arch),
      [a, b] = info.registers.map((r) => r.native);
    expect(state.status).toBe("finished");
    expect(state.registers[a]).toBe("9223372036854775808");
    expect(displayWord(state.registers[b], arch)).toBe("-9223372036854775808");
  });
