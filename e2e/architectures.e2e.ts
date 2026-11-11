import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { architectureInfo, type Architecture } from "../src/architectures";
import {
  closeValues,
  fast,
  loadGermanUI as load,
  main,
  palette,
  registerValue,
  values,
  literal,
  mov,
  start as entry,
} from "./helpers";

async function newProject(page: Page, architecture: Architecture) {
  await page.getByRole("button", { name: "Datei", exact: true }).click();
  await page.getByRole("menuitem", { name: "Neu", exact: true }).click();
  await expect(page.getByRole("radio")).toHaveCount(4);
  await page
    .getByRole("radio", {
      name: `${architecture === "arm64" ? "AArch64" : architecture} ${architectureInfo(architecture).bits}-bit`,
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Neu anfangen", exact: true }).click();
  await expect(page.locator(".scratch-app")).toHaveAttribute(
    "data-architecture",
    architecture,
  );
  await expect(page.locator(".workspace-shell")).toHaveAttribute(
    "data-program-blocks",
    "0",
  );
}
async function example(page: Page, name: RegExp) {
  await page.getByRole("button", { name: "Beispiele", exact: true }).click();
  await page.getByRole("button", { name }).click();
  await expect(page.locator(".program-error")).toHaveCount(0);
}
const architectures = ["arm", "arm64", "x86", "x86_64"] as const;
for (const architecture of architectures) {
  test(`${architecture}: project choice, native registers, nested execution, export and reload`, async ({
    page,
  }, info) => {
    const mobile = info.project.name === "mobile",
      target = architectureInfo(architecture);
    await load(page);
    await newProject(page, architecture);
    await expect(
      page.getByLabel("Projektarchitektur", { exact: true }),
    ).toHaveText(architecture === "arm64" ? "AArch64" : architecture);
    await expect(palette(page).locator(":scope > .value_register")).toHaveCount(
      target.registers.length,
    );
    await values(page, mobile);
    await expect(page.locator(".register-row")).toHaveCount(
      target.registers.length,
    );
    await expect(registerValue(page, "H")).toHaveText("4096");
    const registers = page.getByRole("list", {
      name: "Registerwerte",
      exact: true,
    });
    expect(
      await registers.evaluate(
        (element) => element.scrollHeight <= element.clientHeight,
      ),
    ).toBe(true);
    await expect(page.locator(".register-row").first()).toBeInViewport();
    await expect(page.locator(".register-row").last()).toBeInViewport();
    await closeValues(page, mobile);
    await example(page, /Mit Werten rechnen/);
    await values(page, mobile);
    await fast(page);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(registerValue(page, "C")).toHaveText("48");
    await expect(registerValue(page, "A")).toHaveText("12");
    await expect(registerValue(page, "B")).toHaveText("4");
    await expect(page.locator(".execution-status")).toContainText("Beendet");
    await closeValues(page, mobile);
    await page.getByRole("tab", { name: "Assembly", exact: true }).click();
    const source = await page.locator(".source-code").innerText();
    expect(source).toContain(
      architecture.startsWith("arm")
        ? architecture === "arm"
          ? ".arch armv7-a"
          : ".arch armv8-a"
        : `bits ${target.bits}`,
    );
    expect(source).toContain(target.registers[0].native);
    if (architecture === "arm64") {
      expect(source).toContain("scratchsembly · AArch64 · 64-bit");
      await expect(page.locator(".runtime-panel .architecture")).toHaveText(
        "AArch64 · 64-bit",
      );
    }
    if (architecture !== "x86") expect(source).not.toContain("EAX");
    await page.getByRole("button", { name: "Datei", exact: true }).click();
    const pending = page.waitForEvent("download");
    await page
      .getByRole("menuitem", {
        name: "Auf dem Computer speichern",
        exact: true,
      })
      .click();
    const download = await pending,
      path = info.outputPath(`${architecture}.scratchsembly.json`);
    await download.saveAs(path);
    expect(JSON.parse(await readFile(path, "utf8")).architecture).toBe(
      architecture,
    );
    await expect(page.locator(".save-mark")).toHaveClass(/saved/);
    await page.reload();
    await expect(page.locator(".scratch-app")).toHaveAttribute(
      "data-architecture",
      architecture,
    );
    await expect(page.locator(".workspace-shell")).toHaveAttribute(
      "data-program-blocks",
      "3",
    );
    await newProject(page, architecture === "x86" ? "arm64" : "x86");
    await page.locator("input[type=file]").setInputFiles(path);
    await expect(page.locator(".scratch-app")).toHaveAttribute(
      "data-architecture",
      architecture,
    );
    await expect(page.locator(".workspace-shell")).toHaveAttribute(
      "data-program-blocks",
      "3",
    );
    await expect(page.locator(".program-error")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
  test(`${architecture}: stack slots use the project's word width and preserve live values across language changes`, async ({
    page,
  }, info) => {
    const mobile = info.project.name === "mobile",
      target = architectureInfo(architecture);
    await load(page);
    await newProject(page, architecture);
    await example(page, /Ein Umweg über den Stack/);
    await values(page, mobile);
    const step = page.getByRole("button", { name: "Schritt", exact: true });
    for (let i = 0; i < 4; i++) await step.click();
    await expect(page.locator(".step-counter b")).toHaveText("4");
    await expect(registerValue(page, "H")).toHaveText(
      String(4096 - target.stackBytes * 2),
    );
    await expect(page.locator(".stack-row")).toHaveCount(2);
    await expect(page.locator(".stack-row > code:last-child")).toHaveText([
      "7",
      "42",
    ]);
    await page.getByLabel("Sprache").selectOption("asm");
    await expect(registerValue(page, "A")).toHaveText("42");
    await expect(registerValue(page, "H")).toHaveText(
      String(4096 - target.stackBytes * 2),
    );
    await expect(page.locator(".step-counter b")).toHaveText("4");
    await expect(page.locator(".scratch-app")).toHaveAttribute(
      "data-architecture",
      architecture,
    );
    await page.getByRole("button", { name: "Step", exact: true }).click();
    await page.getByRole("button", { name: "Step", exact: true }).click();
    await expect(registerValue(page, "A")).toHaveText("7");
    await expect(registerValue(page, "B")).toHaveText("42");
    await expect(registerValue(page, "H")).toHaveText("4096");
  });
}
for (const architecture of ["arm64", "x86_64"] as const)
  test(`${architecture}: edits and runs exact 64-bit constants above the JS safe-integer limit`, async ({
    page,
  }, info) => {
    const mobile = info.project.name === "mobile",
      literal = "9223372036854775807";
    await load(page);
    await newProject(page, architecture);
    await example(page, /Ein Umweg über den Stack/);
    const id = await main(page)
      .locator(".value_number .blocklyText")
      .filter({ hasText: /^42$/ })
      .locator("xpath=..")
      .getAttribute("id");
    const field = page.locator(`[id=${JSON.stringify(id)}] > .blocklyText`);
    if (mobile) {
      page.once("dialog", (dialog) => dialog.accept(literal));
      await field.click();
    } else {
      await field.click();
      await page.locator(".blocklyHtmlInput").fill(literal);
      await page.locator(".blocklyHtmlInput").press("Enter");
    }
    await expect(field).toHaveText(literal);
    await expect(page.locator(".program-error")).toHaveCount(0);
    await values(page, mobile);
    await page.getByRole("button", { name: "Schritt", exact: true }).click();
    await expect(registerValue(page, "A")).toHaveText(literal);
    await fast(page);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(registerValue(page, "B")).toHaveText(literal);
    await expect(page.locator(".execution-status")).toContainText("Beendet");
    await page.getByLabel("Zahlenformat", { exact: true }).selectOption("hex");
    await expect(registerValue(page, "B")).toHaveText("0x7FFFFFFFFFFFFFFF");
    await expect(registerValue(page, "H")).toHaveText("0x0000000000001000");
  });

for (const architecture of ["x86_64", "arm64"] as const)
  test(`${architecture}: every full-width register value stays visible without register scrolling`, async ({
    page,
  }, info) => {
    const mobile = info.project.name === "mobile",
      target = architectureInfo(architecture);
    await load(page);
    const statements = target.registers
      .filter((reg) => reg.role !== "stack" && reg.role !== "pc")
      .map((reg) => mov(reg.native, literal("-9223372036854775808")));
    for (let i = 0; i < 2; i++)
      statements.push({
        type: "asm_push",
        inputs: { VALUE: { shadow: literal(42) } },
      });
    await page.locator("input[type=file]").setInputFiles({
      name: "registers.scratchsembly.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          name: "All registers",
          architecture,
          workspace: {
            blocks: {
              languageVersion: 0,
              blocks: [entry(statements, mobile)],
            },
          },
        }),
      ),
    });
    await expect(page.locator(".scratch-app")).toHaveAttribute(
      "data-architecture",
      architecture,
    );
    await values(page, mobile);
    await fast(page);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.locator(".execution-status")).toContainText("Beendet");
    await expect(page.locator(".stack-row")).toHaveCount(2);
    const assertLayout = async () => {
      const layout = await page
        .locator(".register-values")
        .evaluate((element) => ({
          noScroll:
            element.scrollHeight <= element.clientHeight &&
            element.scrollWidth <= element.clientWidth,
          allVisible: [...element.querySelectorAll(".register-row")].every(
            (row) => {
              const bounds = row.getBoundingClientRect();
              return (
                bounds.top >= 0 &&
                bounds.bottom <= innerHeight &&
                bounds.left >= 0 &&
                bounds.right <= innerWidth
              );
            },
          ),
          noTruncatedValues: [...element.querySelectorAll("code")].every(
            (value) => value.scrollWidth <= value.clientWidth,
          ),
        }));
      expect(layout).toEqual({
        noScroll: true,
        allVisible: true,
        noTruncatedValues: true,
      });
      const stack = (await page.locator(".stack-panel").boundingBox())!;
      expect(stack.height).toBeGreaterThanOrEqual(80);
      expect(stack.y + stack.height).toBeLessThanOrEqual(
        await page.evaluate(() => innerHeight),
      );
    };
    await assertLayout();
    await page.getByLabel("Zahlenformat", { exact: true }).selectOption("hex");
    await assertLayout();
    await page.setViewportSize(
      mobile ? { width: 360, height: 600 } : { width: 1100, height: 720 },
    );
    await assertLayout();
    await page.getByLabel("Zahlenformat", { exact: true }).selectOption("dec");
    await assertLayout();
  });

test("canceling an architecture choice leaves the existing project unchanged", async ({
  page,
}) => {
  await load(page);
  await page.getByRole("button", { name: "Datei", exact: true }).click();
  await page.getByRole("menuitem", { name: "Neu", exact: true }).click();
  await page.locator('input[name="architecture"][value="arm64"]').check();
  await page
    .getByRole("button", { name: "Dialog schließen", exact: true })
    .click();
  await expect(page.locator(".scratch-app")).toHaveAttribute(
    "data-architecture",
    "x86",
  );
  await expect(page.locator(".workspace-shell")).toHaveAttribute(
    "data-program-blocks",
    "8",
  );
});

test("architecture-mismatched registers and out-of-range literals are rejected without losing the project", async ({
  page,
}) => {
  await load(page);
  await newProject(page, "arm64");
  await example(page, /Mit Werten rechnen/);
  const title = await page
    .getByLabel("Projektname", { exact: true })
    .inputValue();
  for (const [register, value] of [
    ["EAX", "1"],
    ["X0", "18446744073709551616"],
  ]) {
    const project = {
      version: 1,
      architecture: "arm64",
      name: "Invalid",
      workspace: {
        blocks: {
          languageVersion: 0,
          blocks: [
            {
              type: "asm_start",
              next: {
                block: {
                  type: "asm_mov",
                  fields: { A: register },
                  inputs: {
                    VALUE: {
                      shadow: { type: "value_number", fields: { NUM: value } },
                    },
                  },
                },
              },
            },
          ],
        },
      },
    };
    await page.locator("input[type=file]").setInputFiles({
      name: "invalid.scratchsembly.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await expect(page.locator(".toast")).toContainText(
      "keine gültige Projektdatei",
    );
    await expect(page.locator(".scratch-app")).toHaveAttribute(
      "data-architecture",
      "arm64",
    );
    await expect(page.getByLabel("Projektname", { exact: true })).toHaveValue(
      title,
    );
    await expect(page.locator(".workspace-shell")).toHaveAttribute(
      "data-program-blocks",
      "3",
    );
  }
});

test("legacy files remain x86 and unsupported architectures never replace a project", async ({
  page,
}) => {
  await load(page);
  await newProject(page, "arm64");
  const legacy = {
    version: 1,
    name: "Old x86",
    workspace: {
      blocks: {
        languageVersion: 0,
        blocks: [{ type: "asm_mov", fields: { A: "EAX", B: "5" } }],
      },
    },
  };
  await page.locator("input[type=file]").setInputFiles({
    name: "old.playground.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(page.locator(".scratch-app")).toHaveAttribute(
    "data-architecture",
    "x86",
  );
  await expect(page.locator(".workspace-shell")).toHaveAttribute(
    "data-program-blocks",
    "1",
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...legacy, architecture: "mips" })),
  });
  await expect(page.locator(".toast")).toContainText(
    "keine gültige Projektdatei",
  );
  await expect(page.locator(".scratch-app")).toHaveAttribute(
    "data-architecture",
    "x86",
  );
  await expect(page.getByLabel("Projektname", { exact: true })).toHaveValue(
    "Old x86",
  );
  await expect(page.locator(".workspace-shell")).toHaveAttribute(
    "data-program-blocks",
    "1",
  );
});
