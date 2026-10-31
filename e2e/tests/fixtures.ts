import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";

export async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.evaluate(() => localStorage.setItem("kompass.lang", "en"));
  await page.reload();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("kompass");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

/** Fails on WCAG 2.1 A/AA violations (colour contrast included). */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude(".recharts-wrapper").analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length}x) e.g. ${v.nodes[0]?.target.join(" ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

export const test = base;
export { expect };
