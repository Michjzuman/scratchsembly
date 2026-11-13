import { afterEach, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import {
  ARCHITECTURES,
  architectureInfo,
  architectureLabel,
  canWriteRegister,
} from "./architectures";
import {
  configureBlockArchitecture,
  configureBlockLanguage,
  buildToolbox,
  migrateWorkspace,
  readWorkspace,
  specState,
} from "./block-model";
import { getRegisterNames } from "./registers";
import { exampleBlocks } from "./examples";
import { EXAMPLES } from "./blocks";
import { createState, executeBlock } from "./engine/machine";
afterEach(() => {
  configureBlockArchitecture("x86");
  configureBlockLanguage("de");
});
it("labels AArch64 correctly while retaining the legacy saved project ID", () => {
  expect(architectureLabel("arm64")).toBe("AArch64");
  expect(architectureInfo("arm64").id).toBe("arm64");
  for (const architecture of ["arm", "x86", "x86_64"] as const)
    expect(architectureLabel(architecture)).toBe(architecture);
});
for (const architecture of ARCHITECTURES) {
  it(`${architecture}: has unique native registers, stable A–H roles, and a matching value palette`, () => {
    configureBlockArchitecture(architecture);
    const info = architectureInfo(),
      names = getRegisterNames();
    expect(new Set(names.map((r) => r.native)).size).toBe(names.length);
    expect(new Set(names.map((r) => r.name)).size).toBe(names.length);
    expect(names[7].native).toBe(info.stack);
    expect(buildToolbox().contents[4].contents.slice(5)).toHaveLength(
      names.length,
    );
    expect(canWriteRegister(info.stack)).toBe(true);
    if (architecture === "arm") expect(canWriteRegister("PC")).toBe(false);
  });
  it(`${architecture}: only start-reachable sections compile, ignoring broken parked blocks and unused labels`, () => {
    configureBlockArchitecture(architecture);
    const [a, b] = architectureInfo().registers.map((reg) => reg.native);
    const chain = (specs: Parameters<typeof specState>[0][]) => {
      const states = specs.map(specState);
      for (let i = states.length - 2; i >= 0; i--)
        states[i].next = { block: states[i + 1] };
      return states[0];
    };
    const workspace = new Blockly.Workspace();
    try {
      Blockly.serialization.workspaces.load(
        migrateWorkspace({
          scratchsemblyWorkspaceVersion: 1,
          blocks: {
            languageVersion: 0,
            blocks: [
              {
                type: "asm_start",
                next: {
                  block: chain([
                    { op: "MOV", a, b: "1" },
                    { op: "JMP", a: "main" },
                  ]),
                },
              },
              {
                type: "asm_label",
                fields: { A: "main" },
                next: {
                  block: chain([
                    { op: "CALL", a: "helper" },
                    { op: "MOV", a: b, b: "9" },
                  ]),
                },
              },
              {
                type: "asm_label",
                fields: { A: "helper" },
                next: {
                  block: chain([{ op: "MOV", a, b: "42" }, { op: "RET" }]),
                },
              },
              {
                type: "asm_label",
                fields: { A: "unused" },
                next: { block: specState({ op: "CALL", a: "missing" }) },
              },
              { type: "asm_mov", fields: { A: b } },
            ],
          },
        }),
        workspace,
      );
      const result = readWorkspace(workspace as Blockly.WorkspaceSvg);
      expect(result.errors).toEqual([]);
      expect(result.blockCount).toBe(8);
      expect(result.workspaceBlockCount).toBeGreaterThan(result.blockCount);
      expect(result.program.labels).not.toHaveProperty("unused");
      expect(result.lines.map((line) => line.text).join("\n")).not.toContain(
        "missing",
      );
      const state = createState(architecture);
      for (
        let i = 0;
        i < 100 && !["finished", "error"].includes(state.status);
        i++
      )
        executeBlock(state, result.program);
      expect(state.status).toBe("finished");
      expect(BigInt(state.registers[a])).toBe(42n);
      expect(BigInt(state.registers[b])).toBe(9n);
      expect(BigInt(state.registers[architectureInfo().stack])).toBe(4096n);
      workspace
        .getBlocksByType("asm_jmp", false)
        .find((block) => block.getFieldValue("A") === "main")!
        .setFieldValue("unused", "A");
      expect(
        readWorkspace(workspace as Blockly.WorkspaceSvg).errors.some((error) =>
          error.message.includes("missing"),
        ),
      ).toBe(true);
    } finally {
      workspace.dispose();
    }
  });
  it(`${architecture}: event migration, serialization and hidden end branches keep the countdown intact`, () => {
    configureBlockArchitecture(architecture);
    const states = exampleBlocks(EXAMPLES[0].blocks, architecture).map(
      specState,
    );
    for (let i = states.length - 2; i >= 0; i--)
      states[i].next = { block: states[i + 1] };
    const workspace = new Blockly.Workspace();
    try {
      const data = migrateWorkspace({
        blocks: {
          languageVersion: 0,
          blocks: [{ type: "asm_start", next: { block: states[0] } }],
        },
      });
      Blockly.serialization.workspaces.load(data, workspace);
      const saved = Blockly.serialization.workspaces.save(workspace);
      Blockly.serialization.workspaces.load(migrateWorkspace(saved), workspace);
      const result = readWorkspace(workspace as Blockly.WorkspaceSvg);
      expect(result.errors).toEqual([]);
      const state = createState(architecture);
      for (
        let i = 0;
        i < 100 && state.status !== "finished" && state.status !== "error";
        i++
      )
        executeBlock(state, result.program);
      expect(state.status).toBe("finished");
      expect(state.blocks).toBe(23);
      const [a, b] = architectureInfo().registers.map((r) => r.native);
      expect(BigInt(state.registers[a])).toBe(0n);
      expect(BigInt(state.registers[b])).toBe(5n);
    } finally {
      workspace.dispose();
    }
  });
}
