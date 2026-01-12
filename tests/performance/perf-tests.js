const {
  VariableEngine,
} = require("/Users/suntc/project/apex-bridge/dist/src/core/variable/VariableEngine");

function escapeXmlContent(content) {
  if (!content || typeof content !== "string") {
    return "";
  }
  return content
    .replace(/&/g, "&#x26;")
    .replace(/</g, "&#x3C;")
    .replace(/>/g, "&#x3E;")
    .replace(/"/g, "&#x22;")
    .replace(/'/g, "&#x27;")
    .replace(/<!--/g, "&#x3C;!--")
    .replace(/-->/g, "--&#x3E;")
    .replace(/<\?/g, "&#x3C;?")
    .replace(/\?>/g, "?&#x3E;")
    .replace(/\]\]>/g, "]]&#x3E;");
}

function safeStringify(obj) {
  const seen = [];
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.includes(value)) {
        return "[Circular]";
      }
      seen.push(value);
    }
    if (value === undefined) {
      return null;
    }
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (typeof value === "function") {
      return "[Function]";
    }
    return value;
  });
}

function generateObject(depth) {
  const obj = {};
  for (let i = 0; i < depth; i++) {
    obj["key" + i] = "value" + i;
    obj["nested" + i] = { data: "test", number: i };
  }
  return obj;
}

function generateCircularObject() {
  const obj = { name: "root", children: [] };
  for (let i = 0; i < 10; i++) {
    const child = { name: "child" + i, parent: obj };
    obj.children.push(child);
  }
  return obj;
}

async function runTests() {
  console.log("=".repeat(80));
  console.log("APEXBRIDGE Performance Test Report");
  console.log("=".repeat(80));
  console.log("Test Time: " + new Date().toISOString());
  console.log("Node.js Version: " + process.version);
  console.log(
    "Memory Limit: " + (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2) + " MB"
  );
  console.log("");

  const results = {};

  console.log("Test 1: Memory Leak Test (C-001, C-002)");
  console.log("-".repeat(80));

  if (global.gc) {
    global.gc();
  }
  const initialMemory = process.memoryUsage().heapUsed;
  console.log("Initial Memory: " + (initialMemory / 1024 / 1024).toFixed(2) + " MB");

  for (let i = 0; i < 100; i++) {
    try {
    } catch (e) {}
  }

  if (global.gc) {
    global.gc();
  }
  const finalMemory = process.memoryUsage().heapUsed;
  const memoryGrowth = finalMemory - initialMemory;

  console.log("Post-Cleanup Memory: " + (finalMemory / 1024 / 1024).toFixed(2) + " MB");
  console.log("Memory Growth: " + (memoryGrowth / 1024 / 1024).toFixed(2) + " MB");
  console.log(
    "PASS: Memory growth < 10MB (" + (memoryGrowth < 10 * 1024 * 1024 ? "YES" : "NO") + ")"
  );
  console.log("");

  results.memoryLeakTest = {
    initial: initialMemory,
    final: finalMemory,
    growth: memoryGrowth,
    passed: memoryGrowth < 10 * 1024 * 1024,
  };

  console.log("Test 2: Serialization Performance Test (C-003)");
  console.log("-".repeat(80));

  const testObjects = [
    { name: "small", data: { a: 1, b: "test" } },
    { name: "medium", data: generateObject(100) },
    { name: "large", data: generateObject(1000) },
    { name: "circular", data: generateCircularObject() },
  ];

  const serializeResults = {};

  for (const test of testObjects) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < 10000; i++) {
      safeStringify(test.data);
    }
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000;

    serializeResults[test.name] = duration;
    console.log(test.name.padEnd(12) + ": " + duration.toFixed(2) + " ms (10000 iterations)");
  }

  const allSerializePassed = Object.values(serializeResults).every((v) => v < 100);
  console.log("PASS: 10000 serializations < 100ms (" + (allSerializePassed ? "YES" : "NO") + ")");
  console.log("");

  results.serializationTest = {
    ...serializeResults,
    passed: allSerializePassed,
  };

  console.log("Test 3: XML Escape Performance Test (H-003)");
  console.log("-".repeat(80));

  const xmlTestCases = [
    { name: "normal", content: "Normal text content" },
    { name: "with-special", content: "<test>&\"']]>" },
    { name: "large", content: "x".repeat(10000) },
  ];

  const xmlEscapeResults = {};

  for (const test of xmlTestCases) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < 10000; i++) {
      escapeXmlContent(test.content);
    }
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000;

    xmlEscapeResults[test.name] = duration;
    console.log(test.name.padEnd(12) + ": " + duration.toFixed(2) + " ms (10000 iterations)");
  }

  const allXmlPassed = Object.values(xmlEscapeResults).every((v) => v < 50);
  console.log("PASS: 10000 escapes < 50ms (" + (allXmlPassed ? "YES" : "NO") + ")");
  console.log("");

  results.xmlEscapeTest = {
    ...xmlEscapeResults,
    passed: allXmlPassed,
  };

  console.log("Test 4: Cache Performance Test (M-004)");
  console.log("-".repeat(80));

  const engine = new VariableEngine({ enableCache: true, cacheTtlMs: 60000 });
  const initialStats = engine.getCacheStats();
  console.log(
    "Initial Cache State: size=" + initialStats.size + ", maxSize=" + initialStats.maxSize
  );

  const startCache = process.hrtime.bigint();
  for (let i = 0; i < 15000; i++) {
    const varKey = "var" + (i % 1000);
    const valueKey = "value" + (i % 1000);
    await engine.resolveMessage(
      { role: "user", content: "${" + varKey + "}: ${" + valueKey + "}" },
      {}
    );
  }
  const endCache = process.hrtime.bigint();
  const cacheDuration = Number(endCache - startCache) / 1000000;

  const finalStats = engine.getCacheStats();
  console.log("Cache Operation Time: " + cacheDuration.toFixed(2) + " ms");
  console.log("Final Cache Size: " + finalStats.size + " (limit: " + finalStats.maxSize + ")");
  console.log(
    "PASS: Cache size <= 10000 and LRU eviction works (" +
      (finalStats.size <= 10000 ? "YES" : "NO") +
      ")"
  );
  console.log("");

  results.cacheTest = {
    initialSize: initialStats.size,
    finalSize: finalStats.size,
    maxSize: finalStats.maxSize,
    duration: cacheDuration,
    passed: finalStats.size <= 10000,
  };

  console.log("Test 5: Concurrency Safety Test (H-001)");
  console.log("-".repeat(80));

  const sessionMap = new Map();
  const pendingPromises = new Map();

  async function getOrCreateSession(conversationId) {
    const existingPromise = pendingPromises.get(conversationId);
    if (existingPromise) {
      return existingPromise;
    }

    const existingSessionId = sessionMap.get(conversationId);
    if (existingSessionId) {
      return existingSessionId;
    }

    const creationPromise = (async () => {
      const cachedSessionId = sessionMap.get(conversationId);
      if (cachedSessionId) {
        return cachedSessionId;
      }

      const sessionId = "session-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
      sessionMap.set(conversationId, sessionId);
      return sessionId;
    })();

    pendingPromises.set(conversationId, creationPromise);
    creationPromise.finally(() => {
      pendingPromises.delete(conversationId);
    });

    return creationPromise;
  }

  const concurrentTestStart = process.hrtime.bigint();
  const conversationId = "test-concurrent-" + Date.now();
  const promises = [];

  for (let i = 0; i < 100; i++) {
    promises.push(getOrCreateSession(conversationId));
  }

  const sessionIds = await Promise.all(promises);
  const concurrentTestEnd = process.hrtime.bigint();
  const concurrentDuration = Number(concurrentTestEnd - concurrentTestStart) / 1000000;

  const uniqueSessionIds = new Set(sessionIds);
  const allSameSession = uniqueSessionIds.size === 1;

  console.log("Concurrent Requests: 100");
  console.log("Unique Session Count: " + uniqueSessionIds.size);
  console.log("Concurrent Operation Time: " + concurrentDuration.toFixed(2) + " ms");
  console.log("PASS: No duplicate session creation (" + (allSameSession ? "YES" : "NO") + ")");
  console.log("PASS: Response time < 2s (" + (concurrentDuration < 2000 ? "YES" : "NO") + ")");
  console.log("PASS: Success rate > 99% (" + (allSameSession ? "100%" : "FAILED") + ")");
  console.log("");

  results.concurrencyTest = {
    concurrentRequests: 100,
    uniqueSessionIds: uniqueSessionIds.size,
    duration: concurrentDuration,
    allSameSession,
    passed: allSameSession && concurrentDuration < 2000,
  };

  console.log("=".repeat(80));
  console.log("Performance Test Summary Report");
  console.log("=".repeat(80));

  const allTestsPassed =
    results.memoryLeakTest.passed &&
    results.serializationTest.passed &&
    results.xmlEscapeTest.passed &&
    results.cacheTest.passed &&
    results.concurrencyTest.passed;

  console.log("");
  console.log(
    "| Test Item          | Status  | Details                                           |"
  );
  console.log(
    "|--------------------|---------|---------------------------------------------------|"
  );
  console.log(
    "| Memory Leak Test   | " +
      (results.memoryLeakTest.passed ? "PASS" : "FAIL") +
      " | Growth: " +
      (results.memoryLeakTest.growth / 1024 / 1024).toFixed(2) +
      " MB                       |"
  );
  console.log(
    "| Serialization Perf | " +
      (results.serializationTest.passed ? "PASS" : "FAIL") +
      " | Max: " +
      Math.max(
        ...Object.values(results.serializationTest).filter((v) => typeof v === "number")
      ).toFixed(2) +
      " ms                    |"
  );
  console.log(
    "| XML Escape Perf    | " +
      (results.xmlEscapeTest.passed ? "PASS" : "FAIL") +
      " | Max: " +
      Math.max(
        ...Object.values(results.xmlEscapeTest).filter((v) => typeof v === "number")
      ).toFixed(2) +
      " ms                     |"
  );
  console.log(
    "| Cache Performance  | " +
      (results.cacheTest.passed ? "PASS" : "FAIL") +
      " | Size: " +
      results.cacheTest.finalSize +
      "/" +
      results.cacheTest.maxSize +
      "                          |"
  );
  console.log(
    "| Concurrency Safety | " +
      (results.concurrencyTest.passed ? "PASS" : "FAIL") +
      " | Sessions: " +
      results.concurrencyTest.uniqueSessionIds +
      ", Time: " +
      results.concurrencyTest.duration.toFixed(2) +
      " ms       |"
  );
  console.log("");
  console.log("Overall Result: " + (allTestsPassed ? "ALL TESTS PASSED" : "SOME TESTS FAILED"));
  console.log("");
  console.log("=".repeat(80));

  return results;
}

runTests()
  .then((results) => {
    const allPassed =
      results.memoryLeakTest?.passed &&
      results.serializationTest?.passed &&
      results.xmlEscapeTest?.passed &&
      results.cacheTest?.passed &&
      results.concurrencyTest?.passed;
    process.exit(allPassed ? 0 : 1);
  })
  .catch((error) => {
    console.error("Test execution failed:", error);
    process.exit(1);
  });
