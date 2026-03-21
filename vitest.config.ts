import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 10000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary", "lcov", "clover"],
      include: ["src/**/*.ts"],
      exclude: ["src/lib/db.ts"],
      thresholds: {
        lines: 95,
        branches: 80,
        functions: 95,
        statements: 95,
      },
    },
  },
});
