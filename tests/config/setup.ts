/**
 * Integration Test Setup
 * Phase 5 - ApexBridge 多检索方法集成测试设置
 *
 * 这个文件包含所有集成测试的通用设置和清理逻辑
 */

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "error";
process.env.APEX_BRIDGE_AUTOSTART = "false";

// Increase Jest timeout for integration tests
jest.setTimeout(30000);

// Global beforeAll hook
beforeAll(async () => {
  // Ensure test directories exist
  const fs = await import("fs");
  const path = await import("path");

  const testDirs = [
    path.join(process.cwd(), ".data/test-retrieval"),
    path.join(process.cwd(), "tests/integration/retrieval/fixtures"),
  ];

  for (const dir of testDirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (error) {
      if (process.env.DEBUG_TESTS === "true") {
        console.debug("Directory creation error (expected):", error);
      }
    }
  }
});

// Global afterAll hook
afterAll(async () => {
  // Cleanup test data
  const fs = await import("fs");
  const path = await import("path");

  const testDataDir = path.join(process.cwd(), ".data/test-retrieval");

  try {
    if (fs.existsSync(testDataDir)) {
      // Remove test database files
      const files = fs.readdirSync(testDataDir);
      for (const file of files) {
        if (file.endsWith(".db")) {
          const filePath = path.join(testDataDir, file);
          try {
            fs.unlinkSync(filePath);
          } catch (error) {
            if (process.env.DEBUG_TESTS === "true") {
              console.debug("File deletion error (expected):", error);
            }
          }
        }
      }
    }
  } catch (error) {
    if (process.env.DEBUG_TESTS === "true") {
      console.debug("Cleanup error (expected):", error);
    }
  }
});

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };

beforeAll(() => {
  // Suppress console output during tests unless in verbose mode
  if (process.env.VERBOSE_TESTS !== "true") {
    console.log = jest.fn();
    console.info = jest.fn();
    console.warn = jest.fn();
    // Keep console.error for debugging
  }
});

afterAll(() => {
  // Restore console
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
});
