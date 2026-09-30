import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/cli.ts", "src/contracts.ts"],
      reportsDirectory: ".local/coverage/server",
      reporter: ["text", "html"],
    },
  },
});
