import { expect, test, type Locator } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

test("compose, reconnect, rescan and restore a skill whiteboard without editing skills", async ({
  page,
}) => {
  const session: { url: string; root: string } = JSON.parse(
    await fs.readFile(".local/browser/session.json", "utf8"),
  );
  const file = (name: string) =>
    path.join(session.root, `.agents/skills/${name}/SKILL.md`);
  const names = ["alpha-source", "zulu-output", "new-step"];
  const write = async (name: string, body: string) => {
    await fs.mkdir(path.dirname(file(name)), { recursive: true });
    await fs.writeFile(file(name), `---\nname: ${name}\n---\n${body}`);
  };
  const original = "/review";
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const drag = async (item: Locator, dx: number, dy: number) => {
    const box = await item.boundingBox();
    if (!box) throw new Error("Missing drawing");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + dx,
      box.y + box.height / 2 + dy,
      { steps: 6 },
    );
    await page.mouse.up();
  };
  const openBoard = async () => {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: /Skills/ })
      .click();
    await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
  };
  try {
    await write("alpha-source", original);
    await write("zulu-output", "Output instructions");
    await page.goto(session.url);
    await page.getByRole("button", { name: /Rescan/ }).click();
    await openBoard();
    const cards = page.locator(".board-card");
    await expect(cards).toHaveCount(3);
    await expect(page.locator(".board-reference")).toHaveCount(1);
    const source = page.getByRole("button", {
      name: "Skill alpha-source",
      exact: true,
    });
    const review = page.getByRole("button", {
      name: "Skill review",
      exact: true,
    });
    const output = page.getByRole("button", {
      name: "Skill zulu-output",
      exact: true,
    });
    await page.getByRole("button", { name: "Add arrow", exact: true }).click();
    await source.click();
    await output.click();
    await expect(page.locator(".board-drawing")).toHaveCount(1);
    const before = await page.locator(".board-drawing").getAttribute("d");
    await drag(source, 60, 100);
    await expect(page.locator(".board-drawing")).not.toHaveAttribute(
      "d",
      before ?? "",
    );
    const position = await source.getAttribute("transform");
    await page
      .getByRole("button", { name: "Your arrow 1", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    const endpoint = await page.locator(".board-endpoint").last().boundingBox();
    const destination = await review.boundingBox();
    if (!endpoint || !destination) throw new Error("Missing endpoint");
    await page.mouse.move(
      endpoint.x + endpoint.width / 2,
      endpoint.y + endpoint.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      destination.x + destination.width / 2,
      destination.y + destination.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect(
      page.getByLabel("Arrow destination").locator("option:checked"),
    ).toHaveText("review (project)");
    await page
      .getByLabel("Title text", { exact: true })
      .fill("Publish a release");
    await page.getByRole("button", { name: "Add title", exact: true }).click();
    const title = page.getByRole("button", {
      name: "Title Publish a release",
      exact: true,
    });
    const initialTitlePosition = await title.getAttribute("transform");
    await title.focus();
    await page.keyboard.press("ArrowDown");
    await expect(title).not.toHaveAttribute(
      "transform",
      initialTitlePosition ?? "",
    );
    const titlePosition = await title.getAttribute("transform");
    await page.reload();
    await openBoard();
    await expect(source).toHaveAttribute("transform", position ?? "");
    await expect(title).toHaveAttribute("transform", titlePosition ?? "");
    await expect(page.locator(".board-reference")).toHaveCount(1);
    await expect(page.locator(".board-drawing")).toHaveCount(1);
    await write("new-step", "New instructions");
    await write("alpha-source", "Updated instructions\n/review");
    await page.getByRole("button", { name: /Rescan/ }).click();
    await expect(cards).toHaveCount(4);
    await expect(source).toHaveAttribute("transform", position ?? "");
    await expect(page.locator(".board-drawing")).toHaveCount(1);
    await source.focus();
    await page.keyboard.press("Delete");
    await expect(cards).toHaveCount(4);
    await page.getByRole("button", { name: "Fit skills", exact: true }).click();
    await page.screenshot({
      path: ".local/playwright-results/skill-board-light.png",
    });
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await page.screenshot({
      path: ".local/playwright-results/skill-board-dark.png",
    });
    await page
      .getByRole("button", { name: "Your arrow 1", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("button", { name: "Delete arrow", exact: true })
      .click();
    await expect(page.locator(".board-drawing")).toHaveCount(0);
    await expect(page.locator(".board-reference")).toHaveCount(1);
    await title.focus();
    await page.keyboard.press("Enter");
    await page
      .getByLabel("Edit title", { exact: true })
      .fill("Ready to publish");
    await page
      .getByRole("button", { name: "Delete title", exact: true })
      .click();
    await expect(page.locator(".board-title")).toHaveCount(0);
    await page.reload();
    await openBoard();
    await expect(page.locator(".board-drawing")).toHaveCount(0);
    await expect(page.locator(".board-title")).toHaveCount(0);
    expect(await fs.readFile(file("zulu-output"), "utf8")).toBe(
      "---\nname: zulu-output\n---\nOutput instructions",
    );
    expect(errors).toEqual([]);
  } finally {
    for (const name of names)
      await fs.rm(path.dirname(file(name)), { recursive: true, force: true });
    const url = new URL(session.url);
    await fetch(url.origin + "/api/scan?refresh=1", {
      headers: {
        Authorization: `Bearer ${new URLSearchParams(url.hash.slice(1)).get("token")}`,
      },
    });
  }
});
