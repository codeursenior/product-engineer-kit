import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const output = path.resolve(packageDirectory, "dist");
if (path.dirname(output) !== path.resolve(packageDirectory))
  throw new Error("Build output must stay inside the package");
await fs.rm(output, { recursive: true, force: true });
