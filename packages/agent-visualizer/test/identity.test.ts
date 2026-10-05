import fs from "node:fs/promises";
import path from "node:path";
import { beforeEach, expect, it } from "vitest";
import { discoverIdentity } from "../src/scan/identity.js";
import { scanProject } from "../src/scanner.js";

let root: string;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
  "base64",
);
const write = (name: string, value: string | Buffer) =>
  fs.writeFile(path.join(root, ".agents", name), value);
beforeEach(async (t) => {
  await fs.mkdir(".local/test", { recursive: true });
  root = await fs.mkdtemp(path.resolve(".local/test/identity-"));
  await fs.mkdir(path.join(root, ".agents"));
  t.onTestFinished(() => fs.rm(root, { recursive: true, force: true }));
});

it("keeps identity optional and reads only the selected project's convention", async () => {
  expect(await discoverIdentity(root)).toBeUndefined();
  await fs.mkdir(path.join(root, "nested/.agents"), { recursive: true });
  await fs.writeFile(path.join(root, "nested/.agents/NAME.md"), "Nested");
  await fs.mkdir(path.join(root, "home/.agents"), { recursive: true });
  await fs.writeFile(path.join(root, "home/.agents/NAME.md"), "Personal");
  const { data } = await scanProject(root, { home: path.join(root, "home") });
  expect(data.agent).toBeUndefined();
});

it("supports independent name and avatar, prefers PNG, and rescans changes and removals", async () => {
  await write("NAME.md", "\n# Atlas\n\nIgnored description");
  expect(await discoverIdentity(root)).toEqual({ name: "Atlas" });
  await write("AVATAR.png", png);
  const jpeg = await fs.readFile(
    new URL("../public/mountain-context.jpg", import.meta.url),
  );
  await write("AVATAR.jpeg", jpeg);
  const { data } = await scanProject(root, { includeUser: false });
  expect(data.agent).toEqual({
    name: "Atlas",
    avatar: `data:image/png;base64,${png.toString("base64")}`,
  });
  expect(data.nodes).toEqual([]);
  await fs.unlink(path.join(root, ".agents/NAME.md"));
  await fs.unlink(path.join(root, ".agents/AVATAR.png"));
  expect(await discoverIdentity(root)).toEqual({
    avatar: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
  });
  await fs.unlink(path.join(root, ".agents/AVATAR.jpeg"));
  expect(
    (await scanProject(root, { includeUser: false })).data.agent,
  ).toBeUndefined();
});

it("ignores empty, oversized, malformed and non-file inputs without losing valid options", async () => {
  for (const name of [
    " \n",
    "# ",
    "x".repeat(101),
    "x".repeat(4097),
    "Atlas\u0000",
  ]) {
    await write("NAME.md", name);
    expect(await discoverIdentity(root)).toBeUndefined();
  }
  await write("NAME.md", "Atlas");
  for (const bytes of [
    Buffer.from("<svg onload='alert(1)'/>"),
    Buffer.alloc(0),
    Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]),
  ]) {
    await write("AVATAR.png", bytes);
    expect(await discoverIdentity(root)).toEqual({ name: "Atlas" });
  }
  await write("AVATAR.jpeg", png);
  expect(await discoverIdentity(root)).toEqual({ name: "Atlas" });
  await fs.unlink(path.join(root, ".agents/AVATAR.png"));
  await fs.mkdir(path.join(root, ".agents/AVATAR.png"));
  expect(await discoverIdentity(root)).toEqual({ name: "Atlas" });
});

it("does not read identity files or directories linked outside the project", async (t) => {
  const outside = await fs.mkdtemp(path.resolve(".local/test/outside-"));
  t.onTestFinished(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.writeFile(path.join(outside, "NAME.md"), "Private");
  await fs.writeFile(path.join(outside, "AVATAR.png"), png);
  await fs.symlink(
    path.join(outside, "NAME.md"),
    path.join(root, ".agents/NAME.md"),
  );
  await fs.symlink(
    path.join(outside, "AVATAR.png"),
    path.join(root, ".agents/AVATAR.png"),
  );
  expect(await discoverIdentity(root)).toBeUndefined();
  await fs.rm(path.join(root, ".agents"), { recursive: true });
  await fs.symlink(outside, path.join(root, ".agents"), "junction");
  expect(await discoverIdentity(root)).toBeUndefined();
});
