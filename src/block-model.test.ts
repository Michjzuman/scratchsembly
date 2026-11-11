import { afterEach, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import {
  buildToolbox,
  configureBlockLanguage,
  expressionState,
  migrateWorkspace,
  readWorkspace,
  specState,
} from "./block-model";
import { binary, number, register } from "./engine/expressions";
import { initialState, stepBlock } from "./engine/cpu";
import { REGISTER_NAMES, registerName } from "./registers";
type State = Blockly.serialization.blocks.State;
function migrated(states: State[]) {
  return migrateWorkspace({
    blocks: { languageVersion: 0, blocks: states },
  }) as { blocks: { blocks: State[] } };
}
function load(states: State[]) {
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(migrated(states), workspace);
  return workspace;
}
function execute(states: State[]) {
  const workspace = load(states);
  try {
    const result = readWorkspace(workspace as Blockly.WorkspaceSvg);
    expect(result.errors).toEqual([]);
    const state = initialState();
    for (
      let i = 0;
      i < 100 && !["finished", "error"].includes(state.status);
      i++
    )
      stepBlock(state, result.program);
    return state;
  } finally {
    workspace.dispose();
  }
}
function chain(states: State[]): State | undefined {
  for (let i = states.length - 2; i >= 0; i--)
    states[i].next = { block: states[i + 1] };
  return states[0];
}
afterEach(() => configureBlockLanguage("de"));
describe("block schema, event sections, and migration", () => {
  it("decorates the start hat with a green play icon without changing saved project data", () => {
    const workspace = new Blockly.Workspace();
    try {
      const start = workspace.newBlock("asm_start");
      const icon = start.inputList[0].fieldRow[0];
      expect(icon).toBeInstanceOf(Blockly.FieldImage);
      expect(decodeURIComponent(String(icon.getValue()))).toContain(
        'fill="#389438"',
      );
      expect((icon as Blockly.FieldImage).isClickable()).toBe(false);
      expect(Blockly.serialization.blocks.save(start)?.fields).toBeUndefined();
    } finally {
      workspace.dispose();
    }
  });
  it("maps A–H to distinct genuine x86 registers", () => {
    expect(REGISTER_NAMES.map((item) => item.name)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
    ]);
    expect(new Set(REGISTER_NAMES.map((item) => item.native)).size).toBe(8);
    expect(registerName("ESP")).toBe("H");
    expect(registerName("EBP")).toBe("G");
  });
  it("migrates old text operands and adds the start event without changing the original data", () => {
    const original: State = {
      type: "asm_mov",
      id: "old",
      fields: { A: "EAX", B: "5" },
    };
    const start = migrated([original]).blocks.blocks[0];
    expect(start.type).toBe("asm_start");
    expect(start.next?.block?.fields).toEqual({ A: "EAX" });
    expect(start.next?.block?.inputs?.VALUE.shadow?.fields).toEqual({ NUM: 5 });
    expect(original.fields?.B).toBe("5");
  });
  it("migrates old register sources into round reporters", () => {
    const block = migrated([
      { type: "asm_add", fields: { A: "EBX", B: "EAX" } },
    ]).blocks.blocks[0].next!.block!;
    expect(block.inputs?.VALUE.block).toEqual(expressionState(register("EAX")));
    expect(block.inputs?.VALUE.shadow?.type).toBe("value_number");
  });
  it("migrates memory writes and LEA without address text fields", () => {
    const data = migrated([
      { type: "asm_mov", fields: { A: "[EBX + 4]", B: "7" } },
      { type: "asm_lea", fields: { A: "EAX", B: "[EBX + 4]" } },
    ]);
    expect(data.blocks.blocks[0].type).toBe("asm_store");
    expect(data.blocks.blocks[0].inputs?.ADDRESS.block?.type).toBe("value_add");
    expect(data.blocks.blocks[1].inputs?.VALUE.block?.type).toBe("value_add");
  });
  it("allows freely parked reporter blocks", () => {
    const workspace = load([
      specState({ op: "MOV", a: "EAX", b: "5" }),
      expressionState(register("EBX")),
      expressionState(binary("+", number(1), number(2))),
    ]);
    try {
      const result = readWorkspace(workspace as Blockly.WorkspaceSvg);
      expect(result.errors).toEqual([]);
      expect(result.blockCount).toBe(1);
    } finally {
      workspace.dispose();
    }
  });
  it("splits old inline labels into event heads and preserves fallthrough explicitly", () => {
    const root = chain([
      specState({ op: "MOV", a: "EAX", b: "5" }),
      specState({ op: "LABEL", a: "loop" }),
      specState({ op: "DEC", a: "EAX" }),
    ])!;
    const data = migrated([root]);
    expect(data.blocks.blocks.map((block) => block.type)).toEqual([
      "asm_start",
      "asm_label",
    ]);
    expect(data.blocks.blocks[0].next?.block?.next?.block).toMatchObject({
      type: "asm_jmp",
      fields: { A: "loop" },
    });
    expect(migrateWorkspace(data)).toEqual(data);
    expect(execute([root]).registers.EAX).toBe(4);
  });
  it("labels are hats, and forward references survive loading", () => {
    const root = chain([
      specState({ op: "JMP", a: "later" }),
      specState({ op: "LABEL", a: "later" }),
      specState({ op: "MOV", a: "EAX", b: "42" }),
    ])!;
    const workspace = load([root]);
    try {
      expect(
        workspace.getBlocksByType("asm_label", false)[0].previousConnection,
      ).toBeNull();
      expect(readWorkspace(workspace as Blockly.WorkspaceSvg).errors).toEqual(
        [],
      );
    } finally {
      workspace.dispose();
    }
    expect(execute([root]).registers.EAX).toBe(42);
  });
  it("does not execute unrelated label sections through implicit fallthrough", () => {
    const state = execute([
      {
        type: "asm_start",
        next: { block: specState({ op: "MOV", a: "EAX", b: "1" }) },
      },
      {
        type: "asm_label",
        fields: { A: "unrelated" },
        next: { block: specState({ op: "MOV", a: "EBX", b: "99" }) },
      },
    ]);
    expect(state.registers.EAX).toBe(1);
    expect(state.registers.EBX).toBe(0);
    expect(state.blocks).toBe(1);
  });
  it("CALL/RET returns across event sections without an invisible extra UI step", () => {
    const state = execute([
      {
        type: "asm_start",
        next: { block: specState({ op: "CALL", a: "function" }) },
      },
      {
        type: "asm_label",
        fields: { A: "function" },
        next: {
          block: chain([
            specState({ op: "MOV", a: "EAX", b: "42" }),
            specState({ op: "RET" }),
          ]),
        },
      },
    ]);
    expect(state.status).toBe("finished");
    expect(state.registers.EAX).toBe(42);
    expect(state.registers.ESP).toBe(4096);
    expect(state.blocks).toBe(3);
  });
  it("keeps an old label named start separate from the new start event", () => {
    const old = {
      type: "asm_label",
      fields: { A: "start" },
      next: {
        block: chain([
          specState({ op: "MOV", a: "EAX", b: "1" }),
          specState({ op: "JMP", a: "start" }),
        ]),
      },
    };
    const data = migrated([old]);
    expect(data.blocks.blocks.map((block) => block.type)).toEqual([
      "asm_start",
      "asm_label",
    ]);
    expect(data.blocks.blocks[1].fields?.A).toBe("label_start");
    expect(data.blocks.blocks[1].next?.block?.next?.block?.fields?.A).toBe(
      "label_start",
    );
    expect(migrateWorkspace(data)).toEqual(data);
    const workspace = load([old]);
    try {
      expect(readWorkspace(workspace as Blockly.WorkspaceSvg).errors).toEqual(
        [],
      );
    } finally {
      workspace.dispose();
    }
  });
  it("retains zero as a valid legacy shift count", () => {
    expect(execute([specState({ op: "SHL", a: "EAX", b: "0" })]).status).toBe(
      "finished",
    );
  });
  it("serializes nested inputs instead of formula strings", () => {
    const state = specState({
      op: "MOV",
      a: "ECX",
      value: binary(
        "*",
        binary("+", register("EAX"), register("EBX")),
        number(3),
      ),
    });
    expect(state.inputs?.VALUE.block?.type).toBe("value_multiply");
    expect(state.inputs?.VALUE.block?.inputs?.LEFT.block?.type).toBe(
      "value_add",
    );
  });
  it("puts entry hats and common commands first, with CMP grouped under Logic in every language", () => {
    for (const language of ["de", "en", "asm"] as const) {
      configureBlockLanguage(language);
      const categories = buildToolbox().contents;
      expect(categories.map((category) => category.name)).toEqual(
        language === "de"
          ? [
              "Ereignisse",
              "Befehle",
              "Steuerung",
              "Stack",
              "Speicher",
              "Werte",
              "Rechnen",
              "Logik",
            ]
          : [
              "Events",
              "Commands",
              "Control",
              "Stack",
              "Memory",
              "Values",
              "Operators",
              "Logic",
            ],
      );
      const types = categories.flatMap((category) =>
        category.contents.map((entry) => String(entry.type)),
      );
      expect(types.slice(0, 7)).toEqual([
        "asm_start",
        "asm_label",
        "asm_mov",
        "asm_add",
        "asm_sub",
        "asm_inc",
        "asm_dec",
      ]);
      const common = types.filter((type) => type !== "asm_cmp");
      const firstValue = common.findIndex((type) => type.startsWith("value_"));
      expect(firstValue).toBeGreaterThan(7);
      expect(
        common.slice(0, firstValue).every((type) => type.startsWith("asm_")),
      ).toBe(true);
      expect(
        common.slice(firstValue).every((type) => type.startsWith("value_")),
      ).toBe(true);
      expect(categories[7].contents[0].type).toBe("asm_cmp");
      expect(types.filter((type) => type === "asm_cmp")).toHaveLength(1);
    }
  });
  it("groups calls with control flow, leaves push/pop in Stack and puts writes before reads", () => {
    const categories = buildToolbox().contents;
    const types = (index: number) =>
      categories[index].contents.map((entry) => entry.type);
    expect(types(2)).toEqual([
      "asm_jmp",
      "asm_branch",
      "asm_je",
      "asm_jne",
      "asm_jg",
      "asm_jl",
      "asm_call",
      "asm_ret",
    ]);
    expect(types(3)).toEqual(["asm_push", "asm_pop"]);
    expect(types(4)).toEqual(["asm_store", "value_memory"]);
    expect(types(5)).toEqual(REGISTER_NAMES.map(() => "value_register"));
    const workspace = new Blockly.Workspace();
    try {
      expect(workspace.newBlock("asm_call").getColour()).toBe(
        workspace.newBlock("asm_jmp").getColour(),
      );
      expect(workspace.newBlock("asm_ret").getColour()).toBe(
        workspace.newBlock("asm_jmp").getColour(),
      );
    } finally {
      workspace.dispose();
    }
  });
  it("renders CMP in purple with Logic while retaining its instruction shape and flag semantics", () => {
    configureBlockLanguage("de");
    const workspace = new Blockly.Workspace();
    try {
      const compare = workspace.newBlock("asm_cmp");
      const jump = workspace.newBlock("asm_jne");
      const condition = workspace.newBlock("value_equal");
      expect(compare.getColour()).not.toBe(jump.getColour());
      expect(compare.getColour()).toBe(condition.getColour());
      expect(compare.outputConnection).toBeNull();
      expect(compare.previousConnection).not.toBeNull();
      expect(condition.outputConnection?.getCheck()).toEqual(["Boolean"]);
      expect(String(compare.getTooltip())).toContain("CPU-Flags");
      configureBlockLanguage("en");
      expect(String(workspace.newBlock("asm_cmp").getTooltip())).toContain(
        "Does not change any register value",
      );
    } finally {
      workspace.dispose();
    }
  });
  it("has no pre-inserted reporter blocks or default numbers in palette inputs", () => {
    const toolbox = buildToolbox();
    for (const category of toolbox.contents)
      for (const entry of category.contents) {
        const state = entry as unknown as State;
        expect(state.type).not.toBe("value_number");
        for (const connection of Object.values(state.inputs || {})) {
          expect(connection.block).toBeUndefined();
          if (connection.shadow) expect(connection.shadow.fields?.NUM).toBe("");
        }
      }
  });
  it("switches block wording without changing the instruction model", () => {
    for (const [language, word] of [
      ["de", "setze"],
      ["en", "set"],
      ["asm", "mov"],
    ] as const) {
      configureBlockLanguage(language);
      const workspace = load([specState({ op: "MOV", a: "EAX", b: "5" })]);
      try {
        expect(
          workspace.getBlocksByType("asm_mov", false)[0].toString(),
        ).toContain(word);
        const result = readWorkspace(workspace as Blockly.WorkspaceSvg);
        expect(result.program.instructions[0]).toMatchObject({
          op: "MOV",
          a: "EAX",
          b: "5",
        });
      } finally {
        workspace.dispose();
      }
    }
  });
});
