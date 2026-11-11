import { describe, expect, it } from "vitest";
import { assemblyText, compile } from "./compiler";

const block = (op: string, a = "", b = "", id = op) => ({ id, op, a, b });
describe("block compiler and validation", () => {
  it("produces NASM Intel syntax with explicit memory size", () => {
    const result = compile([
      block("MOV", "[16]", "5"),
      block("MOV", "EAX", "[16]", "read"),
    ]);
    expect(result.errors).toEqual([]);
    expect(assemblyText(result)).toContain("mov   dword [16], 5");
    expect(assemblyText(result)).toContain("mov   EAX, dword [16]");
    expect(assemblyText(result)).toContain("bits 32");
  });
  it("labels point at the following executable instruction", () => {
    const result = compile([
      block("MOV", "EAX", "2"),
      block("LABEL", "loop"),
      block("DEC", "EAX"),
      block("JNE", "loop"),
    ]);
    expect(result.program.labels.loop).toBe(1);
    expect(result.program.instructions).toHaveLength(3);
    expect(result.blockCount).toBe(4);
  });
  it("reports duplicate and unresolved labels", () => {
    expect(
      compile([block("LABEL", "loop"), block("LABEL", "loop", "", "second")])
        .errors[0].message,
    ).toContain("mehrfach");
    expect(compile([block("JMP", "missing")]).errors[0].message).toContain(
      "existiert nicht",
    );
  });
  it("rejects immediate destinations and two memory operands", () => {
    expect(compile([block("MOV", "4", "EAX")]).errors).not.toHaveLength(0);
    expect(compile([block("MOV", "[0]", "[4]")]).errors).not.toHaveLength(0);
    expect(compile([block("CMP", "4", "EAX")]).errors).not.toHaveLength(0);
  });
  it("validates LEA operands and supported shift counts", () => {
    expect(compile([block("LEA", "EAX", "4")]).errors).not.toHaveLength(0);
    expect(compile([block("SHL", "EAX", "EBX")]).errors).not.toHaveLength(0);
    expect(compile([block("SHR", "EAX", "256")]).errors).not.toHaveLength(0);
    expect(compile([block("SHL", "EAX", "31")]).errors).toEqual([]);
  });
  it("validates the range of 32-bit constants", () => {
    expect(
      compile([block("MOV", "EAX", "4294967296")]).errors,
    ).not.toHaveLength(0);
    expect(
      compile([block("MOV", "EAX", "-2147483649")]).errors,
    ).not.toHaveLength(0);
    expect(compile([block("MOV", "EAX", "0xFFFFFFFF")]).errors).toEqual([]);
  });
  it("rejects invalid addresses and reserved label names", () => {
    expect(compile([block("MOV", "EAX", "[foo]")]).errors).not.toHaveLength(0);
    expect(compile([block("LABEL", "EAX")]).errors).not.toHaveLength(0);
    expect(compile([block("LABEL", "mov")]).errors).not.toHaveLength(0);
    expect(compile([block("LABEL", "no spaces")]).errors).not.toHaveLength(0);
  });
  it("uses own label properties, not inherited object methods", () => {
    expect(compile([block("JMP", "toString")]).errors).not.toHaveLength(0);
    expect(
      compile([block("LABEL", "__proto__"), block("JMP", "__proto__")]).errors,
    ).toEqual([]);
  });
  it("rejects unknown blocks instead of silently ignoring them", () => {
    expect(compile([block("SOMETHING")]).errors).not.toHaveLength(0);
  });
});
