import { expect, expectAccessible, signIn, test } from "./fixtures";

test("employee requests leave and the manager approves it live", async ({ browser }) => {
  const techCtx = await browser.newContext({ locale: "en-GB" });
  const managerCtx = await browser.newContext({ locale: "en-GB" });
  const tech = await techCtx.newPage();
  const manager = await managerCtx.newPage();

  await signIn(manager, "murat.yilmaz");
  await manager.goto("/hr/leave?view=approvals");
  await signIn(tech, "tim.hoffmann");
  await tech.goto("/hr/leave");

  const year = new Date().getFullYear() + 1;
  await tech.getByRole("button", { name: "Request leave" }).click();
  const dialog = tech.getByRole("dialog");
  await dialog.getByLabel("Type").selectOption("TRAINING");
  await dialog.getByLabel("From").fill(`${year}-03-02`);
  await dialog.getByLabel("To").fill(`${year}-03-06`);
  await expect(dialog.getByText("Working days")).toBeVisible();
  await tech.getByRole("button", { name: "Submit request" }).click();
  await expect(tech.getByText("Request submitted. Your manager has been notified.")).toBeVisible();

  // The manager's bell and approval list update over the WebSocket, without a reload.
  await expect(manager.getByRole("button", { name: /Notifications \(\d+\)/ })).toBeVisible();
  const row = manager.getByRole("row", { name: /Tim Hoffmann.*Training/ });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /Approve/ }).click();
  await expect(manager.getByText("Decision saved")).toBeVisible();

  await tech.reload();
  await expect(tech.getByRole("row", { name: /Training/ }).first().getByText("Approved")).toBeVisible();
  await techCtx.close();
  await managerCtx.close();
});

test("HR edits an employee and sees personnel data", async ({ page }) => {
  await signIn(page, "jonas.weber");
  await page.goto("/hr/employees");
  await page.getByLabel("Search …").fill("Hoffmann");
  await page.getByRole("link", { name: "Tim Hoffmann" }).click();
  await expect(page.getByText("Personnel data (HR only)")).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("dialog").getByLabel("Job title").fill("Lead Service Technician");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();
  await expect(page.getByText(/Lead Service Technician ·/)).toBeVisible();
});

test("employee directory hides personnel data from colleagues and is accessible", async ({ page }) => {
  await signIn(page, "lea.fischer");
  await page.goto("/hr/employees");
  await expect(page.getByRole("columnheader", { name: "Since" })).toHaveCount(0);
  await expectAccessible(page);
});
