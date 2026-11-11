import { expect, type Locator, type Page } from "@playwright/test";
export type Block = {
  type: string;
  id?: string;
  x?: number;
  y?: number;
  fields?: Record<string, string | number>;
  inputs?: Record<string, { shadow?: Block; block?: Block }>;
  next?: { block: Block };
};
export const main = (page: Page) =>
  page.locator("svg.blocklySvg > g > .blocklyBlockCanvas");
export const palette = (page: Page) =>
  page.locator(".blocklyToolboxFlyout > g > .blocklyBlockCanvas");
export const registerValue = (page: Page, name: string) =>
  page.locator(`[data-register="${name}"]`);
export const literal = (value: number | string): Block => ({
  type: "value_number",
  fields: { NUM: value },
});
export const registerBlock = (native: string): Block => ({
  type: "value_register",
  fields: { REG: native },
});
export function binary(type: string, left: Block, right: Block): Block {
  return { type, inputs: { LEFT: valueInput(left), RIGHT: valueInput(right) } };
}
export const valueInput = (value: Block) =>
  value.type === "value_number"
    ? { shadow: value }
    : { shadow: literal(0), block: value };
export const mov = (native: string, value: number | Block): Block => ({
  type: "asm_mov",
  fields: { A: native },
  inputs: {
    VALUE: valueInput(typeof value === "number" ? literal(value) : value),
  },
});
export function chain(blocks: Block[]) {
  for (let i = blocks.length - 2; i >= 0; i--)
    blocks[i].next = { block: blocks[i + 1] };
  return blocks[0];
}
export const start = (blocks: Block[], mobile = false): Block => ({
  type: "asm_start",
  x: mobile ? 45 : 110,
  y: 70,
  next: blocks.length ? { block: chain(blocks) } : undefined,
});
// Existing German-language journeys explicitly exercise the saved-language compatibility path.
export async function loadGermanUI(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem("assembly-playground.language"))
      localStorage.setItem("assembly-playground.language", "de");
  });
  await load(page);
}
export async function load(page: Page) {
  await page.goto("/");
  await expect(page.locator(".workspace-shell")).toHaveAttribute(
    "data-program-blocks",
    "8",
  );
}
export async function values(page: Page, mobile: boolean, language?: string) {
  const german =
    (language ?? (await page.locator("html").getAttribute("lang"))) === "de";
  if (mobile)
    await page
      .getByRole("button", {
        name: german ? "Werte" : "Values",
        exact: true,
      })
      .click();
}
export async function closeValues(
  page: Page,
  mobile: boolean,
  language?: string,
) {
  const german =
    (language ?? (await page.locator("html").getAttribute("lang"))) === "de";
  if (mobile)
    await page
      .getByLabel(german ? "Werte schließen" : "Close values", {
        exact: true,
      })
      .click();
}
export async function fast(page: Page) {
  await page.getByRole("slider").press("End");
}
export async function importRoots(page: Page, roots: Block[], count: number) {
  await page.locator("input[type=file]").setInputFiles({
    name: "test.playground.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        name: "Test",
        workspace: { blocks: { languageVersion: 0, blocks: roots } },
      }),
    ),
  });
  await expect(page.locator(".workspace-shell")).toHaveAttribute(
    "data-program-blocks",
    String(count),
  );
  await expect(page.locator(".program-error")).toHaveCount(0);
}
export async function drag(
  page: Page,
  source: Locator,
  x: number,
  y: number,
  release = true,
) {
  // Wait through scrolling and template refreshes before measuring the source.
  await source.hover();
  const initial = (await source.boundingBox())!;
  await source.hover({ position: { x: 6, y: initial.height / 2 } });
  const box = (await source.boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(box.x + 24, box.y + box.height / 2, { steps: 5 });
  await page.mouse.move(x + 6, y, { steps: 15 });
  await page.waitForTimeout(120);
  if (release) await page.mouse.up();
}
