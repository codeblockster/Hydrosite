import { expect, test } from "@playwright/test";

const navItems = [
  { label: "Overview", icon: "overview" },
  { label: "Candidate sites", icon: "sites" },
  { label: "Analysis runs", icon: "analysis" },
  { label: "Settings", icon: "settings" },
];

test.beforeEach(async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("desktop navigation and metrics use the shared glyph system", async ({ page }, testInfo) => {
  const sidebar = page.locator(".sidebar");
  for (const { label, icon } of navItems) {
    const button = sidebar.getByRole("button", { name: label, exact: true });
    await expect(button).toBeVisible();
    await expect(button.locator(`svg[data-icon="${icon}"]`)).toBeVisible();
    await expect(button.locator(".nav-icon")).toHaveCSS("width", "32px");
  }
  await expect(page.locator(".mobile-bottom-nav")).toBeHidden();
  const metricIcons = page.locator(".metric-icon > .hydro-icon");
  await expect(metricIcons).toHaveCount(4);
  const actual = await metricIcons.evaluateAll((icons) => icons.map((icon) => icon.getAttribute("data-icon")));
  expect(actual).toEqual(["sites", "turbine", "feasibility", "environment"]);
  await page.screenshot({ path: testInfo.outputPath("desktop.png"), fullPage: true });
});

test("site tabs and every data-source family retain their labels and glyphs", async ({ page }) => {
  await page.locator(".sidebar").getByRole("button", { name: "Candidate sites", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Candidate sites", exact: true })).toBeVisible();
  await page.locator(".data-table tbody tr").first().click();
  const detail = page.getByRole("dialog");
  for (const [label, icon] of [["Overview", "overview"], ["DEM", "terrain"], ["River", "river"], ["Report", "report"]]) {
    const tab = detail.getByRole("tab", { name: label, exact: true });
    await expect(tab.locator(`svg[data-icon="${icon}"]`)).toBeVisible();
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
  }
  await detail.getByRole("button", { name: "Close site profile" }).click();
  await page.locator(".sidebar").getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Data sources", exact: true }).click();
  await expect(page.locator(".source-card")).toHaveCount(12);
  for (const [category, icon] of [["Elevation", "terrain"], ["Hydrology", "water"], ["Climate", "climate"], ["Land cover", "leaf"], ["Environment", "environment"], ["Infrastructure", "transmission"]]) {
    await expect(page.locator(`.source-card [data-category="${category}"] svg[data-icon="${icon}"]`).first()).toBeVisible();
  }
});

test("compact and mobile navigation never lose their icon or accessible name", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 960, height: 900 });
  for (const { label, icon } of navItems) {
    const button = page.locator(".sidebar").getByRole("button", { name: label, exact: true });
    await expect(button.locator(".nav-label")).toBeHidden();
    await expect(button.locator(`svg[data-icon="${icon}"]`)).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath("compact.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar")).toBeHidden();
  const mobile = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(mobile).toBeVisible();
  for (const { label, icon } of navItems) {
    const button = mobile.getByRole("button", { name: label, exact: true });
    await expect(button.locator(`svg[data-icon="${icon}"]`)).toBeVisible();
    const dimensions = await button.boundingBox();
    expect(dimensions?.height).toBeGreaterThanOrEqual(44);
  }
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(391);
  const unclippedMetrics = await page.locator(".metric-value-row").evaluateAll((rows) =>
    rows.every((row) => row.scrollWidth <= row.clientWidth + 1),
  );
  expect(unclippedMetrics).toBe(true);
  const railWidth = await page.locator(".dashboard-side").evaluate((node) => node.getBoundingClientRect().width);
  const rankedWidth = await page.locator(".dashboard-side .side-panel").last().evaluate((node) => node.getBoundingClientRect().width);
  expect(Math.abs(railWidth - rankedWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("mobile.png"), fullPage: true });
  await mobile.getByRole("button", { name: "Analysis runs", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Analysis runs", exact: true })).toBeVisible();
});

test("technical icons inherit the dark theme without losing contrast", async ({ page }, testInfo) => {
  await page.locator(".sidebar").getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("radio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator(".sidebar").getByRole("button", { name: "Overview", exact: true }).click();
  for (const icon of ["sites", "turbine", "feasibility", "environment"]) {
    await expect(page.locator(`.metric-icon svg[data-icon="${icon}"]`)).toBeVisible();
  }
  const tokens = await page.locator(".metric-icon").evaluateAll((nodes) => ({
    background: getComputedStyle(document.documentElement).getPropertyValue("--surface-solid").trim(),
    canvas: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
    foregrounds: nodes.map((node) => getComputedStyle(node).color),
  }));
  expect(tokens.canvas).toBe("#111213");
  const [red, green, blue] = tokens.canvas.slice(1).match(/.{2}/g)!.map((value) => Number.parseInt(value, 16));
  expect(Math.max(red, green, blue) - Math.min(red, green, blue)).toBeLessThanOrEqual(3);
  for (const color of tokens.foregrounds) {
    expect(contrastRatio(color, tokens.background)).toBeGreaterThanOrEqual(3);
  }
  await page.locator(".topbar-profile").click();
  const darkAuth = await page.locator(".auth-story").evaluate((node) => getComputedStyle(node).backgroundImage);
  expect(darkAuth).not.toContain("7, 40, 58");
  await page.getByRole("button", { name: "Close sign in" }).click();
  await page.screenshot({ path: testInfo.outputPath("dark.png"), fullPage: true });
});

test("sign-in role icons match selected credentials and remain decorative", async ({ page }, testInfo) => {
  await page.locator(".topbar-profile").click();
  const dialog = page.getByRole("dialog", { name: "Sign in to HydroSite", exact: true });
  await expect(dialog).toBeVisible();
  for (const [role, icon] of [["Admin", "shield"], ["Planner", "planner"], ["Viewer", "viewer"]]) {
    const button = dialog.locator(".demo-role-button").filter({ hasText: role });
    await expect(button.locator(`svg[data-icon="${icon}"]`)).toHaveAttribute("aria-hidden", "true");
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  await expect(dialog.getByLabel("Email address")).toHaveValue("investor@hydrosite.np");
  await page.screenshot({ path: testInfo.outputPath("sign-in.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Close sign in" }).click();
  await expect(dialog).toBeHidden();
});

function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const channels = color.startsWith("#")
      ? [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16))
      : (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const linear = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
