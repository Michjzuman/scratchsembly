import { expect, test } from "@playwright/test";
import { fast, load, registerValue, values } from "./helpers";

test("production assets and worker load from the repository subpath without root-relative requests", async ({
  page,
}) => {
  const errors: string[] = [],
    escaped: string[] = [],
    workers: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.origin === "http://127.0.0.1:4173" &&
      !url.pathname.startsWith("/scratchsembly/")
    )
      escaped.push(url.pathname);
  });
  page.on("worker", (worker) => workers.push(worker.url()));
  await load(page);
  await expect(page).toHaveURL("http://127.0.0.1:4173/scratchsembly/");
  expect(
    await page
      .locator('link[rel="icon"]')
      .evaluate(
        (link) =>
          new URL(link.getAttribute("href")!, document.baseURI).pathname,
      ),
  ).toBe("/scratchsembly/favicon.svg");
  const module = await page
    .locator('script[type="module"][src]')
    .getAttribute("src");
  expect(new URL(module!, page.url()).pathname).toMatch(
    /^\/scratchsembly\/assets\/.+\.js$/,
  );
  await expect
    .poll(() => workers)
    .toEqual([
      expect.stringMatching(/\/scratchsembly\/assets\/runner\.worker-.+\.js$/),
    ]);
  for (const file of [
    "favicon.svg",
    "blockly-media/dropdown-arrow.svg",
    "blockly-media/handdelete.cur",
    "blockly-media/handopen.cur",
  ]) {
    const response = await page.request.get(new URL(file, page.url()).href);
    expect(response.ok(), file).toBe(true);
  }
  const arrows = await page
    .locator(".blocklyDropdownField > image")
    .evaluateAll((images) =>
      images.map((image) => (image as SVGImageElement).href.baseVal),
    );
  expect(arrows.length).toBeGreaterThan(0);
  for (const arrow of arrows)
    if (arrow && !arrow.startsWith("data:"))
      expect(new URL(arrow, page.url()).pathname).toMatch(
        /^\/scratchsembly\/blockly-media\//,
      );
  expect(escaped).toEqual([]);
  expect(errors).toEqual([]);
});

for (const architecture of ["arm", "arm64", "x86", "x86_64"] as const)
  test(`${architecture}: production worker runs native stack instructions under the Pages path`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await load(page);
    await page.getByRole("button", { name: "File", exact: true }).click();
    await page.getByRole("menuitem", { name: "New", exact: true }).click();
    await page
      .locator(`input[name="architecture"][value="${architecture}"]`)
      .check();
    await page
      .getByRole("button", { name: "Start fresh", exact: true })
      .click();
    await expect(page.locator(".scratch-app")).toHaveAttribute(
      "data-architecture",
      architecture,
    );
    await page.getByRole("button", { name: "Examples", exact: true }).click();
    await page
      .getByRole("button", { name: /A trip through the stack/ })
      .click();
    await expect(page.locator(".workspace-shell")).toHaveAttribute(
      "data-program-blocks",
      "6",
    );
    await values(page, info.project.name === "mobile");
    await fast(page);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.locator(".execution-status")).toContainText("Finished");
    await expect(registerValue(page, "A")).toHaveText("7");
    await expect(registerValue(page, "B")).toHaveText("42");
    await expect(registerValue(page, "H")).toHaveText("4096");
    expect(errors).toEqual([]);
  });
