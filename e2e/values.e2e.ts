import { expect, test } from "@playwright/test";
import {
  binary,
  closeValues,
  drag,
  fast,
  importRoots,
  literal,
  loadGermanUI as load,
  main,
  mov,
  palette,
  registerValue,
  start,
  values,
} from "./helpers";

test.beforeEach(async ({ page }) => load(page));
test("palette prototypes contain only empty literal placeholders, not inserted value blocks", async ({
  page,
}) => {
  const contents = await palette(page)
    .locator(":scope > .blocklyBlock")
    .evaluateAll((blocks) =>
      blocks.map((block) => ({
        nested: block.querySelectorAll("g.blocklyBlock:not(.blocklyShadow)")
          .length,
        literals: Array.from(
          block.querySelectorAll(".blocklyShadow.value_number .blocklyText"),
        ).map((element) => element.textContent?.trim()),
      })),
    );
  for (const block of contents) {
    expect(block.nested).toBe(0);
    for (const value of block.literals) expect(value).toBe("");
  }
  await expect(palette(page).locator(":scope > .value_register")).toHaveCount(
    8,
  );
  await expect(palette(page).locator(":scope > .value_number")).toHaveCount(0);
});
test("numbers are edited directly in their input, not dragged from a standalone number block", async ({
  page,
}, info) => {
  const mobile = info.project.name === "mobile";
  const number = main(page)
    .locator(".asm_mov > .value_number .blocklyText")
    .first();
  if (mobile) {
    page.once("dialog", (dialog) => dialog.accept("42"));
    await number.click();
  } else {
    await number.click();
    const input = page.locator(".blocklyHtmlInput");
    await input.fill("42");
    await input.press("Enter");
  }
  await expect(number).toHaveText("42");
  await expect(page.locator(".value-preview")).toHaveCount(0);
  await values(page, mobile);
  await page.getByRole("button", { name: "Schritt", exact: true }).click();
  await expect(registerValue(page, "A")).toHaveText("42");
});
test("a single click previews the live value without executing or opening a register picker", async ({
  page,
}, info) => {
  await page.getByRole("treeitem", { name: "Register", exact: true }).click();
  await palette(page)
    .locator(":scope > .value_register")
    .filter({ hasText: /^B$/ })
    .click();
  await expect(page.locator(".value-preview strong")).toHaveText("0");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await values(page, info.project.name === "mobile");
  await expect(page.locator(".step-counter b")).toHaveText("0");
  await fast(page);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(registerValue(page, "B")).toHaveText("5");
  await closeValues(page, info.project.name === "mobile");
  await expect(page.locator(".value-preview strong")).toHaveText("5");
});
test("clicking a nested calculation reports its current result before the assignment runs", async ({
  page,
}, info) => {
  await page.getByRole("button", { name: "Beispiele", exact: true }).click();
  await page.getByRole("button", { name: /Mit Werten rechnen/ }).click();
  await values(page, info.project.name === "mobile");
  const step = page.getByRole("button", { name: "Schritt", exact: true });
  await step.click();
  await step.click();
  await expect(registerValue(page, "C")).toHaveText("0");
  await closeValues(page, info.project.name === "mobile");
  await main(page)
    .locator(".value_multiply > .blocklyLabelField > text")
    .filter({ hasText: /^×$/ })
    .click();
  await expect(page.locator(".value-preview strong")).toHaveText("48");
  await values(page, info.project.name === "mobile");
  await expect(page.locator(".step-counter b")).toHaveText("2");
  await step.click();
  await expect(registerValue(page, "C")).toHaveText("48");
  await expect(registerValue(page, "A")).toHaveText("12");
  await expect(registerValue(page, "B")).toHaveText("4");
  await expect(page.locator(".step-counter b")).toHaveText("3");
});
for (const colorScheme of ["light", "dark"] as const)
  test.describe(`quiet dragging (${colorScheme})`, () => {
    test.use({ colorScheme });
    test("outlines only the target socket without recoloring it or glowing on the dragged block", async ({
      page,
    }, info) => {
      await importRoots(
        page,
        [start([mov("EAX", 5)], info.project.name === "mobile")],
        1,
      );
      await page
        .getByRole("treeitem", { name: "Register", exact: true })
        .click();
      const target = main(page).locator(".asm_mov > .value_number"),
        box = (await target.boundingBox())!;
      const source = palette(page)
        .locator(":scope > .value_register")
        .filter({ hasText: /^B$/ });
      await drag(page, source, box.x, box.y + box.height / 2, false);
      const held = page.locator(".blocklyDragging");
      await expect(
        held.locator(":scope > .blocklyPath:not(.blocklyPathSelected)"),
      ).toHaveCSS("stroke", "rgb(191, 105, 20)");
      await expect(
        held.locator(":scope > .blocklyPath:not(.blocklyPathSelected)"),
      ).toHaveCSS("fill-opacity", "1");
      await expect(held.locator(":scope > .blocklyPathSelected")).toHaveCSS(
        "filter",
        "none",
      );
      await expect(held.locator(":scope > .blocklyPathSelected")).toHaveCSS(
        "display",
        "none",
      );
      const replacement = main(page).locator(".blocklyReplaceable");
      await expect(replacement).toHaveCount(1);
      await expect(replacement).toHaveClass(/value_number/);
      const style = await replacement
        .locator(":scope > .blocklyPath")
        .evaluate((element) => ({
          fill: getComputedStyle(element).fill,
          filter: getComputedStyle(element).filter,
          stroke: getComputedStyle(element).stroke,
          strokeWidth: getComputedStyle(element).strokeWidth,
        }));
      expect(style).toEqual({
        fill: "rgb(255, 255, 255)",
        filter: "none",
        stroke:
          colorScheme === "light" ? "rgb(120, 127, 148)" : "rgb(173, 182, 205)",
        strokeWidth: "1.5px",
      });
      const marker = (await replacement.boundingBox())!;
      expect(marker.width).toBeLessThan(70);
      await page.mouse.move(box.x + 120, box.y + 160, { steps: 10 });
      await expect(replacement).toHaveCount(0);
      await page.mouse.move(box.x + 6, box.y + box.height / 2, { steps: 10 });
      await expect(replacement).toHaveCount(1);
      await page.mouse.up();
      await expect(main(page).locator(".blocklyReplaceable")).toHaveCount(0);
      await expect(main(page).locator(".asm_mov > .value_register")).toHaveText(
        "B",
      );
      await expect(page.locator(".program-error")).toHaveCount(0);
    });
    test("uses a faint neutral insertion ghost, then removes it after snapping", async ({
      page,
    }, info) => {
      await importRoots(
        page,
        [start([mov("EAX", 5)], info.project.name === "mobile")],
        1,
      );
      await page
        .getByRole("treeitem", { name: "Register", exact: true })
        .click();
      const target = (await main(page)
        .locator(".asm_mov > .blocklyPath")
        .boundingBox())!;
      const source = palette(page).locator(":scope > .asm_inc");
      await source.hover();
      const sourceBox = (await source.boundingBox())!;
      await drag(
        page,
        source,
        target.x,
        target.y + target.height - 5 + sourceBox.height / 2,
        false,
      );
      const ghost = main(page).locator(
        ".blocklyInsertionMarker > .blocklyPath",
      );
      await expect(ghost).toHaveCount(1);
      await expect(ghost).toHaveCSS("fill-opacity", "0.12");
      await expect(ghost).toHaveCSS(
        "fill",
        colorScheme === "light" ? "rgb(87, 94, 117)" : "rgb(237, 240, 247)",
      );
      await expect(ghost).toHaveCSS("filter", "none");
      await expect(ghost).toHaveCSS("stroke", "none");
      await page.mouse.up();
      await expect(main(page).locator(".blocklyInsertionMarker")).toHaveCount(
        0,
      );
      await expect(main(page).locator(".asm_mov > .asm_inc")).toHaveCount(1);
      await expect(page.locator(".workspace-shell")).toHaveAttribute(
        "data-program-blocks",
        "2",
      );
    });
    test("keeps the 3D emboss effect exclusively on the executed block, including when selected", async ({
      page,
    }, info) => {
      await importRoots(
        page,
        [start([mov("EAX", 5), mov("EBX", 7)], info.project.name === "mobile")],
        2,
      );
      await values(page, info.project.name === "mobile");
      await page.getByRole("button", { name: "Schritt", exact: true }).click();
      await expect(registerValue(page, "A")).toHaveText("5");
      await closeValues(page, info.project.name === "mobile");
      const active = main(page).locator(".blocklyHighlighted");
      await expect(active).toHaveCount(1);
      await expect(active).toHaveClass(/asm_mov/);
      const body = active.locator(
        ":scope > .blocklyPath:not(.blocklyPathSelected)",
      );
      await expect(body).toHaveCSS("filter", /blocklyEmbossFilter/);
      await active.locator(":scope > .blocklyLabelField").first().click();
      await body.focus();
      await expect(body).toBeFocused();
      await expect(body).toHaveCSS("outline-style", "none");
      await expect(active.locator(":scope > .blocklyPathSelected")).toHaveCSS(
        "display",
        "none",
      );
      await expect(body).toHaveCSS("filter", /blocklyEmbossFilter/);
      await expect(active.locator(":scope > .blocklyPathSelected")).toHaveCSS(
        "filter",
        "none",
      );
      await values(page, info.project.name === "mobile");
      await page.getByRole("button", { name: "Schritt", exact: true }).click();
      await expect(registerValue(page, "B")).toHaveText("7");
      await expect(main(page).locator(".blocklyHighlighted")).toHaveCount(1);
      await expect(
        main(page).locator(
          ".blocklyHighlighted > .blocklyPath:not(.blocklyPathSelected)",
        ),
      ).toHaveCSS("filter", /blocklyEmbossFilter/);
    });
  });
test("a palette refresh cannot change the reporter held before a drag starts", async ({
  page,
}, info) => {
  await importRoots(
    page,
    [start([mov("EAX", 5)], info.project.name === "mobile")],
    1,
  );
  await page.getByRole("treeitem", { name: "Register", exact: true }).click();
  const source = palette(page)
    .locator(":scope > .value_register")
    .filter({ hasText: /^B$/ });
  const target = (await main(page)
    .locator(".asm_mov > .value_number")
    .boundingBox())!;
  await source.hover();
  const initial = (await source.boundingBox())!;
  await source.hover({ position: { x: 6, y: initial.height / 2 } });
  const origin = (await source.boundingBox())!;
  await page.mouse.down();
  await page.evaluate(async () => {
    // Exercise the plugin's actual deferred refresh while the mouse is held.
    const Blockly = await import("/node_modules/.vite/deps/blockly_core.js");
    Blockly.common.getMainWorkspace().getToolbox().refreshSelection();
    await new Promise((resolve) => setTimeout(resolve, 180));
  });
  await expect(source).toHaveClass(/blocklySelected/);
  await page.mouse.move(origin.x + 24, origin.y + origin.height / 2, {
    steps: 5,
  });
  await page.mouse.move(target.x + 6, target.y + target.height / 2, {
    steps: 15,
  });
  await page.mouse.up();
  await expect(main(page).locator(".asm_mov > .value_register")).toHaveText(
    "B",
  );
  await expect(page.locator(".program-error")).toHaveCount(0);
});
test("a pending palette refresh leaves a right-click Info menu usable", async ({
  page,
}) => {
  await page.getByRole("treeitem", { name: "Register", exact: true }).click();
  const source = palette(page)
    .locator(":scope > .value_register")
    .filter({ hasText: /^B$/ });
  await source.click({ button: "right" });
  const info = page.getByRole("menuitem", { name: "Info", exact: true });
  await expect(info).toBeVisible();
  await page.evaluate(async () => {
    const Blockly = await import("/node_modules/.vite/deps/blockly_core.js");
    Blockly.common.getMainWorkspace().getToolbox().refreshSelection();
    await new Promise((resolve) => setTimeout(resolve, 180));
  });
  await expect(info).toBeVisible();
  await info.click();
  await expect(
    page.getByRole("dialog", { name: "Block-Info", exact: true }),
  ).toContainText("Register B (EBX)");
  await expect(page.locator(".step-counter b")).toHaveText("0");
});
test("deletes a block by dragging it into the block menu, with no trash can", async ({
  page,
}, info) => {
  await importRoots(
    page,
    [start([mov("EAX", 17), mov("EBX", 4)], info.project.name === "mobile")],
    2,
  );
  const last = main(page).locator(".asm_mov").last();
  await drag(page, last, 15, 330);
  await expect(page.locator(".workspace-shell")).toHaveAttribute(
    "data-program-blocks",
    "1",
  );
  await expect(main(page).locator(".asm_mov")).toHaveCount(1);
  await expect(page.locator(".blocklyTrash")).toHaveCount(0);
});
test("previews errors locally and leaves registers and execution state unchanged", async ({
  page,
}, info) => {
  await page.getByRole("treeitem", { name: "Rechnen", exact: true }).click();
  await palette(page)
    .locator(".value_divide > .blocklyLabelField > text")
    .filter({ hasText: /^÷$/ })
    .click();
  await expect(page.locator(".value-preview.error")).toContainText(
    "nicht durch 0",
  );
  await values(page, info.project.name === "mobile");
  await expect(page.locator(".step-counter b")).toHaveText("0");
  await expect(registerValue(page, "A")).toHaveText("0");
  await expect(registerValue(page, "H")).toHaveText("4096");
  await expect(page.locator(".runtime-error")).toHaveCount(0);
});
test("every newly created label has exactly one independent event hat", async ({
  page,
}, info) => {
  for (let i = 0; i < 2; i++) {
    await page.getByRole("treeitem", { name: "Labels", exact: true }).click();
    const source = palette(page).locator(":scope > .asm_label");
    await expect
      .poll(async () => {
        const box = await source.boundingBox();
        return !!box && box.y > 95 && box.y < 350;
      })
      .toBe(true);
    await page.waitForTimeout(250);
    await drag(
      page,
      source,
      info.project.name === "mobile" ? 160 + i * 70 : 720 + i * 100,
      650,
    );
    await expect(main(page).locator(":scope > .asm_label")).toHaveCount(i + 2);
  }
  const names = await main(page)
    .locator(".asm_label > .blocklyEditableField")
    .allTextContents();
  expect(new Set(names).size).toBe(3);
  await expect(page.locator(".program-error")).toHaveCount(0);
  await values(page, info.project.name === "mobile");
  await fast(page);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(registerValue(page, "B")).toHaveText("5");
});
test("runtime arithmetic errors do not expose temporary compiler register changes", async ({
  page,
}, info) => {
  await importRoots(
    page,
    [
      start(
        [
          mov("EAX", 17),
          mov("ECX", binary("value_divide", literal(7), literal(0))),
          mov("EBX", 99),
        ],
        info.project.name === "mobile",
      ),
    ],
    3,
  );
  await page.getByLabel("Sprache").selectOption("en");
  await values(page, info.project.name === "mobile", "en");
  await fast(page);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Cannot divide by zero");
  await expect(registerValue(page, "A")).toHaveText("17");
  await expect(registerValue(page, "B")).toHaveText("0");
  await expect(registerValue(page, "C")).toHaveText("0");
});
