import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const api = "/api/v2";

async function session(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${api}/auth/login`, { data: { email, password } });
  expect(response.ok(), `login ${email} failed: ${response.status()}`).toBeTruthy();
  return (await response.json()) as { accessToken: string; refreshToken: string };
}

async function signInAs(page: Page, request: APIRequestContext, email: string, password: string) {
  const tokens = await session(request, email, password);
  await page.addInitScript((value: { accessToken: string; refreshToken: string }) => {
    sessionStorage.setItem("hydrosite.access-token", value.accessToken);
    sessionStorage.setItem("hydrosite.refresh-token", value.refreshToken);
  }, tokens);
  return tokens.accessToken;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
});

test("sites table density, saved views, and CSV import complete end to end", async ({ page, request }, testInfo) => {
  const accessToken = await signInAs(page, request, "planner@hydrosite.np", "planner123");
  await page.reload({ waitUntil: "domcontentloaded" });

  await page.locator(".sidebar").getByRole("button", { name: "Candidate sites", exact: true }).click();
  await expect(page.locator(".data-table")).toBeVisible();
  const comfortableHeight = await page.locator(".data-table tbody td").first().evaluate((node) => node.getBoundingClientRect().height);
  await page.getByRole("button", { name: "Compact", exact: true }).click();
  await expect(page.locator(".data-table.table-compact")).toBeVisible();
  const compactHeight = await page.locator(".data-table tbody td").first().evaluate((node) => node.getBoundingClientRect().height);
  expect(compactHeight).toBeLessThan(comfortableHeight);
  await page.screenshot({ path: testInfo.outputPath("sites-compact.png"), fullPage: true });

  await page.getByRole("button", { name: "Save view", exact: true }).click();
  const nameInput = page.getByLabel("Filter view name");
  await expect(nameInput).toBeVisible();
  await nameInput.fill("High potential");
  await nameInput.press("Enter");
  const chip = page.locator(".saved-view-chip").first();
  await expect(chip).toContainText("High potential");
  await chip.getByLabel("Remove High potential").click();
  await expect(page.locator(".saved-view-chip")).toHaveCount(0);

  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Import candidate sites", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Insert sample rows", exact: true }).click();
  await expect(dialog.getByLabel("Candidate sites CSV content")).toContainText("Imported Alpha");
  await dialog.getByRole("button", { name: "Import sites", exact: true }).click();
  await expect(dialog.locator(".import-result.ok")).toContainText("2 rows imported");
  await page.getByText("2 sites imported").first().waitFor({ timeout: 15000 });
  await page.keyboard.press("Escape");

  const created = await request.get(`${api}/sites?q=Imported&pageSize=10`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const rows = (await created.json()).items as Array<{ id: number; name: string }>;
  expect(rows.length).toBeGreaterThanOrEqual(2);
  const cleanup = await Promise.all(rows.map((row) => request.delete(`${api}/sites/${row.id}`, { headers: { Authorization: `Bearer ${accessToken}` } })));
  expect(cleanup.every((response) => response.ok())).toBeTruthy();
});

test("report tab saves and removes deterministic snapshots", async ({ page, request }) => {
  await signInAs(page, request, "planner@hydrosite.np", "planner123");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".sidebar").getByRole("button", { name: "Candidate sites", exact: true }).click();
  await page.locator(".data-table tbody tr").first().click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("tab", { name: "Report", exact: true }).click();
  await expect(drawer.getByText("Snapshot history")).toBeVisible();
  await drawer.getByRole("button", { name: "Save snapshot", exact: true }).click();
  await expect(drawer.locator(".snapshot-row")).toHaveCount(1, { timeout: 15000 });
  await expect(drawer.locator(".snapshot-row")).toContainText("feasibility snapshot");
  await drawer.locator(".snapshot-row").getByRole("button", { name: "Delete snapshot" }).click();
  await expect(drawer.locator(".snapshot-row")).toHaveCount(0, { timeout: 15000 });
  await expect(drawer.locator(".snapshot-empty")).toBeVisible();
});

test("a completed analysis is promoted from a modal into a new candidate site", async ({ page, request }) => {
  const accessToken = await signInAs(page, request, "planner@hydrosite.np", "planner123");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".sidebar").getByRole("button", { name: "Analysis runs", exact: true }).click();

  const card = page.locator(".analysis-job-card", { hasText: "Langtang tributary screening" }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.click();
  const promote = page.getByRole("button", { name: "Promote to candidate site", exact: true });
  await expect(promote).toBeVisible();
  await promote.click();

  const dialog = page.getByRole("dialog", { name: "Promote analysis to a candidate", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Source analysis")).toBeVisible();
  await dialog.getByLabel("Candidate name").fill("Modal promoted reach");
  await dialog.getByLabel("District").fill("Rasuwa");
  await dialog.getByRole("button", { name: "Create candidate", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Candidate sites", exact: true })).toBeVisible({ timeout: 15000 });
  const row = page.locator(".data-table tbody tr", { hasText: "Modal promoted reach" }).first();
  await expect(row).toBeVisible({ timeout: 15000 });

  const list = await request.get(`${api}/sites?q=Modal%20promoted&pageSize=5`, { headers: { Authorization: `Bearer ${accessToken}` } });
  for (const site of (await list.json()).items as Array<{ id: number }>) {
    await request.delete(`${api}/sites/${site.id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  }
});

test("team directory is admin-only in the settings surface", async ({ page, request }, testInfo) => {
  await signInAs(page, request, "planner@hydrosite.np", "planner123");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".sidebar").getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Team & access" })).toHaveCount(0);

  await signInAs(page, request, "admin@hydrosite.np", "admin123");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".sidebar").getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Team & access", exact: true }).click();
  const rows = page.locator(".settings-card .data-table tbody tr");
  await expect(rows).toHaveCount(3, { timeout: 15000 });
  await expect(rows.filter({ hasText: "admin@hydrosite.np" })).toContainText(/admin/i);
  await page.screenshot({ path: testInfo.outputPath("team-access.png"), fullPage: true });
});
