import { expect, expectAccessible, signIn, test } from "./fixtures";

test("service agent opens a ticket, comments and resolves it", async ({ page }) => {
  await signIn(page, "murat.yilmaz");
  await page.goto("/after-sales/tickets");
  await page.getByRole("button", { name: "New ticket" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Customer").fill("Hotel am Dom");
  await dialog.getByRole("option").first().click();
  await dialog.getByLabel("Subject").fill("Heat pump very loud at night");
  await dialog.getByLabel("Description").fill("Guests complained about humming from the outdoor unit.");
  await dialog.getByLabel("Priority").selectOption("URGENT");
  await page.getByRole("button", { name: "Create ticket" }).click();

  await expect(page.getByRole("heading", { name: "Heat pump very loud at night" })).toBeVisible();
  await expect(page.getByText(/due in (3|4) hours/)).toBeVisible();
  await page.getByLabel("Add a comment").fill("Technician booked for tomorrow 8:00.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Technician booked for tomorrow 8:00.")).toBeVisible();
  await page.getByLabel("Status").selectOption("RESOLVED");
  await expect(page.getByText("Ticket updated")).toBeVisible();
  await expect(page.getByText("met", { exact: true })).toBeVisible();
});

test("ticket list is accessible", async ({ page }) => {
  await signIn(page, "murat.yilmaz");
  await page.goto("/after-sales/tickets");
  await expect(page.getByRole("table", { name: "Service tickets" })).toBeVisible();
  await expectAccessible(page);
});

test("sales moves a deal and must give a reason for losing it", async ({ page }) => {
  await signIn(page, "lea.fischer");
  await page.goto("/sales/pipeline");
  const lead = page.getByRole("region", { name: "Lead" });
  const card = lead.getByRole("listitem").filter({ hasText: "Lea Fischer" }).first();
  const title = (await card.locator("p").first().textContent())!;
  await card.getByLabel(/Move to stage/).selectOption("LOST");
  await page.getByRole("dialog").getByLabel("Reason for losing").fill("Chose competitor");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Deal moved to Lost")).toBeVisible();
  await expect(page.getByRole("region", { name: "Lost" }).getByText(title).first()).toBeVisible();
});

test("accounting records a payment and the aging chart updates", async ({ page }) => {
  await signIn(page, "sophie.becker");
  await page.goto("/accounting/invoices?status=OVERDUE");
  const total = page.getByRole("heading", { name: /Receivables aging/ });
  const before = await total.textContent();
  await page.getByRole("button", { name: /Mark as paid/ }).first().click();
  await expect(page.getByText(/Payment recorded/)).toBeVisible();
  await expect(total).not.toHaveText(before!);
});

test("data pipelines show NiFi runs and rejected records", async ({ page }) => {
  await signIn(page, "anna.schmidt");
  await page.goto("/data/pipelines");
  await expect(page.getByText("erp-invoices").first()).toBeVisible();
  await expect(page.getByText("crm-customers").first()).toBeVisible();
  await expectAccessible(page);
});

test("employees can download their GDPR data export", async ({ page }) => {
  await signIn(page, "tim.hoffmann");
  await page.goto("/admin/privacy");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download data export" }).click();
  expect((await download).suggestedFilename()).toMatch(/kompass-data-export-\d+\.json/);
});
