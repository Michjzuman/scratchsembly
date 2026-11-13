import { afterEach, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { ARCHITECTURES } from "./architectures";
import { BLOCKS } from "./blocks";
import {
  buildToolbox,
  configureBlockArchitecture,
  configureBlockLanguage,
} from "./block-model";
import { getBlockInfo, instructionHelp } from "./block-help";

afterEach(() => {
  configureBlockArchitecture("x86");
  configureBlockLanguage("en");
});

for (const architecture of ARCHITECTURES)
  for (const language of ["en", "de", "asm"] as const)
    it(`${architecture}/${language}: every palette block has read-only Info documentation`, () => {
      configureBlockArchitecture(architecture);
      configureBlockLanguage(language);
      const workspace = new Blockly.Workspace();
      try {
        const types = new Set(
          buildToolbox().contents.flatMap((category) =>
            category.contents.map((entry) => String(entry.type)),
          ),
        );
        types.add("value_number");
        for (const type of types) {
          const block = workspace.newBlock(type);
          const before = Blockly.serialization.blocks.save(block);
          const info = getBlockInfo(block);
          expect(info.title.trim(), type).not.toBe("");
          expect(info.description.length, type).toBeGreaterThan(12);
          expect(info.description, type).not.toContain(
            "No additional information",
          );
          expect(Blockly.serialization.blocks.save(block), type).toEqual(
            before,
          );
        }
        for (const definition of BLOCKS)
          expect(
            instructionHelp(definition.op, architecture).length,
            definition.op,
          ).toBeGreaterThan(12);
      } finally {
        workspace.dispose();
      }
    });

it("explains instructions rather than repeating their command name", () => {
  configureBlockLanguage("en");
  expect(instructionHelp("MOV")).toContain("Copies a value");
  expect(instructionHelp("MOV")).toContain("Flags are unchanged");
  expect(instructionHelp("CMP")).toContain(
    "Does not change any register value",
  );
  expect(instructionHelp("TEST")).toContain("without storing the result");
});

it("explains native stack widths, alignment, and link-register calls", () => {
  configureBlockLanguage("en");
  expect(instructionHelp("PUSH", "arm64")).toContain("16 bytes");
  expect(instructionHelp("PUSH", "arm64")).toContain("64-bit");
  expect(instructionHelp("PUSH", "arm64")).toContain("alignment padding");
  expect(instructionHelp("POP", "x86_64")).toContain("8 bytes");
  expect(instructionHelp("CALL", "x86")).toContain("4-byte stack slot");
  expect(instructionHelp("CALL", "arm")).toContain("return address in LR");
  expect(instructionHelp("CALL", "arm64")).toContain("return address in X30");
  expect(instructionHelp("RET", "arm64")).toContain("address in X30");
  expect(instructionHelp("INC", "x86_64")).toContain(
    "preserves the carry flag",
  );
  expect(instructionHelp("INC", "arm64")).toContain("ARM NZCV");
});

it("documents register identity, literals, and full-width shift counts", () => {
  configureBlockLanguage("en");
  configureBlockArchitecture("arm64");
  const workspace = new Blockly.Workspace();
  try {
    const register = workspace.newBlock("value_register");
    register.setFieldValue("X30", "REG");
    expect(getBlockInfo(register).title).toBe("Register AF (X30)");
    expect(getBlockInfo(register).description).toContain("return address");
    expect(getBlockInfo(workspace.newBlock("value_number")).title).toBe(
      "Integer literal",
    );
    expect(
      getBlockInfo(workspace.newBlock("value_shift_left")).description,
    ).toContain("lowest 6 bits");
    expect(
      getBlockInfo(workspace.newBlock("value_multiply")).description,
    ).not.toContain("IMUL");
  } finally {
    workspace.dispose();
  }
});
