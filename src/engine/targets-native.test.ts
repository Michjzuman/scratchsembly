import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compile, assemblyText } from "./compiler";
import { binary, number, register, type VisualSource } from "./expressions";
import { architectureInfo } from "../architectures";
const has = (command: string) => spawnSync(command, ["--version"]).status === 0;
for (const arch of ["arm", "arm64", "x86_64"] as const) {
  const tool = arch === "x86_64" ? "nasm" : "clang";
  describe.skipIf(!has(tool))(`${arch} real assembler`, () => {
    it("assembles every expression and block family as a real object file", () => {
      const [a, b, c] = architectureInfo(arch).registers.map((r) => r.native);
      const source: VisualSource[] = [
        { id: "start", op: "LABEL", a: "start", b: "" },
        { id: "init", op: "MOV", a, b: "7" },
        { id: "init2", op: "MOV", a: b, b: "3" },
      ];
      for (const operator of [
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
      ] as const)
        source.push({
          id: operator,
          op: "MOV",
          a: c,
          b: "",
          value: binary(operator, register(a), register(b)),
        });
      for (const operator of ["abs", "neg", "not"] as const)
        source.push({
          id: operator,
          op: "MOV",
          a: c,
          b: "",
          value: { kind: "unary", operator, value: register(a) },
        });
      source.push(
        {
          id: "store",
          op: "STORE",
          a: "",
          b: "",
          address: number(256),
          value: register(c),
        },
        {
          id: "load",
          op: "MOV",
          a: c,
          b: "",
          value: { kind: "memory", address: number(256) },
        },
      );
      for (const op of ["ADD", "SUB", "INC", "DEC", "CMP"] as const)
        source.push({ id: op, op, a: c, b: "1" });
      source.push(
        { id: "push", op: "PUSH", a: c, b: "" },
        { id: "pop", op: "POP", a: c, b: "" },
        {
          id: "branch",
          op: "BRANCH",
          a: "done",
          b: "",
          value: binary("=", register(a), number(7)),
        },
        { id: "call", op: "CALL", a: "fn", b: "" },
        { id: "jump", op: "JMP", a: "done", b: "" },
        { id: "fn", op: "LABEL", a: "fn", b: "" },
        { id: "ret", op: "RET", a: "", b: "" },
        { id: "done", op: "LABEL", a: "done", b: "" },
        { id: "sp", op: "MOV", a: architectureInfo(arch).stack, b: "2048" },
      );
      const result = compile(source, arch);
      expect(result.errors).toEqual([]);
      const folder = mkdtempSync(join(tmpdir(), "scratchsembly-")),
        file = join(folder, arch === "x86_64" ? "program.asm" : "program.s"),
        object = join(folder, "program.o");
      try {
        writeFileSync(file, assemblyText(result));
        execFileSync(
          tool,
          arch === "x86_64"
            ? ["-f", "elf64", file, "-o", object]
            : [
                "--target=" +
                  (arch === "arm64" ? "aarch64-none-elf" : "armv7-none-eabi"),
                "-c",
                file,
                "-o",
                object,
              ],
          { stdio: "pipe" },
        );
        const bytes = readFileSync(object);
        expect(bytes.subarray(0, 4).toString("hex")).toBe("7f454c46");
        expect(bytes[4]).toBe(arch === "arm" ? 1 : 2);
        expect(bytes.readUInt16LE(18)).toBe(
          arch === "arm" ? 40 : arch === "arm64" ? 183 : 62,
        );
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    });
  });
}
