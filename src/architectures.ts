export const ARCHITECTURES = ["arm", "arm64", "x86", "x86_64"] as const;
export type Architecture = (typeof ARCHITECTURES)[number];
// Keep the saved project ID stable; use the ISA name in the interface.
export const architectureLabel = (value: Architecture): string =>
  value === "arm64" ? "AArch64" : value;
export type RegisterInfo = {
  name: string;
  native: string;
  role?: "stack" | "link" | "pc" | "frame";
};
export type ArchitectureInfo = {
  id: Architecture;
  bits: 32 | 64;
  wordBytes: 4 | 8;
  stackBytes: 4 | 8 | 16;
  stack: string;
  link?: string;
  syntax: string;
  registers: RegisterInfo[];
};
const aliases = (n: number) =>
  n < 26 ? String.fromCharCode(65 + n) : `A${String.fromCharCode(65 + n - 26)}`;
const registers = (
  names: string[],
  stack: string,
  frame?: string,
  link?: string,
): RegisterInfo[] =>
  names.map((native, i) => ({
    name: aliases(i),
    native,
    role:
      native === stack
        ? "stack"
        : native === "PC"
          ? "pc"
          : native === link
            ? "link"
            : native === frame
              ? "frame"
              : undefined,
  }));
export const ARCHITECTURE_INFO: Record<Architecture, ArchitectureInfo> = {
  x86: {
    id: "x86",
    bits: 32,
    wordBytes: 4,
    stackBytes: 4,
    stack: "ESP",
    syntax: "NASM · Intel",
    registers: registers(
      ["EAX", "EBX", "ECX", "EDX", "ESI", "EDI", "EBP", "ESP"],
      "ESP",
      "EBP",
    ),
  },
  x86_64: {
    id: "x86_64",
    bits: 64,
    wordBytes: 8,
    stackBytes: 8,
    stack: "RSP",
    syntax: "NASM · Intel",
    registers: registers(
      [
        "RAX",
        "RBX",
        "RCX",
        "RDX",
        "RSI",
        "RDI",
        "RBP",
        "RSP",
        ...Array.from({ length: 8 }, (_, i) => `R${i + 8}`),
      ],
      "RSP",
      "RBP",
    ),
  },
  arm: {
    id: "arm",
    bits: 32,
    wordBytes: 4,
    stackBytes: 4,
    stack: "SP",
    link: "LR",
    syntax: "GNU as · ARMv7-A + IDIV (A32)",
    registers: registers(
      [
        "R0",
        "R1",
        "R2",
        "R3",
        "R4",
        "R5",
        "R11",
        "SP",
        "R6",
        "R7",
        "R8",
        "R9",
        "R10",
        "R12",
        "LR",
        "PC",
      ],
      "SP",
      "R11",
      "LR",
    ),
  },
  arm64: {
    id: "arm64",
    bits: 64,
    wordBytes: 8,
    stackBytes: 16,
    stack: "SP",
    link: "X30",
    syntax: "GNU as · AArch64",
    registers: registers(
      [
        "X0",
        "X1",
        "X2",
        "X3",
        "X4",
        "X5",
        "X29",
        "SP",
        ...Array.from({ length: 23 }, (_, i) => `X${i + 6}`),
        "X30",
      ],
      "SP",
      "X29",
      "X30",
    ),
  },
};
export const isArchitecture = (value: unknown): value is Architecture =>
  ARCHITECTURES.includes(value as Architecture);
let selected: Architecture = "x86";
export const getArchitecture = () => selected;
export function setArchitecture(value: Architecture) {
  selected = value;
}
export const architectureInfo = (value: Architecture = selected) =>
  ARCHITECTURE_INFO[value];
export function isTargetRegister(
  value: string,
  architecture: Architecture = selected,
) {
  return architectureInfo(architecture).registers.some(
    (reg) => reg.native === value.toUpperCase(),
  );
}
export function canWriteRegister(
  value: string,
  architecture: Architecture = selected,
) {
  const reg = architectureInfo(architecture).registers.find(
    (reg) => reg.native === value.toUpperCase(),
  );
  return !!reg && reg.role !== "pc";
}
export function integer(value: string | number | bigint): bigint {
  if (typeof value === "number" && !Number.isSafeInteger(value))
    throw new Error("Use an exact integer literal.");
  const text = String(value).trim();
  if (!/^-?(?:0x[\da-f]+|\d+)$/i.test(text))
    throw new Error("Invalid integer literal.");
  return text.startsWith("-") ? -BigInt(text.slice(1)) : BigInt(text);
}
export function isTargetImmediate(
  value: string,
  architecture: Architecture = selected,
) {
  try {
    const n = integer(value),
      bits = BigInt(architectureInfo(architecture).bits);
    return n >= -(1n << (bits - 1n)) && n < 1n << bits;
  } catch {
    return false;
  }
}
export const unsignedWord = (
  value: string | number | bigint,
  architecture: Architecture = selected,
) => BigInt.asUintN(architectureInfo(architecture).bits, integer(value));
export const signedWord = (
  value: string | number | bigint,
  architecture: Architecture = selected,
) => BigInt.asIntN(architectureInfo(architecture).bits, integer(value));
export function displayWord(
  value: string | number | bigint,
  architecture: Architecture,
  format: "dec" | "hex" = "dec",
) {
  return format === "hex"
    ? `0x${unsignedWord(value, architecture)
        .toString(16)
        .toUpperCase()
        .padStart(architectureInfo(architecture).bits / 4, "0")}`
    : signedWord(value, architecture).toString();
}
