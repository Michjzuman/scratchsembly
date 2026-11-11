import { architectureInfo, type Architecture } from "./architectures";
import type { BlockSpec } from "./blocks";
import type { Expression } from "./engine/expressions";
import { getLanguage } from "./i18n";
const legacy = architectureInfo("x86").registers;
export function exampleBlocks(
  blocks: BlockSpec[],
  architecture: Architecture,
): BlockSpec[] {
  const registers = architectureInfo(architecture).registers;
  // Only built-in examples are translated here; loading saved workspaces never renames labels.
  const labels: Record<string, string> =
    getLanguage() === "de"
      ? {}
      : {
          schleife: "loop",
          summe: "sum",
          funktion: "function",
        };
  const rename = (text?: string) =>
    text?.replace(
      /\b(?:EAX|EBX|ECX|EDX|ESI|EDI|EBP|ESP)\b/g,
      (name) =>
        registers[legacy.findIndex((reg) => reg.native === name)].native,
    );
  const expression = (value?: Expression): Expression | undefined => {
    if (!value) return value;
    if (value.kind === "register")
      return { ...value, register: rename(value.register)! };
    if (value.kind === "binary")
      return {
        ...value,
        left: expression(value.left)!,
        right: expression(value.right)!,
      };
    if (value.kind === "unary")
      return { ...value, value: expression(value.value)! };
    if (value.kind === "memory")
      return { ...value, address: expression(value.address)! };
    return value;
  };
  return blocks.map((block) => ({
    ...block,
    a:
      block.op === "LABEL" ||
      ["JMP", "JE", "JNE", "JG", "JL", "CALL", "BRANCH"].includes(block.op)
        ? labels[block.a || ""] || block.a
        : rename(block.a),
    b: rename(block.b),
    value: expression(block.value),
    address: expression(block.address),
  }));
}
