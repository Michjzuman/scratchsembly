import { expect, test } from "@playwright/test";
import {
  closeValues,
  loadGermanUI as load,
  main,
  palette,
  registerValue,
  values,
} from "./helpers";

const darkSurface = "rgb(39, 43, 56)";
const toggle = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: "Dunkler Modus", exact: true });

test("uses the system appearance and remembers an explicit override", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await load(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  const expectUnmarkedToggle = async () => {
    await page.mouse.move(0, 0);
    await expect(toggle(page)).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(toggle(page)).toHaveCSS("box-shadow", "none");
  };
  await expectUnmarkedToggle();
  await expect(page.locator(".blocklySvg")).toHaveCSS(
    "background-color",
    darkSurface,
  );
  await toggle(page).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
  await expectUnmarkedToggle();
  await toggle(page).click();
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectUnmarkedToggle();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("block text is bold and only white captions on yellow blocks have a subtle shadow", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await load(page);
  for (const mode of ["light", "dark"] as const) {
    if (mode === "dark") await toggle(page).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
    for (const canvas of [main(page), palette(page)]) {
      expect(
        await canvas
          .locator(".blocklyText")
          .evaluateAll((texts) => [
            ...new Set(texts.map((text) => getComputedStyle(text).fontWeight)),
          ]),
      ).toEqual(["700"]);
      for (const type of ["asm_start", "asm_label", "asm_jmp"]) {
        const caption = canvas
          .locator(`.${type} > .blocklyLabelField > .blocklyText`)
          .first();
        await expect(caption).toHaveCSS(
          "text-shadow",
          "rgba(90, 60, 0, 0.3) 0px 1px 1px",
        );
      }
      for (const selector of [
        ".asm_mov > .blocklyLabelField > .blocklyText",
        ".asm_label > .blocklyEditableField > .blocklyText",
        ".value_number > .blocklyEditableField > .blocklyText",
      ]) {
        await expect(canvas.locator(selector).first()).toHaveCSS(
          "text-shadow",
          "none",
        );
      }
    }
  }
});

test("changing appearance preserves live values, block DOM and the selected Assembly tab", async ({
  page,
}, info) => {
  const mobile = info.project.name === "mobile";
  await page.emulateMedia({ colorScheme: "light" });
  await load(page);
  await values(page, mobile);
  await page.getByRole("button", { name: "Schritt", exact: true }).click();
  await page.getByRole("button", { name: "Schritt", exact: true }).click();
  await expect(registerValue(page, "A")).toHaveText("5");
  await closeValues(page, mobile);
  const blocks = (await main(page).innerHTML()).replace(
    / blocklyHighlighted/g,
    "",
  );
  await toggle(page).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    (await main(page).innerHTML()).replace(/ blocklyHighlighted/g, ""),
  ).toBe(blocks);
  await values(page, mobile);
  await expect(registerValue(page, "A")).toHaveText("5");
  await expect(page.locator(".step-counter b")).toHaveText("2");
  await expect(
    page.getByRole("list", { name: "Registerwerte" }).getByRole("listitem"),
  ).toHaveCount(8);
  await expect(registerValue(page, "A")).toHaveCSS("border-radius", "14px");
  await expect(registerValue(page, "A")).toHaveCSS("font-weight", "700");
  await closeValues(page, mobile);
  await page.getByRole("tab", { name: "Assembly", exact: true }).click();
  const source = await page.locator(".source-code").innerText();
  await expect(page.locator(".code-panel")).toHaveCSS(
    "background-color",
    darkSurface,
  );
  await toggle(page).click();
  await expect(
    page.getByRole("tab", { name: "Assembly", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(await page.locator(".source-code").innerText()).toBe(source);
  await values(page, mobile);
  await expect(registerValue(page, "A")).toHaveText("5");
  await expect(page.locator(".step-counter b")).toHaveText("2");
});

test("the palette opens with entry hats and ordinary commands, with reporters further down", async ({
  page,
}) => {
  await load(page);
  await expect(page.getByRole("treeitem")).toHaveText([
    "Labels",
    "Register",
    "Speicher",
    "Rechnen",
    "Logik",
  ]);
  await expect(
    page.getByRole("treeitem", { name: "Labels", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const blocks = palette(page).locator(":scope > .blocklyBlock");
  await expect(blocks.first()).toHaveClass(/asm_start/);
  for (const canvas of [main(page), palette(page)]) {
    const icon = canvas.locator(
      ":scope > .asm_start > .blocklyImageField > image",
    );
    await expect(icon).toHaveCount(1);
    await expect(icon).toHaveAttribute("width", "18px");
    await expect(icon).toHaveAttribute("height", "18px");
    expect(
      decodeURIComponent(
        await icon.evaluate((image) => (image as SVGImageElement).href.baseVal),
      ),
    ).toContain('fill="#389438"');
  }
  await expect(blocks.nth(1)).toHaveClass(/asm_label/);
  const types = await blocks.evaluateAll((blocks) =>
    blocks.map((block) =>
      [...block.classList].find((name) => /^(asm_|value_)/.test(name))!,
    ),
  );
  expect(types.slice(10, 15)).toEqual([
    "asm_mov",
    "asm_add",
    "asm_sub",
    "asm_inc",
    "asm_dec",
  ]);
  const firstReporter = types.findIndex((type) => type.startsWith("value_"));
  expect(firstReporter).toBe(15);
  expect(types.indexOf("asm_push")).toBeGreaterThan(firstReporter);
  expect(types.indexOf("asm_store")).toBeLessThan(
    types.indexOf("value_memory"),
  );
  await page.getByRole("treeitem", { name: "Register", exact: true }).click();
  await expect(palette(page).locator(":scope > .asm_mov")).toBeInViewport();
  await expect(page.locator(".workspace-shell")).toHaveAttribute(
    "data-program-blocks",
    "8",
  );
});
test("the category rail shares the palette surface and uses compact, readable category tabs in both modes", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await load(page);
  const category = page.getByRole("treeitem", { name: "Rechnen", exact: true });
  await category.click();
  await expect(palette(page).locator(":scope > .value_add")).toBeInViewport();
  for (const mode of ["light", "dark"] as const) {
    if (mode === "dark") await toggle(page).click();
    await expect(category).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".blocklyToolbox")).toHaveCSS(
      "background-color",
      mode === "dark" ? "rgb(32, 35, 45)" : "rgb(249, 249, 249)",
    );
    await expect(category.locator(".blocklyToolboxCategory")).toHaveCSS(
      "border-radius",
      "6px",
    );
    await expect(category.locator(".blocklyToolboxCategory")).toHaveCSS(
      "border-top-color",
      "rgb(89, 192, 89)",
    );
    await expect(category.locator(".categoryBubble")).toHaveCSS(
      "width",
      "24px",
    );
    await expect(category.locator(".categoryBubble")).toHaveCSS(
      "height",
      "12px",
    );
    await expect(category.locator(".blocklyToolboxCategoryLabel")).toHaveCSS(
      "font-size",
      "11px",
    );
    expect(
      await page
        .locator(".blocklyToolboxCategoryLabel")
        .evaluateAll((labels) =>
          labels.every((label) => label.scrollWidth <= label.clientWidth),
        ),
    ).toBe(true);
  }
  await palette(page).locator(":scope > .value_add").click();
  await expect(page.locator(".value-preview strong")).toHaveText("0");
});
test("CMP stays purple and Scratch-colored dropdowns differ from text inputs in both modes", async ({
  page,
}, info) => {
  await page.emulateMedia({ colorScheme: "light" });
  await load(page);
  await expect(main(page).locator(".asm_cmp > .blocklyPath")).toHaveCSS(
    "fill",
    "rgb(153, 102, 255)",
  );
  const types = await palette(page)
    .locator(":scope > .blocklyBlock")
    .evaluateAll((blocks) =>
      blocks.map((block) =>
        [...block.classList].find((name) => /^(asm_|value_)/.test(name))!,
      ),
    );
  expect(types.indexOf("asm_cmp")).toBeGreaterThan(types.indexOf("value_add"));
  expect(types.indexOf("asm_cmp") + 1).toBe(types.indexOf("value_equal"));
  await expect(
    palette(page).locator(":scope > .value_equal > .blocklyPath"),
  ).toHaveCSS("fill", "rgb(153, 102, 255)");
  const fieldId = await main(page)
    .locator(".asm_mov > .blocklyDropdownField")
    .first()
    .getAttribute("id");
  // Blockly brings the selected block to the front; do not rely on DOM order after clicking.
  const dropdown = page.locator(`[id=${JSON.stringify(fieldId)}]`);
  const input = dropdown
    .locator("xpath=..")
    .locator(":scope > .value_number .blocklyEditableField")
    .first();
  const nameInput = main(page).locator(".asm_label > .blocklyEditableField");
  for (const mode of ["light", "dark"] as const) {
    if (mode === "dark") await toggle(page).click();
    await expect(dropdown.locator(".blocklyFieldRect")).toHaveCSS(
      "fill",
      "rgba(0, 0, 0, 0.1)",
    );
    await expect(dropdown.locator(".blocklyFieldRect")).toHaveCSS("rx", "4px");
    await expect(dropdown.locator(".blocklyFieldRect")).toHaveCSS(
      "stroke-width",
      "1.5px",
    );
    await expect(dropdown.locator(".blocklyDropdownText")).toHaveCSS(
      "font-weight",
      "700",
    );
    await expect(dropdown.locator(".blocklyDropdownText")).toHaveCSS(
      "fill",
      "rgb(255, 255, 255)",
    );
    await expect(dropdown.locator("image").last()).toHaveCSS("filter", "none");
    for (const type of ["asm_mov", "asm_cmp", "asm_jne", "asm_pop"]) {
      const field = palette(page)
        .locator(`:scope > .${type} > .blocklyDropdownField`)
        .first();
      await expect(field.locator(".blocklyFieldRect")).toHaveCSS(
        "fill",
        "rgba(0, 0, 0, 0.1)",
      );
      await expect(field.locator(".blocklyDropdownText")).toHaveCSS(
        "fill",
        "rgb(255, 255, 255)",
      );
    }
    await expect(dropdown).toHaveCSS("cursor", "pointer");
    for (const field of [input, nameInput]) {
      await expect(field.locator(".blocklyFieldRect")).toHaveCSS(
        "fill",
        "rgb(255, 255, 255)",
      );
      await expect(field.locator(".blocklyFieldRect")).toHaveCSS("rx", "13px");
      await expect(field).toHaveCSS("cursor", "text");
    }
  }
  await dropdown.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.locator(".blocklyHtmlInput")).toHaveCount(0);
  await page.getByRole("option", { name: "C", exact: true }).click();
  await expect(dropdown).toHaveText("C");
  const number = input.locator(".blocklyText");
  if (info.project.name === "mobile") {
    page.once("dialog", (dialog) => dialog.accept("9"));
    await number.click();
  } else {
    await number.click();
    await page.locator(".blocklyHtmlInput").fill("9");
    await page.locator(".blocklyHtmlInput").press("Enter");
  }
  await expect(number).toHaveText("9");
  await expect(page.locator(".program-error")).toHaveCount(0);
  await page.getByRole("treeitem", { name: "Logik", exact: true }).click();
  await expect(palette(page).locator(":scope > .asm_cmp")).toBeInViewport();
});
test("dark mode also covers reporter previews, dropdown menus and dialogs", async ({
  page,
}, info) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await load(page);
  await page.getByRole("treeitem", { name: "Register", exact: true }).click();
  await palette(page)
    .locator(":scope > .value_register")
    .filter({ hasText: /^B$/ })
    .click();
  await expect(page.locator(".value-preview")).toHaveCSS(
    "background-color",
    darkSurface,
  );
  await expect(page.locator(".value-preview strong")).toHaveText("0");
  await page.keyboard.press("Escape");
  if (info.project.name === "mobile")
    await page
      .getByRole("button", { name: "Blockpalette", exact: true })
      .click();
  await main(page).locator(".asm_mov > .blocklyDropdownField").first().click();
  await expect(page.getByRole("listbox")).toHaveCSS(
    "background-color",
    darkSurface,
  );
  await expect(page.getByRole("option").first()).toHaveCSS(
    "color",
    "rgb(237, 240, 247)",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Hilfe", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCSS(
    "background-color",
    darkSurface,
  );
});
