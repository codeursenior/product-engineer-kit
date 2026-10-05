import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

test("optional identity renders local images and refreshes independently with safe defaults", async ({
  page,
}) => {
  const session: { url: string; root: string } = JSON.parse(
    await fs.readFile(".local/browser/session.json", "utf8"),
  );
  const name = path.join(session.root, ".agents/NAME.md");
  const png = path.join(session.root, ".agents/AVATAR.png");
  const jpeg = path.join(session.root, ".agents/AVATAR.jpeg");
  const avatar = page.locator(".brand img");
  const label = page.locator(".agent-name");
  const rescan = async () => {
    await page.getByRole("button", { name: "Rescan" }).click();
    await expect(page.getByRole("button", { name: "Rescan" })).toBeEnabled();
  };
  try {
    await page.goto(session.url);
    await expect(label).toHaveText("boyscout");
    await expect(avatar).toHaveAttribute("src", "/favicon.svg");
    await fs.writeFile(name, "# Atlas");
    await rescan();
    await expect(label).toHaveText("Atlas");
    await expect(avatar).toHaveAttribute("src", "/favicon.svg");
    await fs.copyFile("public/client-logos/claude.png", png);
    await rescan();
    await expect(avatar).toHaveAttribute("src", /^data:image\/png;base64,/);
    await expect
      .poll(() => avatar.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await page.screenshot({ path: ".local/identity-preview.png" });
    await page.reload();
    await expect(label).toHaveText("Atlas");
    await expect(avatar).toHaveAttribute("src", /^data:image\/png;base64,/);
    await fs.unlink(name);
    await fs.unlink(png);
    await fs.copyFile("public/mountain-context.jpg", jpeg);
    await rescan();
    await expect(label).toHaveText("boyscout");
    await expect(avatar).toHaveAttribute("src", /^data:image\/jpeg;base64,/);
    await expect
      .poll(() => avatar.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await fs.writeFile(png, Buffer.from("89504e470d0a1a0a", "hex"));
    await rescan();
    await expect(avatar).toHaveAttribute("src", "/favicon.svg");
    await fs.unlink(png);
    await fs.unlink(jpeg);
    await rescan();
    await expect(label).toHaveText("boyscout");
    await expect(avatar).toHaveAttribute("src", "/favicon.svg");
    await expect(page.locator("#project-name")).toHaveText("project");
  } finally {
    for (const file of [name, png, jpeg]) await fs.rm(file, { force: true });
    const url = new URL(session.url);
    const token = new URLSearchParams(url.hash.slice(1)).get("token");
    await fetch(url.origin + "/api/scan?refresh=1", {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
});
