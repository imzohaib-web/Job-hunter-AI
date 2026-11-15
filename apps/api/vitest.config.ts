import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 25_000,
    hookTimeout: 35_000,
    fileParallelism: false,
  },
});
