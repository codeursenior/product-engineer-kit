import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

test("Token Optimizer navigates, selects one agent, refreshes and fits both themes", async ({
  page,
}) => {
  const session: { url: string; root: string } = JSON.parse(
    await fs.readFile(".local/browser/session.json", "utf8"),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(session.url);
  await page
    .getByRole("button", { name: "Token Optimizer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Estimated startup context" }),
  ).toBeVisible();
  await expect(page.locator("#optimizer-agent")).toHaveValue("codex");
  await expect(page.locator("#optimizer-model")).toHaveValue("gpt-5.3-codex");
  await expect(page.getByRole("checkbox", { name: "Install RTK" })).toHaveCount(
    0,
  );
  await expect(page.locator("thead")).not.toContainText("Bytes");
  await expect(page.locator("tbody")).not.toContainText("On demand");
  const nav = page.getByRole("navigation", { name: "Views" });
  await expect(nav.getByRole("button")).toHaveText([
    /Context/,
    /Rules/,
    /Skills/,
    /MCP servers/,
    /Token Optimizer/,
    /Optimization checklist/,
  ]);
  await expect(
    page.getByRole("textbox", { name: "Search assets" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: ".local/token-optimizer-light.png",
    fullPage: true,
  });
  await page.locator("#optimizer-agent").selectOption("claude");
  await expect(page.locator("tbody")).toContainText("review");
  await expect(page.locator("tbody")).not.toContainText("style.md");
  await expect(page.locator("tbody")).not.toContainText("AGENTS.md");
  await page.locator("#optimizer-model").selectOption("claude-opus-5.5");
  await page
    .getByText("Estimation method and pricing", { exact: true })
    .click();
  await expect(page.locator(".method")).toContainText("$4 / million");
  const added = path.join(session.root, "CLAUDE.md");
  try {
    await fs.writeFile(added, "Additional instructions");
    await page.getByRole("button", { name: "Rescan" }).click();
    await expect(page.locator("tbody")).toContainText("CLAUDE.md");
  } finally {
    await fs.rm(added, { force: true });
  }
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.screenshot({
    path: ".local/token-optimizer-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 640, height: 1000 });
  await expect(
    page.getByRole("heading", { name: "On-demand context" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/token-optimizer-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Optimization checklist", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Install RTK" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Estimated startup context" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Search assets" }),
  ).toHaveCount(0);
  await expect(page.locator("#summary")).toHaveText(
    "Local installation checks",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/optimization-checklist-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Context", exact: false }).click();
  await expect(
    page.getByRole("textbox", { name: "Search assets" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
