import { expect, expectAccessible, signIn, test } from "./fixtures";

test("redirects to the login page and back after signing in", async ({ page }) => {
  await page.goto("/hr/employees");
  await expect(page).toHaveURL(/\/login/);
  await page.evaluate(() => localStorage.setItem("kompass.lang", "en"));
  await page.reload();
  await page.getByLabel("Username").fill("jonas.weber");
  await page.getByLabel("Password").fill("kompass");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/hr\/employees/);
  await expect(page.getByRole("heading", { name: "Employees" })).toBeVisible();
});

test("shows a clear error for wrong credentials", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => localStorage.setItem("kompass.lang", "en"));
  await page.reload();
  await page.getByLabel("Username").fill("anna.schmidt");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Username or password is incorrect");
});

test("login page is accessible", async ({ page }) => {
  await page.goto("/login");
  await expectAccessible(page);
});

test("signs out", async ({ page }) => {
  await signIn(page, "tim.hoffmann");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("switches between German and English", async ({ page }) => {
  await signIn(page, "anna.schmidt");
  await page.getByRole("button", { name: "de", exact: true }).click();
  await expect(page.getByRole("link", { name: "Mitarbeitende" })).toBeVisible();
  await page.getByRole("button", { name: "en", exact: true }).click();
  await expect(page.getByRole("link", { name: "Employees" })).toBeVisible();
});
