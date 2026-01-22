import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Test file patterns (same as Jest)
    include: ["**/*.{test,spec}.{js,ts,jsx,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.data/**"],

    // Environment
    environment: "node",

    // Global APIs (no need to import describe/it/expect)
    globals: true,

    // Setup files
    setupFiles: ["./tests/setup.ts"],

    // Enable Jest compatibility mode
    // This allows using jest.* APIs alongside vi.*
    unstubGlobals: true,

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html", "json"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        "src/**/*.d.ts",
        "src/types/**",
        "src/**/index.ts",
      ],
    },

    // Test execution
    testTimeout: 30000,
    hookTimeout: 10000,

    // Mocking options
    clearMocks: true,
    restoreMocks: true,

    // reporters
    reporters: ["default"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
