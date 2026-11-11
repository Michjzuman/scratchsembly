import type * as Blockly from "blockly/core";
type State = Blockly.serialization.blocks.State;

/** Split old inline labels into independent event heads, preserving fallthrough with explicit jumps. */
export function splitEventSections(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const root = data.blocks as { blocks?: State[] } | undefined;
  if (!root?.blocks) return data;
  const roots = root.blocks;
  const hasStart = roots.some((block) => block.type === "asm_start");
  const ordinary = roots.filter(
    (block) =>
      !block.type.startsWith("value_") &&
      !["asm_start", "asm_label"].includes(block.type),
  );
  const result: State[] = [];
  for (const original of roots) {
    if (original.type.startsWith("value_")) {
      result.push(original);
      continue;
    }
    let head: State = original;
    if (!hasStart && ordinary.length === 1 && original === ordinary[0]) {
      head = {
        type: "asm_start",
        x: original.x ?? 120,
        y: original.y ?? 82,
        next: { block: original },
      };
      delete original.x;
      delete original.y;
    }
    result.push(head);
    let previous: State = head;
    let current = head.next?.block;
    let section = 0;
    while (current) {
      const next = current.next?.block;
      if (current.type === "asm_label") {
        delete previous.next;
        if (!["asm_jmp", "asm_ret"].includes(previous.type))
          previous.next = {
            block: {
              type: "asm_jmp",
              fields: { A: String(current.fields?.A || "Label1") },
            },
          };
        current.x = (head.x ?? 120) + ++section * 340;
        current.y = head.y ?? 82;
        result.push(current);
      }
      previous = current;
      current = next;
    }
  }
  root.blocks = result;
  return data;
}
