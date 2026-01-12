/**
 * Integration Test Configuration for Multi-Retrieval Tests
 */

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["/Users/suntc/project/apex-bridge/src", "/Users/suntc/project/apex-bridge/tests"],
  testMatch: ["**/integration/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/"],
  setupFilesAfterEnv: ["/Users/suntc/project/apex-bridge/tests/config/setup.ts"],
  testTimeout: 30000,
  verbose: true,
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  moduleNameMapper: {
    "^@/(.*)$": "/Users/suntc/project/apex-bridge/src/$1",
  },
  transformIgnorePatterns: ["node_modules/(?!(p-queue|p-timeout|eventemitter3|uuid)/)"],
  collectCoverageFrom: [
    "/Users/suntc/project/apex-bridge/src/services/tool-retrieval/**/*.ts",
    "!**/*.d.ts",
    "!**/index.ts",
  ],
  coverageDirectory: "/Users/suntc/project/apex-bridge/coverage/integration",
  coverageReporters: ["text", "lcov", "html", "json"],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  forceExit: true,
  detectOpenHandles: true,
  randomize: false,
  bail: false,
};
