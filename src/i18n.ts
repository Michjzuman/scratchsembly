export type Language = "de" | "en" | "asm";
export const DEFAULT_LANGUAGE: Language = "en";
export const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "asm", label: "Assembly" },
];
let language: Language = DEFAULT_LANGUAGE;
export const getLanguage = () => language;
export const setLanguage = (value: Language) => {
  language = value;
  if (typeof document !== "undefined")
    document.documentElement.lang = value === "de" ? "de" : "en";
};
export const t = (de: string, en: string) => (language === "de" ? de : en);
export const statementText = (de: string, en: string, mnemonic: string) =>
  language === "asm" ? mnemonic : t(de, en);
export function loadLanguage(): Language {
  try {
    const value = localStorage.getItem("assembly-playground.language");
    return LANGUAGES.some((item) => item.value === value)
      ? (value as Language)
      : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}
export function localizeMessage(message: string): string {
  if (language === "de") return message;
  const phrases: [string, string][] = [
    [
      "Bereit, wenn du es bist. Starte dein Programm oder führe einen einzelnen Schritt aus.",
      "Ready when you are. Run your program or execute a single step.",
    ],
    ["Unbekannter CPU-Fehler.", "Unknown CPU error."],
    [
      "Das Ziel muss ein Register oder eine Speicheradresse sein.",
      "The destination must be a register or memory address.",
    ],
    [
      "Ein Label muss mit einem Buchstaben oder Unterstrich beginnen und darf nur Buchstaben, Zahlen und Unterstriche enthalten.",
      "A label must start with a letter or underscore and contain only letters, digits, and underscores.",
    ],
    [
      "Dieser Name ist als Register oder Instruktion reserviert.",
      "This name is reserved for a register or instruction.",
    ],
    [
      "SETcc benötigt das interne Byte-Register AL.",
      "SETcc requires the internal byte register AL.",
    ],
    [
      "Der erste Operand darf keine Konstante sein.",
      "The first operand cannot be an immediate value.",
    ],
    [
      "POP unterstützt in dieser Version nur Register als Ziel.",
      "This version of POP only supports register destinations.",
    ],
    [
      "Zwei Speicheroperanden sind nicht erlaubt. Verwende ein Register als Zwischenschritt.",
      "Two memory operands are not allowed. Use an intermediate register.",
    ],
    [
      "LEA benötigt ein Zielregister und eine Speicheradresse.",
      "LEA requires a destination register and a memory address.",
    ],
    [
      "Die Schiebeanzahl muss eine Konstante zwischen 0 und 255 sein.",
      "The shift count must be an immediate value between 0 and 255.",
    ],
    [
      "Interner Fehler: Der temporäre Stack ist nicht ausgeglichen.",
      "Internal error: the temporary stack is unbalanced.",
    ],
    [
      "Ein Ausdruck darf höchstens 512 Werte und Operatoren enthalten.",
      "An expression can contain at most 512 values and operators.",
    ],
    [
      "Der Ausdruck ist zu tief verschachtelt (maximal 48 Ebenen).",
      "The expression is nested too deeply (maximum 48 levels).",
    ],
    [
      "Das Projekt enthält zu viele Blöcke.",
      "The project contains too many blocks.",
    ],
    [
      "Hier fehlt noch ein Wert. Ziehe einen runden Block in die freie Stelle.",
      "A value is missing. Drag a value block into the empty input.",
    ],
    ["Du kannst nicht durch 0 teilen.", "Cannot divide by zero."],
    [
      "Das Ergebnis der Division passt nicht in einen 32-Bit-Wert.",
      "The division result does not fit in a signed 32-bit value.",
    ],
    [
      "Auf dem Stack ist kein Platz. Prüfe ESP (Stackzeiger).",
      "The stack has no room. Check ESP (stack pointer).",
    ],
    [
      "Der Stack ist leer. Lege zuerst einen Wert darauf.",
      "The stack is empty. Push a value first.",
    ],
    [
      "Dieser Ausdruck ist zu tief verschachtelt.",
      "This expression is nested too deeply.",
    ],
    ["Dieser Block ist kein Wert.", "This block does not return a value."],
    ["Der Ausdruck ist ungültig.", "The expression is invalid."],
    ["Ungültiger Block.", "Invalid block."],
    ["Programm erfolgreich beendet.", "Program finished successfully."],
    ["Programm beendet.", "Program finished."],
    ["Flags bleiben unverändert.", "Flags are unchanged."],
    ["Die Operanden bleiben unverändert.", "The operands are unchanged."],
    ["Kein Sprung", "No jump"],
    ["Unbedingter Sprung zu", "Unconditional jump to"],
    ["Sprung zu", "Jump to"],
    [
      "Breakpoint erreicht. Der markierte Block wird als Nächstes ausgeführt.",
      "Breakpoint reached. The highlighted block is next.",
    ],
    [
      "Sicherheitslimit: 10.000 Schritte erreicht. Du kannst die Ausführung fortsetzen.",
      "Safety limit: 10,000 instructions reached. You can resume execution.",
    ],
    [
      "Dieser Block benötigt zu viele interne Schritte.",
      "This block needs too many internal instructions.",
    ],
    [
      "Stecke eine Adresse und einen Wert in den Speicherblock.",
      "Connect an address and a value to the memory block.",
    ],
    [
      "Stecke eine Bedingung in den Sprungblock.",
      "Connect a condition to the jump block.",
    ],
    [
      "Zahlen müssen ganze 32-Bit-Werte sein.",
      "Numbers must be 32-bit integers.",
    ],
    ["Unbekannter Operator.", "Unknown operator."],
    ["Unbekanntes Register.", "Unknown register."],
    ["Unbekannter Block.", "Unknown block."],
    [
      "Nicht jeder Befehlsstapel hat einen Ereignisblock.",
      "Every instruction stack needs an event block.",
    ],
    [
      "Es darf nur einen start-Block geben.",
      "There can only be one start block.",
    ],
    ["Füge einen start-Block hinzu.", "Add a start block."],
    [
      "Eine Marke benötigt einen eindeutigen Namen.",
      "Every label needs a unique name.",
    ],
  ];
  let result = message;
  for (const [de, en] of phrases) result = result.replaceAll(de, en);
  result = result
    .replace(
      /Speicherzugriff außerhalb des erlaubten Bereichs: (.+)\./g,
      "Memory address out of bounds: $1.",
    )
    .replace(
      /Das Label „([^“]+)“ existiert nicht\./g,
      "Label “$1” does not exist.",
    )
    .replace(
      /Das Label „([^“]+)“ wird mehrfach verwendet\./g,
      "Label “$1” is used more than once.",
    )
    .replace(/Ungültige Speicheradresse: /g, "Invalid memory address: ")
    .replace(/Unbekannter Operand: /g, "Unknown operand: ")
    .replace(
      /Ungültige Rücksprungadresse auf dem Stack\./g,
      "Invalid return address on the stack.",
    )
    .replace(
      /„([^“]+)“ ist kein gültiger (?:Zieloperand|Quelloperand|Wert)\./g,
      "“$1” is not a valid operand.",
    )
    .replace(/Der Stack hat keinen Platz\./g, "The stack has no room.")
    .replace(/Vergleich /g, "Compare ")
    .replace(/ mit /g, " with ")
    .replace(/ wird um 1 erhöht → /g, " is increased by 1 → ")
    .replace(/ wird um 1 verringert → /g, " is decreased by 1 → ")
    .replace(/CF bleibt unverändert\./g, "CF is unchanged.");
  return result;
}
