import { expect, test } from "@playwright/test";
import { fast, registerValue, values } from "./helpers";

const projectKey = "asmblocks.project.v1";

test("first visit requires an architecture choice and never autosaves a placeholder", async ({
  page,
}) => {
  await page.goto("./");
  const chooser = page.getByRole("dialog", {
    name: "Choose an architecture",
    exact: true,
  });
  await expect(chooser).toBeVisible();
  await expect(chooser.getByRole("radio")).toHaveCount(4);
  const selected = chooser.getByRole("radio", {
    name: "x86 32-bit",
    exact: true,
  });
  await expect(selected).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    chooser.getByRole("button", { name: "Create project", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(selected).toBeFocused();
  await expect(
    chooser.getByRole("button", { name: "Close dialog", exact: true }),
  ).toHaveCount(0);
  await expect(
    chooser.getByRole("button", { name: "Download", exact: true }),
  ).toHaveCount(0);
  await page.waitForTimeout(650);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), projectKey),
  ).toBeNull();
  await page.keyboard.press("Escape");
  await expect(chooser).toBeVisible();
  await page.locator(".dialog-backdrop").click({ position: { x: 1, y: 1 } });
  await expect(chooser).toBeVisible();
  await chooser
    .getByRole("radio", { name: "AArch64 64-bit", exact: true })
    .check();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), projectKey),
  ).toBeNull();
  await page.reload();
  await expect(chooser).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), projectKey),
  ).toBeNull();
});

for (const architecture of ["arm", "arm64", "x86", "x86_64"] as const)
  test(`${architecture}: first choice creates the matching example and is restored without another chooser`, async ({
    page,
  }, info) => {
    await page.goto("./");
    const chooser = page.getByRole("dialog", {
      name: "Choose an architecture",
      exact: true,
    });
    await expect(chooser).toBeVisible();
    await chooser.locator(`input[value="${architecture}"]`).check();
    await chooser
      .getByRole("button", { name: "Create project", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".scratch-app")).toHaveAttribute(
      "data-architecture",
      architecture,
    );
    await expect(page.locator(".workspace-shell")).toHaveAttribute(
      "data-program-blocks",
      "8",
    );
    await expect(page.locator(".save-mark")).toHaveClass(/saved/);
    const saved = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      projectKey,
    );
    expect(saved.architecture).toBe(architecture);
    expect(saved.workspace.scratchsemblyWorkspaceVersion).toBe(1);
    await values(page, info.project.name === "mobile");
    await fast(page);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.locator(".execution-status")).toContainText("Finished");
    await expect(registerValue(page, "B")).toHaveText("5");
    await page.reload();
    await expect(page.locator(".scratch-app")).toHaveAttribute(
      "data-architecture",
      architecture,
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".workspace-shell")).toHaveAttribute(
      "data-program-blocks",
      "8",
    );
  });

test("existing legacy projects are restored without a first-visit chooser", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "asmblocks.project.v1",
      JSON.stringify({
        version: 1,
        name: "My existing project",
        workspace: {
          blocks: { languageVersion: 0, blocks: [{ type: "asm_start" }] },
        },
      }),
    ),
  );
  await page.goto("./");
  await expect(page.locator(".project-name")).toHaveValue(
    "My existing project",
  );
  await expect(page.locator(".scratch-app")).toHaveAttribute(
    "data-architecture",
    "x86",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
