import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const REPORT = readFileSync("src/test/fixtures/report-2026-11-25.md", "utf8");
const ROUTES = ["", "journal/", "import/", "nutrition/", "activity/", "workouts/", "body/", "progress/", "calendar/", "reports/", "goals/", "profile/", "settings/", "data/"];

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    if (/due to access control checks/.test(e.message)) return; // see note below
    errors.push(e.message);
  });
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    // WebKit reports link prefetches cancelled by navigation as "access control" errors.
    // Every such URL was verified to serve 200; they are not application errors.
    if (/due to access control checks/.test(m.text())) return;
    errors.push(m.text());
  });
  return errors;
}

async function importReport(page: Page, text = REPORT) {
  await page.goto("import/");
  await page.getByLabel("Report text").fill(text);
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("Ready to import")).toBeVisible();
}

test("every page renders without errors and nested routes survive a refresh", async ({ page }) => {
  const errors = trackErrors(page);
  for (const r of ROUTES) {
    await page.goto(r);
    await expect(page.locator("h1").first()).toBeVisible();
    await page.reload();
    await expect(page.locator("h1").first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("paste, preview, import; data persists after reload; duplicates are detected", async ({ page }) => {
  const errors = trackErrors(page);
  await importReport(page);
  await expect(page.getByText("Food entries (6)")).toBeVisible();
  await expect(page.getByRole("cell", { name: "1,757" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Import report" }).click();
  await expect(page.getByText(/6 food entries added/)).toBeVisible();

  await page.getByRole("button", { name: "View in Food Journal" }).click();
  await page.waitForURL(/\/journal\/$/);
  await page.reload();
  await expect(page.getByText("Masala Oats with Boiled Eggs").first()).toBeVisible();
  await expect(page.getByText("Chicken Tikka with Mixed Veg Sabzi").first()).toBeVisible();

  // Same report again → duplicate panel, import blocked until a choice is made.
  await importReport(page);
  await expect(page.getByText("This exact report was already imported")).toBeVisible();
  await expect(page.getByRole("button", { name: "Import report" })).toBeDisabled();
  await page.getByRole("radio", { name: /Merge/ }).click();
  await page.getByRole("button", { name: "Import report" }).click();
  await expect(page.getByText(/0 food entries added, 6 already present/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("manual food entry and weight logging update the overview", async ({ page }) => {
  await page.goto("journal/");
  await page.getByRole("button", { name: "Add entry" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Food name").fill("Greek yogurt");
  await dialog.getByLabel("Calories (kcal)").fill("120");
  await dialog.getByLabel("Protein (g)").fill("15");
  await dialog.getByRole("button", { name: "Add entry" }).click();
  await expect(page.getByText("Entry added")).toBeVisible();
  await page.goto("");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("120");
  await expect(page.getByText("Greek yogurt")).toBeVisible();

  await page.goto("body/");
  await page.getByRole("button", { name: "Log weight" }).first().click();
  await page.getByRole("dialog").getByLabel("Weight (kg)").fill("89.4");
  await page.getByRole("dialog").getByRole("button", { name: "Log weight" }).click();
  await expect(page.getByText("Weight logged")).toBeVisible();
  await page.reload();
  await expect(page.getByText("89.4 kg").first()).toBeVisible();
});

test("invalid reports are blocked with an explanation", async ({ page }) => {
  await page.goto("import/");
  await page.getByLabel("Report text").fill("Hello, this is not a report");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText(/must be fixed before importing/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Import report" })).toBeDisabled();
});

test("works offline after the service worker has cached the app", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop" && info.project.name !== "webkit-desktop");
  await page.goto("");
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  await page.reload(); // now controlled by the SW
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.goto("journal/");
  await expect(page.locator("h1").first()).toHaveText("Food Journal");
  await page.goto("body/");
  await expect(page.locator("h1").first()).toHaveText("Body Analytics");
  await context.setOffline(false);
});

test("no horizontal overflow on mobile, with and without data", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile" && info.project.name !== "iphone");
  const check = async () => {
  for (const r of ROUTES) {
    await page.goto(r);
    await page.waitForTimeout(300);
    // Compare with the device width: Chrome widens innerWidth itself when content overflows.
    const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, window.innerWidth) - screen.width);
    expect(overflow, `overflow on /${r}`).toBeLessThanOrEqual(1);
  }
  };
  await check();
  await importReport(page);
  await page.getByRole("button", { name: "Import report" }).click();
  await expect(page.getByText(/6 food entries added/)).toBeVisible();
  await check();
});

test("charts offer an accessible table view", async ({ page }) => {
  await importReport(page);
  await page.getByRole("button", { name: "Import report" }).click();
  await expect(page.getByText(/6 food entries added/)).toBeVisible();
  await page.goto("");
  const toggle = page.getByRole("radiogroup", { name: /Cumulative calories.*view as/ });
  await toggle.getByRole("radio", { name: "Table" }).click();
  const table = page.getByRole("table", { name: /Cumulative calories/ });
  await expect(table.getByRole("row")).toHaveCount(7); // header + 6 meals
  await expect(table).toContainText("1,757 kcal");
});

test("theme choice persists and Settings explains installation", async ({ page }) => {
  await page.goto("settings/");
  await page.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.getByRole("heading", { name: "Install on this device" })).toBeVisible();
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
