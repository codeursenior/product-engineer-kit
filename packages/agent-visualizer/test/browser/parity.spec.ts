import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";

async function open(page: Page) {
  const session: { url: string; root: string; home: string } = JSON.parse(
    await fs.readFile(".local/browser/session.json", "utf8"),
  );
  await page.route("**/api/scan*", async (route) => {
    const response = await route.fetch();
    const text = (await response.text())
      .replaceAll(
        JSON.stringify(session.root).slice(1, -1),
        "C:\\\\fixtures\\\\project",
      )
      .replaceAll(
        JSON.stringify(session.home).slice(1, -1),
        "C:\\\\fixtures\\\\home",
      );
    const body = JSON.parse(text);
    body.scannedAt = "2026-01-01T12:00:00.000Z";
    await route.fulfill({ response, json: body });
  });
  await page.goto(session.url);
  await expect(page.locator("#project-name")).toHaveText("project");
}

for (const theme of ["light", "dark"]) {
  for (const view of ["Context", "Rules", "Skills", "MCP servers"]) {
    test(`${theme} ${view}`, async ({ page }) => {
      await open(page);
      if (theme === "dark")
        await page.getByRole("button", { name: "Switch to dark mode" }).click();
      await page
        .getByRole("navigation")
        .getByRole("button", { name: new RegExp(view) })
        .click();
      await expect(page.locator("#canvas")).not.toContainText("Mapping your");
      if (view === "Context")
        await expect(page.locator("svg.graph")).toBeVisible();
      await expect(page).toHaveScreenshot(
        `${theme}-${view.replaceAll(" ", "-")}.png`,
      );
    });
  }
}

for (const view of ["files", "preview", "edit"] as const) {
  test(view, async ({ page }) => {
    await open(page);
    await page.locator("#list-view").click();
    if (view !== "files") {
      await page
        .getByRole("button", { name: "architecture.md", exact: true })
        .click();
      await expect(page.locator("#detail pre")).toContainText("<script>");
    }
    if (view === "edit") {
      await page
        .getByRole("button", { name: "Edit file", exact: true })
        .click();
    }
    await expect(page).toHaveScreenshot(`${view}.png`);
  });
}

for (const width of [900, 640]) {
  test(`files at ${width}px`, async ({ page }) => {
    await open(page);
    await page.locator("#list-view").click();
    await page.setViewportSize({ width, height: 1000 });
    await expect(page).toHaveScreenshot(`files-${width}.png`);
  });
}
