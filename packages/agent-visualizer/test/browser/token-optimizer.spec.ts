import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

test("MCP catalogs update the iceberg and loading profiles survive a reload", async ({
  page,
}) => {
  const session: { url: string } = JSON.parse(
    await fs.readFile(".local/browser/session.json", "utf8"),
  );
  await page.goto(session.url);
  await page.getByRole("button", { name: "Cursor", exact: true }).click();
  const mcp = page.getByRole("region", { name: "MCP context", exact: true });
  await expect(mcp).toContainText("MCP analysis complete.");
  await expect(mcp.locator(".mcp-servers tbody")).toContainText("docs");
  await expect(mcp.locator(".mcp-servers tbody")).toContainText("ready");
  const initial = await page.locator(".startup .token-total").innerText();
  const profile = mcp.locator('[data-mcp-client="cursor"]');
  await profile.selectOption("eager");
  await expect
    .poll(() => page.locator(".startup .token-total").innerText())
    .not.toBe(initial);
  await expect(
    page.locator(".breakdown:not(.mcp-servers) tbody"),
  ).toContainText("docs");
  await expect(
    page
      .locator(".breakdown:not(.mcp-servers) tbody tr")
      .filter({ hasText: "docs" }),
  ).toHaveCount(1);
  await page.reload();
  await expect(page.locator('[data-mcp-client="cursor"]')).toHaveValue("eager");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.setViewportSize({ width: 640, height: 1000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/mcp-dashboard-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cursor", exact: true }).click();
  await expect(page.locator('[data-mcp-client="cursor"]')).toHaveValue("eager");
});

test("changing the pricing model keeps the dashboard scroll position", async ({
  page,
}) => {
  const session: { url: string } = JSON.parse(
    await fs.readFile(".local/browser/session.json", "utf8"),
  );
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.goto(session.url);
  const select = page.locator("#optimizer-model");
  await expect(select).toBeEnabled();
  await page.mouse.move(900, 400);
  await page.mouse.wheel(0, 80);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  const before = await page.evaluate(() => scrollY);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/token-estimate?**", async (route) => {
    const response = await route.fetch();
    await pending;
    await route.fulfill({ response });
  });
  try {
    await select.selectOption("claude-opus-5-5");
    await expect(select).toBeDisabled();
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(before);
  } finally {
    release();
  }
  await expect(select).toBeEnabled();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(before);
});

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
  await expect(
    page.getByRole("heading", {
      name: "See what your agent knows",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Token Optimizer", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".agent-filter .dimmed")).toHaveCount(0);
  await expect(page.locator(".agent-filter .client-icon").first()).toHaveCSS(
    "opacity",
    "1",
  );
  await expect(page.locator('.agent-filter [aria-pressed="true"]')).toHaveCount(
    4,
  );
  await expect(
    page.getByRole("heading", { name: "Estimated startup context" }),
  ).toBeVisible();
  await expect(page.locator("#summary, #updated")).toHaveCount(0);
  await page.getByRole("button", { name: "Codex", exact: true }).click();
  await page.locator(".agent-portrait").click();
  await expect(
    page.getByRole("heading", { name: "Estimated startup context" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Codex", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#optimizer-model")).toHaveValue("gpt-6.1-sol");
  await expect(page.getByRole("checkbox", { name: "Install RTK" })).toHaveCount(
    0,
  );
  await expect(
    page.locator(".breakdown:not(.mcp-servers) thead th"),
  ).toHaveText(["Context source", "Tokens ≈", "Words"]);
  await expect(page.locator("#optimizer-model option")).toHaveText([
    "GPT-6 Astra",
    "GPT-6.1 Sol",
    "GPT-6 Luna",
    "Claude Fable 5.1",
    "Claude Opus 5.5",
    "Claude Sonnet 5.5",
    "Claude Haiku 5.5",
  ]);
  await expect(page.locator(".startup .cost")).toContainText(/\$\d+\.\d{4}\s/);
  await expect(page.locator(".portions")).not.toContainText("bytes");
  await expect(page.locator(".startup .cost")).toHaveAttribute(
    "title",
    /\$\d+\.\d+/,
  );
  await expect(page.locator(".on-demand .cost")).toHaveAttribute(
    "title",
    /\$\d+\.\d+/,
  );
  await expect(
    page.locator(".breakdown:not(.mcp-servers) tbody"),
  ).not.toContainText("On demand");
  const nav = page.getByRole("navigation", { name: "Views" });
  await expect(nav.getByRole("button")).toHaveText([
    /Context/,
    /Skills/,
    /MCP servers/,
  ]);
  await expect(
    page.getByRole("textbox", { name: "Search assets" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: ".local/token-optimizer-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Claude Code", exact: true }).click();
  await expect(
    page.locator(".breakdown:not(.mcp-servers) tbody"),
  ).not.toContainText("review");
  await expect(
    page.locator(".breakdown:not(.mcp-servers) tbody"),
  ).toContainText("No startup context discovered");
  await expect(
    page.locator(".breakdown:not(.mcp-servers) tbody"),
  ).not.toContainText("style.md");
  await expect(
    page.locator(".breakdown:not(.mcp-servers) tbody"),
  ).not.toContainText("AGENTS.md");
  await page.locator("#optimizer-model").selectOption("claude-opus-5-5");
  await expect(page.locator("#optimizer-model")).toBeEnabled();
  await expect(page.locator(".on-demand .cost")).toContainText(
    /\$\d+\.\d{4}\s/,
  );
  const added = path.join(session.root, "CLAUDE.md");
  try {
    await fs.writeFile(added, "Additional instructions");
    await page.getByRole("button", { name: "Rescan" }).click();
    await expect(
      page.locator(".breakdown:not(.mcp-servers) tbody"),
    ).toContainText("CLAUDE.md");
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
  await expect(
    nav.getByRole("button", { name: "Rules", exact: false }),
  ).toHaveCount(0);
  await expect(
    nav.getByRole("button", { name: "Optimization checklist", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Context", exact: false }).click();
  await expect(
    page.getByRole("textbox", { name: "Search assets" }),
  ).toBeVisible();
  const claude = page.getByRole("button", { name: "Claude Code", exact: true });
  await expect(claude).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator('.agent-filter [aria-pressed="true"]')).toHaveCount(
    4,
  );
  await claude.click();
  await expect(claude).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Skills", exact: false }).click();
  await expect(
    page.getByRole("button", { name: "Files", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Skill review", exact: true }),
  ).toBeVisible();
  await expect(claude).toHaveAttribute("aria-pressed", "true");
  await page.locator(".agent-portrait").click();
  await expect(
    page.getByRole("heading", { name: "Estimated startup context" }),
  ).toBeVisible();
  for (const selector of [".agent-portrait", ".agent-name", "#project-path"]) {
    await page.getByRole("button", { name: /^Context/ }).click();
    await page.locator(selector).click();
    await expect(
      page.getByRole("heading", {
        name: "See what your agent knows",
        exact: true,
      }),
    ).toBeVisible();
    await expect(claude).toHaveAttribute("aria-pressed", "true");
  }
  await claude.click();
  await expect(page.locator('.agent-filter [aria-pressed="true"]')).toHaveCount(
    4,
  );
  await expect(page.locator(".agent-filter .dimmed")).toHaveCount(0);
  await expect(page.locator(".agent-filter .client-icon").first()).toHaveCSS(
    "opacity",
    "1",
  );
  await expect(page.locator("main")).not.toContainText("Select an agent");
  await expect(
    page.getByRole("heading", { name: "Estimated startup context" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
