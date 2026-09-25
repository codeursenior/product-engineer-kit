import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const kitDirectory = fileURLToPath(new URL("../", import.meta.url));
const packageDirectory = path.join(
  kitDirectory,
  "packages",
  "agent-visualizer",
);
const registryUrl =
  "https://registry.npmjs.org/@codeursenior%2fboyscout/latest";

function tarString(bytes) {
  return bytes.toString("utf8").replace(/\0.*$/s, "");
}

export function unpackFiles(archive) {
  const data = gunzipSync(archive);
  const files = new Map();

  for (let offset = 0; offset + 512 <= data.length;) {
    const header = data.subarray(offset, offset + 512);
    const name = tarString(header.subarray(0, 100));
    if (!name) break;

    const prefix = tarString(header.subarray(345, 500));
    const archivePath = prefix ? `${prefix}/${name}` : name;
    const size = Number.parseInt(
      tarString(header.subarray(124, 136)).trim(),
      8,
    );
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error(`Invalid tar entry size: ${archivePath}`);
    }

    const fileStart = offset + 512;
    const fileEnd = fileStart + size;
    if (fileEnd > data.length)
      throw new Error(`Truncated tar entry: ${archivePath}`);
    const type = header[156];
    if ((type === 0 || type === 48) && archivePath.startsWith("package/")) {
      files.set(
        archivePath.slice("package/".length),
        data.subarray(fileStart, fileEnd),
      );
    }
    offset = fileStart + Math.ceil(size / 512) * 512;
  }

  return files;
}

function canonicalJson(value, stripVersion = false) {
  if (Array.isArray(value)) return value.map((entry) => canonicalJson(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => !stripVersion || key !== "version")
        .sort()
        .map((key) => [key, canonicalJson(value[key])]),
    );
  }
  return value;
}

function comparableContents(filePath, contents) {
  const textFile =
    filePath === "LICENSE" ||
    /\.(?:css|html|js|json|md|svg|txt)$/.test(filePath);
  if (!textFile) return contents;
  const text = contents.toString("utf8").replace(/\r\n/g, "\n");
  if (filePath !== "package.json") return Buffer.from(text);
  return Buffer.from(JSON.stringify(canonicalJson(JSON.parse(text), true)));
}

export function compareFiles(localFiles, publishedFiles) {
  const differences = [];
  const paths = new Set([...localFiles.keys(), ...publishedFiles.keys()]);

  for (const filePath of [...paths].sort()) {
    const local = localFiles.get(filePath);
    const published = publishedFiles.get(filePath);
    if (
      !local ||
      !published ||
      !comparableContents(filePath, local).equals(
        comparableContents(filePath, published),
      )
    ) {
      differences.push(filePath);
    }
  }

  return differences;
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match)
    throw new Error(`Expected a stable x.y.z version, got ${version}`);
  return match.slice(1).map(Number);
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return Math.sign(a[index] - b[index]);
  }
  return 0;
}

export function nextVersion(localVersion, publishedVersion) {
  if (!publishedVersion || compareVersions(localVersion, publishedVersion) > 0)
    return localVersion;
  const [major, minor, patch] = parseVersion(publishedVersion);
  return `${major}.${minor}.${patch + 1}`;
}

function localPackageFiles() {
  const npmCli = process.env.npm_execpath;
  if (!npmCli)
    throw new Error("Run release-status through npm run release:status");
  let output;
  try {
    output = execFileSync(
      process.execPath,
      [
        npmCli,
        "pack",
        "--workspace",
        "@codeursenior/boyscout",
        "--dry-run",
        "--json",
        "--ignore-scripts",
      ],
      {
        cwd: kitDirectory,
        encoding: "utf8",
        env: {
          ...process.env,
          npm_config_cache: path.join(kitDirectory, ".local", "npm-cache"),
          npm_config_loglevel: "silent",
          npm_config_update_notifier: "false",
        },
      },
    );
  } catch (error) {
    throw new Error(
      `npm pack failed: ${error.stdout || error.stderr || error.message}`,
    );
  }
  const [pack] = JSON.parse(output);
  if (!pack?.files?.length) throw new Error("npm pack returned no files");
  return new Map(
    pack.files.map(({ path: filePath }) => [
      filePath,
      readFileSync(path.join(packageDirectory, filePath)),
    ]),
  );
}

async function publishedPackage() {
  const response = await fetch(registryUrl);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`npm registry returned ${response.status}`);
  const metadata = await response.json();
  if (
    metadata.name !== "@codeursenior/boyscout" ||
    !metadata.version ||
    !metadata.dist?.tarball
  ) {
    throw new Error("npm registry returned incomplete Boyscout metadata");
  }
  const archiveResponse = await fetch(metadata.dist.tarball);
  if (!archiveResponse.ok)
    throw new Error(`npm archive returned ${archiveResponse.status}`);
  const files = unpackFiles(Buffer.from(await archiveResponse.arrayBuffer()));
  const publishedManifest = files.get("package.json");
  if (
    !publishedManifest ||
    JSON.parse(publishedManifest.toString("utf8")).version !== metadata.version
  ) {
    throw new Error("npm archive does not match its published version");
  }
  return {
    version: metadata.version,
    files,
  };
}

async function main() {
  const localVersion = JSON.parse(
    readFileSync(path.join(packageDirectory, "package.json"), "utf8"),
  ).version;
  const localFiles = localPackageFiles();
  const published = await publishedPackage();
  const differences = compareFiles(localFiles, published?.files ?? new Map());
  const status = {
    changed: differences.length > 0,
    localVersion,
    publishedVersion: published?.version ?? null,
    nextVersion: differences.length
      ? nextVersion(localVersion, published?.version)
      : localVersion,
    differences,
  };
  console.log(JSON.stringify(status));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `changed=${status.changed}\nlocal_version=${localVersion}\npublished_version=${published?.version ?? ""}\nnext_version=${status.nextVersion}\n`,
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
