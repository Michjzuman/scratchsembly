import { expect, test } from "@playwright/test";
import {
  closeValues,
  fast,
  importRoots,
  load,
  main,
  mov,
  registerValue,
  start,
  values,
} from "./helpers";

// The application default is English even when the browser/OS locale is German.
test.use({ locale: "de-DE" });

test("fresh visitors get an entirely English editor, examples, Blockly menus, runtime, and console", async ({
  page,
}, info) => {
  await load(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByLabel("Language", { exact: true })).toHaveValue("en");
  await expect(
    page.getByRole("button", { name: "File", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".project-name")).toHaveValue("My first countdown");
  await expect(page.getByRole("treeitem")).toHaveText([
    "Labels",
    "Registers",
    "Memory",
    "Operators",
    "Logic",
  ]);
  await expect(
    main(page).locator(".asm_mov > .blocklyLabelField").first(),
  ).toHaveText("set");
  await expect(
    main(page).locator(".asm_label > .blocklyEditableField"),
  ).toHaveText("loop");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("assembly-playground.language"),
    ),
  ).toBeNull();
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /interactive CPU simulator/,
  );

  await main(page)
    .locator(".asm_mov")
    .first()
    .locator(":scope > .blocklyPath:not(.blocklyPathSelected)")
    .click({ button: "right", position: { x: 6, y: 15 } });
  await expect(page.locator(".blocklyContextMenu")).toContainText("Duplicate");
  await page.keyboard.press("Escape");

  const mobile = info.project.name === "mobile";
  await values(page, mobile);
  await expect(page.locator(".register-heading h2")).toHaveText("Registers");
  await expect(page.getByLabel("Stack values", { exact: true })).toContainText(
    "The stack is empty.",
  );
  await fast(page);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator(".execution-status")).toContainText("Finished");
  await expect(registerValue(page, "A")).toHaveText("0");
  await expect(registerValue(page, "B")).toHaveText("5");
  await closeValues(page, mobile);
  await page.getByRole("tab", { name: "Assembly", exact: true }).click();
  await expect(page.locator(".source-code")).toContainText("loop:");
  await expect(page.locator(".source-code")).not.toContainText("schleife");
  await page.getByRole("button", { name: "Console", exact: true }).click();
  await expect(page.locator(".console-entries")).toContainText(
    "Flags are unchanged.",
  );
  await expect(page.locator(".console-entries")).toContainText("No jump");
});

for (const architecture of ["arm", "arm64", "x86", "x86_64"] as const)
  test(`${architecture}: English remains the default when creating a project`, async ({
    page,
  }) => {
    await load(page);
    await page.getByRole("button", { name: "File", exact: true }).click();
    await page.getByRole("menuitem", { name: "New", exact: true }).click();
    const label = architecture === "arm64" ? "AArch64" : architecture;
    await page.getByRole("radio", { name: new RegExp(`^${label} `) }).check();
    await page
      .getByRole("button", { name: "Start fresh", exact: true })
      .click();
    await expect(page.locator(".scratch-app")).toHaveAttribute(
      "data-architecture",
      architecture,
    );
    await expect(
      page.getByLabel("Project architecture", { exact: true }),
    ).toHaveText(label);
    await expect(page.locator(".project-name")).toHaveValue("Untitled project");
    await expect(page.getByLabel("Language", { exact: true })).toHaveValue(
      "en",
    );
    await expect(page.locator(".workspace-shell")).toHaveAttribute(
      "data-program-blocks",
      "0",
    );
  });

test("English error previews, runtime errors, guide, and new examples do not leak German copy", async ({
  page,
}, info) => {
  await load(page);
  await page.getByRole("button", { name: "Examples", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Choose a program to try.",
  );
  await page.getByRole("button", { name: /Calculating with values/ }).click();
  await expect(main(page).locator(".value_multiply")).toHaveCount(1);
  await main(page).locator(".value_multiply > .blocklyLabelField").click();
  await expect(page.locator(".value-preview")).toContainText("Current value");
  await page.getByLabel("Close preview", { exact: true }).click();
  await importRoots(
    page,
    [
      start(
        [
          mov("EAX", {
            type: "value_divide",
            inputs: {
              LEFT: { shadow: { type: "value_number", fields: { NUM: 5 } } },
              RIGHT: { shadow: { type: "value_number", fields: { NUM: 0 } } },
            },
          }),
        ],
        info.project.name === "mobile",
      ),
    ],
    1,
  );
  await main(page).locator(".value_divide > .blocklyLabelField").click();
  await expect(page.locator(".value-preview")).toContainText(
    "Cannot divide by zero.",
  );
  await page.getByLabel("Close preview", { exact: true }).click();
  await values(page, info.project.name === "mobile");
  await page.getByRole("button", { name: "Step", exact: true }).click();
  await expect(page.locator(".runtime-error")).toHaveText(
    "Cannot divide by zero.",
  );
  await closeValues(page, info.project.name === "mobile");
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Keyboard shortcuts");
  await page.getByRole("button", { name: "Open guide", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("How it works");
  await expect(page.getByRole("dialog")).toContainText(
    "Browser execution is simulated.",
  );
});

test("saved German choices and user names survive switching to the new English default", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("assembly-playground.language"))
      localStorage.setItem("assembly-playground.language", "de");
  });
  await load(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByLabel("Sprache", { exact: true })).toHaveValue("de");
  await expect(page.locator(".project-name")).toHaveValue(
    "Mein erster Countdown",
  );
  await page.getByLabel("Sprache", { exact: true }).selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    main(page).locator(".asm_label > .blocklyEditableField"),
  ).toHaveText("schleife");
  await expect(page.locator(".project-name")).toHaveValue(
    "Mein erster Countdown",
  );
  await expect(page.locator(".save-mark")).toHaveClass(/saved/);
  await page.reload();
  await expect(page.getByLabel("Language", { exact: true })).toHaveValue("en");
  await expect(page.locator(".project-name")).toHaveValue(
    "Mein erster Countdown",
  );
  await expect(
    main(page).locator(".asm_label > .blocklyEditableField"),
  ).toHaveText("schleife");
  await page.getByRole("button", { name: "Examples", exact: true }).click();
  await page.getByRole("button", { name: /My first countdown/ }).click();
  await expect(
    main(page).locator(".asm_label > .blocklyEditableField"),
  ).toHaveText("loop");
});

for (const storage of ["invalid", "unavailable"] as const)
  test(`English is the fallback when preference storage is ${storage}`, async ({
    page,
  }) => {
    await page.addInitScript((mode) => {
      if (mode === "invalid")
        localStorage.setItem("assembly-playground.language", "invalid");
      else
        Object.defineProperty(window, "localStorage", {
          get() {
            throw new DOMException("Storage unavailable", "SecurityError");
          },
        });
    }, storage);
    await load(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByLabel("Language", { exact: true })).toHaveValue(
      "en",
    );
    await expect(
      page.getByRole("button", { name: "File", exact: true }),
    ).toBeVisible();
  });
