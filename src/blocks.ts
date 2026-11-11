import type { Op } from "./engine/cpu";
import {
  binary,
  number,
  register,
  type Expression,
} from "./engine/expressions";

export type CategoryId = "data" | "math" | "logic" | "flow" | "stack";
export type BlockSpec = {
  op: Op | "LABEL" | "STORE" | "BRANCH";
  a?: string;
  b?: string;
  value?: Expression;
  address?: Expression;
};
export type BlockDefinition = {
  op: Op | "LABEL";
  category: CategoryId;
  name: string;
  description: string;
  operands: 0 | 1 | 2;
  a: string;
  b?: string;
};
export const BLOCKS: BlockDefinition[] = [
  {
    op: "MOV",
    category: "data",
    name: "Kopieren",
    description:
      "Kopiert einen Wert in ein Register oder in den Speicher. Verändert keine Flags.",
    operands: 2,
    a: "EAX",
    b: "5",
  },
  {
    op: "LEA",
    category: "data",
    name: "Adresse laden",
    description:
      "Berechnet eine effektive Adresse, ohne den Speicher zu lesen.",
    operands: 2,
    a: "EBX",
    b: "[EAX + 4]",
  },
  {
    op: "ADD",
    category: "math",
    name: "Addieren",
    description:
      "Addiert den zweiten Operanden zum ersten und aktualisiert die Flags.",
    operands: 2,
    a: "EAX",
    b: "1",
  },
  {
    op: "SUB",
    category: "math",
    name: "Subtrahieren",
    description: "Zieht den zweiten Operanden vom ersten ab.",
    operands: 2,
    a: "EAX",
    b: "1",
  },
  {
    op: "INC",
    category: "math",
    name: "Um 1 erhöhen",
    description: "Erhöht den Wert um 1. Das Carry-Flag bleibt unverändert.",
    operands: 1,
    a: "EAX",
  },
  {
    op: "DEC",
    category: "math",
    name: "Um 1 verringern",
    description: "Verringert den Wert um 1. Das Carry-Flag bleibt unverändert.",
    operands: 1,
    a: "EAX",
  },
  {
    op: "NEG",
    category: "math",
    name: "Negieren",
    description: "Bildet das Zweierkomplement: Ziel = 0 − Ziel.",
    operands: 1,
    a: "EAX",
  },
  {
    op: "CMP",
    category: "logic",
    name: "Vergleichen",
    description:
      "Vergleicht zwei Werte und setzt die CPU-Flags für nachfolgende bedingte Sprünge (z. B. wenn gleich oder ungleich). Verändert keinen Registerwert.",
    operands: 2,
    a: "EAX",
    b: "0",
  },
  {
    op: "TEST",
    category: "logic",
    name: "Bits testen",
    description:
      "Setzt die Flags anhand eines bitweisen UND, ohne das Ergebnis zu speichern.",
    operands: 2,
    a: "EAX",
    b: "1",
  },
  {
    op: "XOR",
    category: "logic",
    name: "Exklusives Oder",
    description:
      "Verknüpft die Operanden bitweise mit XOR. XOR EAX, EAX setzt EAX auf 0.",
    operands: 2,
    a: "EAX",
    b: "EAX",
  },
  {
    op: "AND",
    category: "logic",
    name: "Bitweises Und",
    description:
      "Ein Ergebnisbit ist nur gesetzt, wenn beide Eingangsbits gesetzt sind.",
    operands: 2,
    a: "EAX",
    b: "255",
  },
  {
    op: "OR",
    category: "logic",
    name: "Bitweises Oder",
    description:
      "Ein Ergebnisbit ist gesetzt, wenn mindestens ein Eingangsbit gesetzt ist.",
    operands: 2,
    a: "EAX",
    b: "1",
  },
  {
    op: "NOT",
    category: "logic",
    name: "Bits invertieren",
    description: "Kehrt alle 32 Bits um. Die Flags bleiben unverändert.",
    operands: 1,
    a: "EAX",
  },
  {
    op: "SHL",
    category: "logic",
    name: "Nach links schieben",
    description:
      "Schiebt die Bits nach links. Die Anzahl ist eine Konstante von 0 bis 255.",
    operands: 2,
    a: "EAX",
    b: "1",
  },
  {
    op: "SHR",
    category: "logic",
    name: "Nach rechts schieben",
    description:
      "Schiebt die Bits logisch nach rechts und füllt links mit Nullen auf.",
    operands: 2,
    a: "EAX",
    b: "1",
  },
  {
    op: "LABEL",
    category: "flow",
    name: "Sprungmarke",
    description:
      "Benennt eine Position im Programm. Labels selbst sind keine CPU-Instruktionen.",
    operands: 1,
    a: "schleife",
  },
  {
    op: "JMP",
    category: "flow",
    name: "Springen",
    description: "Setzt das Programm unbedingt beim angegebenen Label fort.",
    operands: 1,
    a: "schleife",
  },
  {
    op: "JE",
    category: "flow",
    name: "Wenn gleich",
    description: "Springt, wenn das Zero-Flag gesetzt ist (ZF = 1).",
    operands: 1,
    a: "schleife",
  },
  {
    op: "JNE",
    category: "flow",
    name: "Wenn ungleich",
    description: "Springt, wenn das Zero-Flag nicht gesetzt ist (ZF = 0).",
    operands: 1,
    a: "schleife",
  },
  {
    op: "JG",
    category: "flow",
    name: "Wenn größer",
    description:
      "Vorzeichenbehafteter Vergleich: springt bei ZF = 0 und SF = OF.",
    operands: 1,
    a: "schleife",
  },
  {
    op: "JL",
    category: "flow",
    name: "Wenn kleiner",
    description: "Vorzeichenbehafteter Vergleich: springt bei SF ≠ OF.",
    operands: 1,
    a: "schleife",
  },
  {
    op: "NOP",
    category: "flow",
    name: "Nichts tun",
    description:
      "Führt keine Operation aus und fährt mit der nächsten Instruktion fort.",
    operands: 0,
    a: "",
  },
  {
    op: "PUSH",
    category: "stack",
    name: "Auf den Stack",
    description:
      "Verringert ESP um 4 und legt einen 32-Bit-Wert auf den Stack.",
    operands: 1,
    a: "EAX",
  },
  {
    op: "POP",
    category: "stack",
    name: "Vom Stack holen",
    description: "Liest einen 32-Bit-Wert vom Stack und erhöht ESP um 4.",
    operands: 1,
    a: "EBX",
  },
  {
    op: "CALL",
    category: "flow",
    name: "Funktion aufrufen",
    description:
      "Legt die Rücksprungposition auf den Stack und springt zum Label.",
    operands: 1,
    a: "funktion",
  },
  {
    op: "RET",
    category: "flow",
    name: "Zurückkehren",
    description:
      "Holt die Rücksprungposition vom Stack. Benötigt einen vorherigen CALL.",
    operands: 0,
    a: "",
  },
];
export const EXAMPLES: {
  id: string;
  name: string;
  description: string;
  level: string;
  blocks: BlockSpec[];
}[] = [
  {
    id: "countdown",
    name: "Mein erster Countdown",
    description:
      "Eine kleine Schleife, ein großer Aha-Moment. Zähle von 5 herunter und beobachte die Register.",
    level: "Einstieg · 7 Blöcke",
    blocks: [
      { op: "MOV", a: "EAX", b: "5" },
      { op: "MOV", a: "EBX", b: "0" },
      { op: "LABEL", a: "schleife" },
      { op: "ADD", a: "EBX", b: "1" },
      { op: "DEC", a: "EAX" },
      { op: "CMP", a: "EAX", b: "0" },
      { op: "JNE", a: "schleife" },
    ],
  },
  {
    id: "sum",
    name: "Die Summe von 1 bis 10",
    description:
      "Lass die CPU rechnen: Eine Schleife addiert alle Zahlen von 1 bis 10. Das Ergebnis wartet in A.",
    level: "Grundlagen · 7 Blöcke",
    blocks: [
      { op: "MOV", a: "EAX", b: "0" },
      { op: "MOV", a: "ECX", b: "10" },
      { op: "LABEL", a: "summe" },
      { op: "ADD", a: "EAX", b: "ECX" },
      { op: "DEC", a: "ECX" },
      { op: "CMP", a: "ECX", b: "0" },
      { op: "JNE", a: "summe" },
    ],
  },
  {
    id: "stack",
    name: "Ein Umweg über den Stack",
    description:
      "Lege zwei Werte auf den Stack und hole sie in umgekehrter Reihenfolge wieder ab. Last in, first out.",
    level: "Entdecken · 6 Blöcke",
    blocks: [
      { op: "MOV", a: "EAX", b: "42" },
      { op: "MOV", a: "EBX", b: "7" },
      { op: "PUSH", a: "EAX" },
      { op: "PUSH", a: "EBX" },
      { op: "POP", a: "EAX" },
      { op: "POP", a: "EBX" },
    ],
  },
  {
    id: "expressions",
    name: "Mit Werten rechnen",
    description:
      "Stecke runde Werte ineinander: C bekommt (A + B) × 3. A und B bleiben dabei unverändert.",
    level: "Wert-Blöcke · 3 Befehle",
    blocks: [
      { op: "MOV", a: "EAX", b: "12" },
      { op: "MOV", a: "EBX", b: "4" },
      {
        op: "MOV",
        a: "ECX",
        value: binary(
          "*",
          binary("+", register("EAX"), register("EBX")),
          number(3),
        ),
      },
    ],
  },
];
