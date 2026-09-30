import fs from "node:fs/promises";
import path from "node:path";

interface StaticAsset {
  file: string;
  type: string;
}
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

/** Enumerate build output once. Request paths are map keys, never filesystem paths. */
export async function browserAssets(
  directory: string,
): Promise<Map<string, StaticAsset>> {
  const assets = new Map<string, StaticAsset>();
  async function visit(relative: string): Promise<void> {
    for (const entry of await fs.readdir(path.join(directory, relative), {
      withFileTypes: true,
    })) {
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile()) {
        const type = types[path.extname(name)];
        if (type)
          assets.set(name === "index.html" ? "/" : "/" + name, {
            file: path.join(directory, name),
            type,
          });
      }
    }
  }
  try {
    await visit("");
  } catch {
    /* Missing build is reported on requests. */
  }
  return assets;
}
