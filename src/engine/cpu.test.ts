import { describe, expect, it } from "vitest";
import { EXAMPLES, type BlockSpec } from "../blocks";
import { compile } from "./compiler";
import { initialState, step, type CpuState, type Program } from "./cpu";

function program(blocks: BlockSpec[]): Program {
  const result = compile(
    blocks.map((block, index) => ({
      id: String(index),
      op: block.op,
      a: block.a || "",
      b: block.b || "",
    })),
  );
  expect(result.errors).toEqual([]);
  return result.program;
}
function execute(blocks: BlockSpec[]): CpuState {
  const instructions = program(blocks);
  const state = initialState();
  for (
    let i = 0;
    i < 1000 && state.status !== "finished" && state.status !== "error";
    i++
  )
    step(state, instructions);
  return state;
}
const mov = (a: string, b: string): BlockSpec => ({ op: "MOV", a, b });

describe("32-bit x86 simulation", () => {
  it("initializes an isolated 4 KB memory with ESP at its upper bound", () => {
    const first = initialState(),
      second = initialState();
    expect(first.memory.length).toBe(4096);
    expect(first.registers.ESP).toBe(4096);
    first.memory[0] = 42;
    expect(second.memory[0]).toBe(0);
  });
  it("runs the countdown to completion", () => {
    const result = execute(EXAMPLES[0].blocks);
    expect(result.status).toBe("finished");
    expect(result.registers.EAX).toBe(0);
    expect(result.registers.EBX).toBe(5);
    expect(result.steps).toBe(22);
    expect(result.flags.ZF).toBe(true);
  });
  it("sums 1 through 10", () =>
    expect(execute(EXAMPLES[1].blocks).registers.EAX).toBe(55));
  it("handles a stack exchange in last-in-first-out order", () => {
    const state = execute(EXAMPLES[2].blocks);
    expect(state.registers.EAX).toBe(7);
    expect(state.registers.EBX).toBe(42);
    expect(state.registers.ESP).toBe(4096);
  });
  it("sets unsigned carry and zero on 32-bit wraparound", () => {
    const state = execute([
      mov("EAX", "0xffffffff"),
      { op: "ADD", a: "EAX", b: "1" },
    ]);
    expect(state.registers.EAX).toBe(0);
    expect(state.flags).toEqual({
      CF: true,
      OF: false,
      SF: false,
      ZF: true,
      PF: true,
    });
  });
  it("distinguishes signed overflow from unsigned carry", () => {
    const state = execute([
      mov("EAX", "0x7fffffff"),
      { op: "ADD", a: "EAX", b: "1" },
    ]);
    expect(state.registers.EAX).toBe(0x80000000);
    expect(state.flags.OF).toBe(true);
    expect(state.flags.CF).toBe(false);
    expect(state.flags.SF).toBe(true);
  });
  it("sets carry on borrow and preserves it across INC and DEC", () => {
    const state = execute([
      mov("EAX", "0"),
      { op: "SUB", a: "EAX", b: "1" },
      { op: "INC", a: "EAX" },
      { op: "DEC", a: "EBX" },
    ]);
    expect(state.registers.EAX).toBe(0);
    expect(state.registers.EBX).toBe(0xffffffff);
    expect(state.flags.CF).toBe(true);
  });
  it("does not modify the operands of CMP and TEST", () => {
    const state = execute([
      mov("EAX", "7"),
      { op: "CMP", a: "EAX", b: "7" },
      { op: "TEST", a: "EAX", b: "8" },
    ]);
    expect(state.registers.EAX).toBe(7);
    expect(state.flags.ZF).toBe(true);
    expect(state.flags.CF).toBe(false);
  });
  it("uses two’s complement for negative decimal and hex constants", () => {
    const state = execute([mov("EAX", "-1"), mov("EBX", "-0x10")]);
    expect(state.registers.EAX).toBe(0xffffffff);
    expect(state.registers.EBX).toBe(0xfffffff0);
  });
  it("keeps the flags unchanged for MOV and NOT", () => {
    const state = execute([
      { op: "CMP", a: "EAX", b: "0" },
      mov("EBX", "19"),
      { op: "NOT", a: "EBX" },
    ]);
    expect(state.flags.ZF).toBe(true);
    expect(state.flags.PF).toBe(true);
  });
  it("reads and writes dwords in little-endian order", () => {
    const state = execute([
      mov("EBX", "8"),
      mov("[EBX + 4]", "0x12345678"),
      mov("EAX", "[12]"),
    ]);
    expect(Array.from(state.memory.slice(12, 16))).toEqual([
      0x78, 0x56, 0x34, 0x12,
    ]);
    expect(state.registers.EAX).toBe(0x12345678);
  });
  it("computes LEA without accessing memory", () => {
    const state = execute([
      mov("EBX", "4096"),
      { op: "LEA", a: "EAX", b: "[EBX + 4]" },
    ]);
    expect(state.registers.EAX).toBe(4100);
    expect(state.status).toBe("finished");
  });
  it("rejects out-of-bounds accesses and stack underflow", () => {
    expect(execute([mov("EAX", "[4093]")]).status).toBe("error");
    expect(execute([{ op: "POP", a: "EAX" }]).status).toBe("error");
    expect(execute([{ op: "RET" }]).status).toBe("error");
  });
  it("implements logical shifts and count masking", () => {
    const state = execute([
      mov("EAX", "0x80000001"),
      { op: "SHR", a: "EAX", b: "33" },
    ]);
    expect(state.registers.EAX).toBe(0x40000000);
    expect(state.flags.CF).toBe(true);
    expect(state.flags.OF).toBe(true);
  });
  it("does not change flags for a shift by zero", () => {
    const state = execute([
      { op: "CMP", a: "EAX", b: "0" },
      { op: "SHL", a: "EAX", b: "32" },
    ]);
    expect(state.flags.ZF).toBe(true);
    expect(state.flags.PF).toBe(true);
  });
  it("performs signed conditional jumps with negative operands", () => {
    const state = execute([
      mov("EAX", "-1"),
      { op: "CMP", a: "EAX", b: "0" },
      { op: "JL", a: "negativ" },
      mov("EBX", "99"),
      { op: "LABEL", a: "negativ" },
      mov("ECX", "1"),
    ]);
    expect(state.registers.EBX).toBe(0);
    expect(state.registers.ECX).toBe(1);
  });
  it("balances CALL and RET and resumes the caller", () => {
    const state = execute([
      { op: "CALL", a: "funktion" },
      mov("EBX", "7"),
      { op: "JMP", a: "ende" },
      { op: "LABEL", a: "funktion" },
      mov("EAX", "42"),
      { op: "RET" },
      { op: "LABEL", a: "ende" },
      { op: "NOP" },
    ]);
    expect(state.registers.EAX).toBe(42);
    expect(state.registers.EBX).toBe(7);
    expect(state.registers.ESP).toBe(4096);
    expect(state.status).toBe("finished");
  });
});
