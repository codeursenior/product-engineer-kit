import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import type { OptimizationChecks } from "./contracts.js";
import { inside } from "./scan/values.js";

/** Fixed read-only probes only; never execute commands from workspace metadata. */
export async function optimizationChecks(
  root: string,
): Promise<OptimizationChecks> {
  const probe = (argument: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const searchPath = (process.env.PATH ?? "")
        .split(path.delimiter)
        .filter(
          (directory) => path.isAbsolute(directory) && !inside(root, directory),
        )
        .join(path.delimiter);
      execFile(
        "rtk",
        [argument],
        {
          cwd: os.tmpdir(),
          env: { ...process.env, PATH: searchPath },
          timeout: 3000,
          maxBuffer: 64 * 1024,
          encoding: "utf8",
          windowsHide: true,
        },
        (error, stdout) => (error ? reject(error) : resolve(stdout)),
      );
    });
  let detected = false;
  let detail =
    "Rust Token Killer was not detected on the server's PATH. Install it in your terminal, then check again.";
  try {
    const version = await probe("--version");
    const help = await probe("-h");
    detected =
      /^rtk\s+\d+\.\d+\.\d+/m.test(version) && /Rust Token Killer/i.test(help);
    detail = detected
      ? "Rust Token Killer installation detected. Agent integration is not verified."
      : "An rtk executable responded, but its Rust Token Killer identity could not be verified.";
  } catch {
    /* Missing, inaccessible, or timed-out executable remains unchecked. */
  }
  return {
    checks: [
      {
        id: "rtk",
        label: "Install RTK",
        detected,
        detail,
        guide: "https://www.rtk-ai.app/docs/getting-started/installation/",
        instructions: [
          {
            label: "macOS / Linux (Homebrew)",
            command: "brew install rtk-ai/tap/rtk",
          },
          { label: "Windows", command: "winget install rtk-ai.rtk" },
          {
            label: "Cargo",
            command:
              "cargo install --git https://github.com/rtk-ai/rtk --branch master rtk",
          },
        ],
      },
    ],
  };
}
