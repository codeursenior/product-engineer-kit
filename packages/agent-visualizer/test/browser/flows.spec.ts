import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

test("graph gestures, filters, keyboard focus, themes, and session reload", async ({
  page,
}) => {
  const session: { url: string } = JSON.parse(
    await fs.readFile(".local/browser/session.json", "utf8"),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const external: string[] = [];
  page.on("request", (req) => {
    if (!req.url().startsWith("http://127.0.0.1:43917/"))
      external.push(req.url());
  });
  await page.goto(session.url);
  const graph = page.locator("svg.graph");
  await expect(graph).toBeVisible();
  const group = graph.locator(":scope > g");
  const before = await group.getAttribute("transform");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(group).not.toHaveAttribute("transform", before ?? "");
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.getByRole("button", { name: "Fit graph" }).click();
  const node = page.locator(".graph-node").first();
  const box = await node.boundingBox();
  if (!box) throw new Error("Graph node missing");
  const transform = await node.getAttribute("transform");
  await page.mouse.move(box.x + box.width / 2, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + 50, { steps: 5 });
  await page.mouse.up();
  await expect(node).not.toHaveAttribute("transform", transform ?? "");
  await page.locator("#list-view").click();
  await page.keyboard.press("/");
  await expect(
    page.getByRole("textbox", { name: "Search assets" }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "Search assets" })
    .fill("architecture");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const file = page.getByRole("button", {
    name: "architecture.md",
    exact: true,
  });
  await file.click();
  await expect(
    page.getByRole("button", { name: "Close details" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(file).toBeFocused();
  await page.getByRole("textbox", { name: "Search assets" }).fill("missing");
  await expect(page.locator("#canvas")).toContainText("No matching assets");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /Skills/ })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Search assets" }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#project-name")).toHaveText("project");
  expect(page.url()).not.toContain("token=");
  await page.locator('[data-scope="user"]').click();
  await expect(page.locator("#summary")).toHaveText(
    "1 files · 0 project · 1 user",
  );
  await page.locator("#client-filter").selectOption("claude");
  await expect(page.locator("#canvas")).toContainText("No matching assets");
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("edit, revision conflict, delete confirmation, and rescan use the real filesystem", async ({
  page,
}) => {
  const session: { url: string; root: string } = JSON.parse(
    await fs.readFile(".local/browser/session.json", "utf8"),
  );
  const target = path.join(session.root, "docs/architecture.md");
  const original = await fs.readFile(target, "utf8");
  try {
    await page.goto(session.url);
    await expect(page.locator("#project-name")).toHaveText("project");
    await page.locator("#list-view").click();
    await page
      .getByRole("button", { name: "architecture.md", exact: true })
      .click();
    await page.getByRole("button", { name: "Edit file", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Edit architecture.md", exact: true })
      .fill("# Saved through the UI");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(".edit-status")).toHaveText(
      "Saved. Workspace rescanned.",
    );
    expect(await fs.readFile(target, "utf8")).toBe("# Saved through the UI");
    await page.getByRole("button", { name: "Edit file", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Edit architecture.md" })
      .fill("Keep my draft");
    await fs.writeFile(target, "Changed externally");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(".edit-status")).toContainText(
      "File changed on disk.",
    );
    await expect(
      page.getByRole("textbox", { name: "Edit architecture.md" }),
    ).toHaveValue("Keep my draft");
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "architecture.md", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Delete file", exact: true })
      .click();
    await expect(page.locator(".delete-confirm")).toContainText(
      "docs/architecture.md",
    );
    await page
      .locator(".delete-confirm")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    expect(await fs.readFile(target, "utf8")).toBe("Changed externally");
    await page
      .getByRole("button", { name: "Delete file", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Delete permanently", exact: true })
      .click();
    await expect(page.locator("#detail")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "architecture.md", exact: true }),
    ).toHaveCount(0);
    await expect(fs.stat(target)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await fs.writeFile(target, original);
    const url = new URL(session.url);
    const token = new URLSearchParams(url.hash.slice(1)).get("token");
    await fetch(url.origin + "/api/scan?refresh=1", {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
});
