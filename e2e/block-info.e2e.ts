import { expect, test, type Locator, type Page } from "@playwright/test";
import { architectureInfo, architectureLabel } from "../src/architectures";
import {
  binary,
  closeValues,
  importRoots,
  literal,
  load,
  main,
  mov,
  palette,
  registerBlock,
  registerValue,
  start,
  values,
  type Block,
} from "./helpers";

async function openInfo(page: Page, block: Locator, hat = false) {
  await block.click({ button: "right", position: { x: 6, y: hat ? 35 : 20 } });
  const info = page.getByRole("menuitem", { name: "Info", exact: true });
  await expect(info).toHaveCount(1);
  await info.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}
async function closeInfo(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^(Close dialog|Dialog schließen)$/ })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("statement Info explains the block without executing, changing saved code, or consuming run shortcuts", async ({
  page,
}, info) => {
  await load(page);
  await page.getByRole("button", { name: "Examples", exact: true }).click();
  await page.getByRole("button", { name: /Calculating with values/ }).click();
  const mobile = info.project.name === "mobile";
  await values(page, mobile);
  await page.getByRole("button", { name: "Step", exact: true }).click();
  await page.getByRole("button", { name: "Step", exact: true }).click();
  await expect(registerValue(page, "A")).toHaveText("12");
  await closeValues(page, mobile);
  await expect(page.locator(".save-mark")).toHaveClass(/saved/);
  const saved = await page.evaluate(() =>
    localStorage.getItem("asmblocks.project.v1"),
  );
  const dialog = await openInfo(page, main(page).locator(".asm_mov").first());
  await expect(dialog).toHaveAccessibleName("Block info");
  await expect(dialog).toContainText("Copies a value");
  await expect(dialog).toContainText("Flags are unchanged");
  await expect(dialog).toContainText("x86 · 32-bit");
  await page.keyboard.press("F10");
  await page.keyboard.press("Space");
  await expect(page.locator(".step-counter b")).toHaveText("2");
  await expect(registerValue(page, "C")).toHaveText("0");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("asmblocks.project.v1")),
  ).toBe(saved);
  await values(page, mobile);
  await page.getByRole("button", { name: "Step", exact: true }).click();
  await expect(registerValue(page, "C")).toHaveText("48");
});

test("Info works on hats, register/number/expression reporters, and incomplete parked instructions", async ({
  page,
}, info) => {
  await load(page);
  const mobile = info.project.name === "mobile";
  const cases: { block: Block; text: string; title?: string; hat?: boolean }[] =
    [
      {
        block: { type: "asm_label", fields: { A: "unused" } },
        text: "An entry point",
        hat: true,
      },
      {
        block: { type: "asm_label", fields: { A: "a".repeat(64) } },
        text: "An entry point",
        hat: true,
      },
      {
        block: registerBlock("EAX"),
        text: "Native register: EAX",
        title: "Register A (EAX)",
      },
      { block: literal(9), text: "An integer", title: "Integer literal" },
      {
        block: binary("value_add", literal(2), literal(3)),
        text: "Adds two 32-bit integers",
      },
      {
        block: binary("value_equal", literal(2), literal(3)),
        text: "True if the values are equal",
      },
      {
        block: {
          type: "value_memory",
          inputs: { ADDRESS: { shadow: literal(16) } },
        },
        text: "Reads a 32-bit value",
      },
      {
        block: { type: "asm_mov", fields: { A: "EBX" } },
        text: "Copies a value",
      },
    ];
  for (const sample of cases) {
    await importRoots(
      page,
      [
        start([mov("EAX", 5)], mobile),
        { ...sample.block, x: mobile ? 45 : 110, y: 260 },
      ],
      1,
    );
    const dialog = await openInfo(
      page,
      main(page).locator(`:scope > .${sample.block.type}`),
      sample.hat,
    );
    await expect(dialog).toContainText(sample.text);
    expect(
      await dialog
        .locator(".block-info-content")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    if (sample.title)
      await expect(dialog.locator("strong")).toHaveText(sample.title);
    await closeInfo(page);
    await expect(page.locator(".program-error")).toHaveCount(0);
    await expect(page.locator(".step-counter b")).toHaveText("0");
  }
  const dialog = await openInfo(
    page,
    main(page).locator(":scope > .asm_start"),
    true,
  );
  await expect(dialog).toContainText("Parked blocks are ignored");
});

test("palette templates and the disabled start hat also offer Info without adding blocks", async ({
  page,
}, info) => {
  await load(page);
  if (info.project.name === "mobile")
    await page
      .getByRole("button", { name: "Block palette", exact: true })
      .click();
  for (const [category, type, text] of [
    ["Labels", "asm_start", "The program starts here"],
    ["Registers", "asm_mov", "Copies a value"],
    ["Registers", "value_register", "Native register"],
    ["Memory", "asm_push", "stores one 32-bit value"],
    ["Operators", "value_add", "Adds two 32-bit integers"],
    ["Logic", "value_equal", "True if the values are equal"],
  ]) {
    await page.getByRole("treeitem", { name: category, exact: true }).click();
    const dialog = await openInfo(
      page,
      palette(page).locator(`:scope > .${type}`).first(),
      type === "asm_start",
    );
    await expect(dialog).toContainText(text);
    await closeInfo(page);
    await expect(page.locator(".workspace-shell")).toHaveAttribute(
      "data-program-blocks",
      "8",
    );
    await expect(main(page).locator(":scope > .asm_start")).toHaveCount(1);
  }
});

for (const architecture of ["arm", "arm64", "x86", "x86_64"] as const)
  test(`${architecture}: Info reflects native stack widths and survives workspace remounts without duplicate menu items`, async ({
    page,
  }, info) => {
    await load(page);
    const target = architectureInfo(architecture);
    await page.locator("input[type=file]").setInputFiles({
      name: "info.scratchsembly.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          architecture,
          name: "Info",
          workspace: {
            scratchsemblyWorkspaceVersion: 1,
            blocks: {
              languageVersion: 0,
              blocks: [
                start(
                  [
                    {
                      type: "asm_push",
                      inputs: { VALUE: { shadow: literal(42) } },
                    },
                  ],
                  info.project.name === "mobile",
                ),
              ],
            },
          },
        }),
      ),
    });
    await expect(page.locator(".scratch-app")).toHaveAttribute(
      "data-architecture",
      architecture,
    );
    await expect(page.locator(".workspace-shell")).toHaveAttribute(
      "data-program-blocks",
      "1",
    );
    const dialog = await openInfo(page, main(page).locator(".asm_push"));
    await expect(dialog).toContainText(`${target.stackBytes} bytes`);
    await expect(dialog).toContainText(`${target.bits}-bit value`);
    await expect(dialog).toContainText(architectureLabel(architecture));
    if (architecture === "arm64")
      await expect(dialog).toContainText("alignment padding");
    await closeInfo(page);
    await expect(page.locator(".step-counter b")).toHaveText("0");
  });

test("Info follows language and appearance, and mnemonic mode keeps English explanations", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await load(page);
  for (const [language, phrase, title, background] of [
    ["en", "Copies a value", "Block info", "rgb(255, 255, 255)"],
    ["de", "Kopiert einen Wert", "Block-Info", "rgb(39, 43, 56)"],
    ["asm", "Copies a value", "Block info", "rgb(39, 43, 56)"],
  ]) {
    if (language === "de")
      await page
        .getByRole("button", { name: "Dark mode", exact: true })
        .click();
    await page.locator(".language-menu select").selectOption(language);
    await expect(
      main(page).locator(".asm_mov > .blocklyLabelField").first(),
    ).toHaveText(
      language === "de" ? "setze" : language === "asm" ? "mov" : "set",
    );
    const dialog = await openInfo(page, main(page).locator(".asm_mov").first());
    await expect(dialog).toHaveAccessibleName(title);
    await expect(dialog).toHaveCSS("background-color", background);
    await expect(dialog).toContainText(phrase);
    await closeInfo(page);
  }
});
