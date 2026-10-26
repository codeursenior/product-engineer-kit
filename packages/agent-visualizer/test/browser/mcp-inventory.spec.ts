import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";

test("MCP inventory retains its table, details and agent filters without homepage estimates", async ({
  page,
}) => {
  const session: { url: string } = JSON.parse(
    await fs.readFile(".local/browser/session.json", "utf8"),
  );
  await page.goto(session.url);
  await expect(page.locator(".startup .cost")).toContainText(
    "per 100 startups",
  );
  await expect(
    page.getByRole("region", { name: "MCP context", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".breakdown tbody")).not.toContainText("docs");
  await page.getByRole("button", { name: /^MCP servers/ }).click();
  const table = page.getByRole("table");
  await expect(table.locator("thead th")).toHaveText([
    "Server",
    "Connection",
    "Transport",
    "Scope",
    "Clients",
  ]);
  await expect(table).toContainText("docs");
  await expect(table).toContainText("Not verified");
  await expect(table).toContainText("HTTP");
  await expect(table).toContainText(".cursor/mcp.json");
  await page.getByRole("button", { name: "docs", exact: true }).click();
  const detail = page.locator("#detail");
  await expect(detail).toContainText("Connection status");
  await expect(detail).toContainText("File configuration");
  await expect(
    detail.getByRole("button", { name: "Edit file", exact: true }),
  ).toHaveCount(0);
  await expect(detail.locator("pre")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("SECRET");
  await expect(page.locator("main")).not.toContainText(
    "https://example.invalid",
  );
  await page
    .getByRole("button", { name: "Close details", exact: true })
    .click();
  await page.getByRole("button", { name: "Codex", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "docs", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Cursor", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "docs", exact: true }),
  ).toBeVisible();
  await page.locator(".agent-portrait").click();
  await expect(
    page.getByRole("heading", { name: "Estimated startup context" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "MCP context", exact: true }),
  ).toHaveCount(0);
});
