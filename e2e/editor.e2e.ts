import { expect, test } from "@playwright/test";
import {
  closeValues,
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
test("shows the new name, all registers and a real stack instead of a stage", async ({
  page,
}, info) => {
  await expect(page).toHaveTitle("scratchsembly");
  await expect(
    page.getByRole("link", { name: "scratchsembly", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Blocks", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.locator(".stage-screen, .sprite-panel, .blocklyTrash"),
  ).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await values(page, info.project.name === "mobile");
  for (const name of ["A", "B", "C", "D", "E", "F", "G", "H"])
    await expect(registerValue(page, name)).toBeVisible();
  await expect(registerValue(page, "H")).toHaveText("4096");
  await expect(page.getByLabel("Stackwerte")).toContainText(
    "Der Stack ist leer.",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("uses Assembly as a full tab and restores the block workspace", async ({
  page,
}) => {
  await page.getByRole("tab", { name: "Assembly", exact: true }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Blocks", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("tabpanel", { name: "Assembly", exact: true }),
  ).toBeVisible();
  const code = await page.locator(".code-panel").boundingBox(),
    area = await page.locator(".workspace-shell").boundingBox();
  expect(code!.height).toBeGreaterThan(area!.height * 0.95);
  await expect(page.locator(".source-code")).toContainText("start:");
  await expect(page.locator(".source-code")).toContainText("mov");
  await page.getByRole("tab", { name: "Blocks", exact: true }).click();
  await expect(main(page).locator(".asm_start")).toBeVisible();
  await expect(page.locator(".code-panel")).toHaveCount(0);
});
test("runs independent event heads with explicit jumps and resets", async ({
  page,
}, info) => {
  await expect(main(page).locator(":scope > .asm_start")).toHaveText(/start/);
  await expect(main(page).locator(":scope > .asm_label")).toHaveCount(1);
  await values(page, info.project.name === "mobile");
  await page.getByRole("button", { name: "Schritt", exact: true }).click();
  await expect(registerValue(page, "A")).toHaveText("5");
  await fast(page);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator(".execution-status")).toContainText("Beendet");
  await expect(registerValue(page, "A")).toHaveText("0");
  await expect(registerValue(page, "B")).toHaveText("5");
  await expect(page.locator(".step-counter b")).toHaveText("23");
  await page.getByLabel("Stoppen und zurücksetzen", { exact: true }).click();
  await expect(page.locator(".step-counter b")).toHaveText("0");
});
test("shows every active stack value with the newest value first", async ({
  page,
}, info) => {
  const push = (number: number) => ({
    type: "asm_push",
    inputs: {
      VALUE: { shadow: { type: "value_number", fields: { NUM: number } } },
    },
  });
  await importRoots(
    page,
    [start([push(11), push(22), push(33)], info.project.name === "mobile")],
    3,
  );
  await values(page, info.project.name === "mobile");
  await fast(page);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator(".execution-status")).toContainText("Beendet");
  await expect(page.locator(".stack-row")).toHaveCount(3);
  await expect(page.locator(".stack-row > code:last-child")).toHaveText([
    "33",
    "22",
    "11",
  ]);
  await expect(page.locator(".stack-row").first()).toContainText("H →");
  await expect(registerValue(page, "H")).toHaveText("4084");
});
test("the stack scrolls through all 1024 values, not just a short preview", async ({
  page,
}, info) => {
  await importRoots(
    page,
    [start([mov("ESP", 0)], info.project.name === "mobile")],
    1,
  );
  await values(page, info.project.name === "mobile");
  await page.getByRole("button", { name: "Schritt", exact: true }).click();
  await expect(page.locator(".stack-row")).toHaveCount(1024);
  const stack = page.getByLabel("Stackwerte", { exact: true });
  expect(
    await stack.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  await stack.focus();
  await stack.press("End");
  await expect(page.locator(".stack-row").last()).toBeInViewport();
  await expect(page.locator(".stack-row").last()).toContainText("0x0FFC");
});
test("autosaves and restores the event layout and title", async ({
  page,
}, info) => {
  await page.getByLabel("Projektname", { exact: true }).fill("Mein Playground");
  await page.getByLabel("Projektname", { exact: true }).blur();
  await expect(page.locator(".save-mark")).toHaveClass("save-mark saved");
  await page.reload();
  await expect(page.getByLabel("Projektname", { exact: true })).toHaveValue(
    "Mein Playground",
  );
  await expect(main(page).locator(":scope > .asm_label")).toHaveCount(1);
  await values(page, info.project.name === "mobile");
  await expect(registerValue(page, "A")).toHaveText("0");
  await closeValues(page, info.project.name === "mobile");
});
