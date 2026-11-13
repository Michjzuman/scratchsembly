import { expect, test } from "@playwright/test";
import { architectureInfo } from "../src/architectures";
import {
  chain,
  closeValues,
  fast,
  load,
  main,
  mov,
  registerValue,
  start,
  values,
} from "./helpers";

for (const architecture of ["arm", "arm64", "x86", "x86_64"] as const)
  test(`${architecture}: parked and unused broken code is saved but only start-reachable code runs`, async ({
    page,
  }, info) => {
    const mobile = info.project.name === "mobile";
    const [a, b] = architectureInfo(architecture).registers.map(
      (reg) => reg.native,
    );
    await load(page);
    await page.locator("input[type=file]").setInputFiles({
      name: "parked.scratchsembly.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          architecture,
          name: "Parked code",
          workspace: {
            scratchsemblyWorkspaceVersion: 1,
            blocks: {
              languageVersion: 0,
              blocks: [
                start(
                  [mov(a, 5), { type: "asm_call", fields: { A: "helper" } }],
                  mobile,
                ),
                {
                  type: "asm_label",
                  x: mobile ? 45 : 380,
                  y: 220,
                  fields: { A: "helper" },
                  next: { block: chain([mov(b, 7), { type: "asm_ret" }]) },
                },
                {
                  type: "asm_label",
                  x: 250,
                  y: 700,
                  fields: { A: "unused" },
                  next: {
                    block: { type: "asm_jmp", fields: { A: "missing" } },
                  },
                },
                { ...mov(a, 99), x: mobile ? 45 : 110, y: 440 },
                { type: "asm_mov", x: 280, y: 650, fields: { A: b } },
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
      "5",
    );
    await expect(page.locator(".program-error")).toHaveCount(0);
    await values(page, mobile);
    await fast(page);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.locator(".execution-status")).toContainText("Finished");
    await expect(registerValue(page, "A")).toHaveText("5");
    await expect(registerValue(page, "B")).toHaveText("7");
    await closeValues(page, mobile);
    const parkedNumber = main(page).locator(
      ":scope > .asm_mov > .value_number > .blocklyEditableField > .blocklyText",
    );
    if (mobile) page.once("dialog", (dialog) => dialog.accept("100"));
    await parkedNumber.click();
    if (!mobile) {
      await page.locator(".blocklyHtmlInput").fill("100");
      await page.locator(".blocklyHtmlInput").press("Enter");
    }
    await expect(parkedNumber).toHaveText("100");
    await expect(page.locator(".execution-status")).toContainText("Finished");
    await expect(registerValue(page, "A")).toHaveText("5");
    await expect(page.locator(".save-mark")).toHaveClass(/saved/);
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("asmblocks.project.v1")!),
    );
    expect(saved.workspace.blocks.blocks).toHaveLength(5);
    expect(saved.workspace.scratchsemblyWorkspaceVersion).toBe(1);
    await page.reload();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(main(page).locator(":scope > .asm_mov")).toHaveCount(2);
    await expect(parkedNumber).toHaveText("100");
    await expect(page.locator(".program-error")).toHaveCount(0);
    await page.getByRole("tab", { name: "Assembly", exact: true }).click();
    await expect(page.locator(".source-code")).not.toContainText("unused");
    await expect(page.locator(".source-code")).not.toContainText("missing");
    await page.getByRole("tab", { name: "Blocks", exact: true }).click();
    if (!mobile) await page.getByLabel("Fit blocks", { exact: true }).click();
    await main(page).locator(".asm_call > .blocklyDropdownField").click();
    await page.getByRole("option", { name: "unused", exact: true }).click();
    await expect(page.locator(".program-error")).toContainText("missing");
    await values(page, mobile);
    await expect(
      page.getByRole("button", { name: "Start", exact: true }),
    ).toBeDisabled();
  });

test("a modern workspace without start stays parked across language switches and reload", async ({
  page,
}) => {
  await load(page);
  await page.locator("input[type=file]").setInputFiles({
    name: "no-start.scratchsembly.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        architecture: "x86",
        name: "No entry",
        workspace: {
          scratchsemblyWorkspaceVersion: 1,
          blocks: {
            languageVersion: 0,
            blocks: [{ ...mov("EAX", 99), x: 100, y: 100 }],
          },
        },
      }),
    ),
  });
  await expect(page.locator(".program-error")).toContainText(
    "Add a start block.",
  );
  await expect(main(page).locator(".asm_start")).toHaveCount(0);
  await expect(page.locator(".empty-workspace")).toHaveCount(0);
  await page.getByLabel("Language", { exact: true }).selectOption("asm");
  await expect(main(page).locator(".asm_start")).toHaveCount(0);
  await expect(page.locator(".save-mark")).toHaveClass(/saved/);
  await page.reload();
  await expect(main(page).locator(".asm_start")).toHaveCount(0);
  await expect(main(page).locator(".asm_mov")).toHaveCount(1);
  await expect(page.locator(".workspace-shell")).toHaveAttribute(
    "data-program-blocks",
    "0",
  );
  await expect(page.locator(".program-error")).toContainText(
    "Add a start block.",
  );
});
