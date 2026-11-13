import { expect, test } from "@playwright/test";
import {
  fast,
  importRoots,
  loadGermanUI as load,
  main,
  mov,
  registerValue,
  start,
  values,
} from "./helpers";

test.beforeEach(async ({ page }) => load(page));
test("switches all three language modes without resetting values or the program", async ({
  page,
}, info) => {
  await values(page, info.project.name === "mobile");
  await fast(page);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(registerValue(page, "B")).toHaveText("5");
  const select = page.locator(".language-menu select");
  await expect(select.locator("option")).toHaveText([
    "English",
    "Deutsch",
    "Assembly",
  ]);
  for (const [language, prefix, title] of [
    ["en", "set", "Registers"],
    ["asm", "mov", "Registers"],
    ["de", "setze", "Register"],
  ] as const) {
    await select.selectOption(language);
    await expect(
      main(page)
        .locator(".asm_mov")
        .first()
        .locator(":scope > .blocklyLabelField")
        .first(),
    ).toHaveText(prefix);
    await expect(page.locator(".register-heading h2")).toHaveText(title);
    await expect(registerValue(page, "B")).toHaveText("5");
    await expect(page.locator(".step-counter b")).toHaveText("23");
  }
});
test("persists the language and uses English source terminology in the native mode", async ({
  page,
}) => {
  await page.getByLabel("Sprache").selectOption("asm");
  await page.getByRole("tab", { name: "Assembly", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Source", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "File", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Language")).toHaveValue("asm");
  await expect(
    main(page)
      .locator(".asm_mov")
      .first()
      .locator(":scope > .blocklyLabelField")
      .first(),
  ).toHaveText("mov");
});
test("saves and reloads event heads as a scratchsembly project", async ({
  page,
}, info) => {
  await page.getByRole("button", { name: "Datei", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("menuitem", { name: "Auf dem Computer speichern" })
    .click();
  const download = await pending,
    path = info.outputPath("project.scratchsembly.json");
  expect(download.suggestedFilename()).toMatch(/\.scratchsembly\.json$/);
  await download.saveAs(path);
  await page.getByRole("button", { name: "Datei", exact: true }).click();
  await page.getByRole("menuitem", { name: "Neu", exact: true }).click();
  await page.getByRole("button", { name: "Neu anfangen" }).click();
  await expect(page.locator(".workspace-shell")).toHaveAttribute(
    "data-program-blocks",
    "0",
  );
  await page.locator("input[type=file]").setInputFiles(path);
  await expect(page.locator(".workspace-shell")).toHaveAttribute(
    "data-program-blocks",
    "8",
  );
  await expect(main(page).locator(":scope > .asm_start")).toHaveCount(1);
  await expect(main(page).locator(":scope > .asm_label")).toHaveCount(1);
});
test("renaming a label event updates every jump target", async ({ page }) => {
  page.once("dialog", (dialog) => dialog.accept("runde"));
  await main(page).locator(".asm_label > .blocklyEditableField").click();
  const input = page.locator(".blocklyHtmlInput");
  if (await input.isVisible()) {
    await input.fill("runde");
    await input.press("Enter");
  }
  await expect(
    main(page).locator(".asm_jmp > .blocklyDropdownField"),
  ).toHaveText("runde");
  await expect(
    main(page).locator(".asm_jne > .blocklyDropdownField"),
  ).toHaveText("runde");
  await expect(page.locator(".program-error")).toHaveCount(0);
  await page.getByRole("tab", { name: "Assembly", exact: true }).click();
  await expect(
    page.locator(".source-line.label").filter({ hasText: "runde:" }),
  ).toHaveCount(1);
});
test("labels are independent entry points, not automatic continuations", async ({
  page,
}, info) => {
  await importRoots(
    page,
    [
      start([mov("EAX", 1)], info.project.name === "mobile"),
      {
        type: "asm_label",
        x: 420,
        y: 70,
        fields: { A: "not_called" },
        next: { block: mov("EBX", 99) },
      },
    ],
    1,
  );
  await values(page, info.project.name === "mobile");
  await fast(page);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator(".execution-status")).toContainText("Beendet");
  await expect(registerValue(page, "A")).toHaveText("1");
  await expect(registerValue(page, "B")).toHaveText("0");
});
test("a breakpoint in Assembly pauses at the visible block boundary", async ({
  page,
}, info) => {
  await page.getByRole("tab", { name: "Assembly", exact: true }).click();
  await page.locator(".source-line.instruction .line-number").first().click();
  await values(page, info.project.name === "mobile");
  await fast(page);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator(".execution-status")).toContainText("Pausiert");
  await expect(page.locator(".step-counter b")).toHaveText("0");
  await page.getByRole("button", { name: "Schritt", exact: true }).click();
  await expect(registerValue(page, "A")).toHaveText("5");
});
