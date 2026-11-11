import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { assemblyText, compile } from "./compiler";
import { binary, number, type BinaryOperator } from "./expressions";
let nasm = false;
try {
  execFileSync("nasm", ["-v"], { stdio: "ignore" });
  nasm = true;
} catch {
  /* Optional integration test; portable unit tests do not require NASM. */
}
it.skipIf(!nasm)(
  "assembles the expanded operators as a genuine x86 ELF32 object with NASM",
  () => {
    const operations: BinaryOperator[] = [
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
    ];
    const result = compile([
      ...operations.map((operator, index) => ({
        id: String(index),
        op: "MOV",
        a: "EAX",
        b: "",
        value: binary(operator, number(7), number(3)),
      })),
      {
        id: "max",
        op: "MOV",
        a: "EAX",
        b: "",
        value: binary("+", number(0xffffffff), number(1)),
      },
      {
        id: "min",
        op: "MOV",
        a: "EAX",
        b: "",
        value: binary("+", number(-2147483648), number(-1)),
      },
      { id: "literal", op: "PUSH", a: "0xffffffff", b: "" },
      { id: "add-max", op: "ADD", a: "EAX", b: "4294967295" },
    ]);
    expect(result.errors).toEqual([]);
    const directory = mkdtempSync(join(tmpdir(), "asmblocks-nasm-"));
    try {
      const source = join(directory, "operators.asm"),
        object = join(directory, "operators.o");
      writeFileSync(source, assemblyText(result));
      execFileSync("nasm", ["-f", "elf32", "-Werror", source, "-o", object], {
        stdio: "pipe",
      });
      const bytes = readFileSync(object);
      expect(Array.from(bytes.subarray(0, 5))).toEqual([
        0x7f, 0x45, 0x4c, 0x46, 1,
      ]);
      expect(bytes.readUInt16LE(18)).toBe(3); // ELF e_machine = EM_386 (x86).
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
