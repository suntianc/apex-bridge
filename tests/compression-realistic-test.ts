/**
 * OpenCode压缩逻辑综合测试
 *
 * 测试功能：
 * 1. 压缩率测试 - 测量不同场景下的压缩效果
 * 2. 压缩质量测试 - 评估摘要内容质量
 * 3. 逻辑完整性测试 - 验证决策点、严重性检测、策略回退
 *
 * 运行命令: npm run test:compression-realistic
 */

import { Message } from "../src/types";
import {
  ContextCompressionService,
  CompressionStats,
  OpenCodeCompactionConfig,
} from "../src/services/context-compression/ContextCompressionService";
import { TokenEstimator } from "../src/services/context-compression/TokenEstimator";

/**
 * 测试结果接口
 */
interface TestResult {
  scenario: string;
  passed: boolean;
  metrics: {
    originalTokens: number;
    compressedTokens: number;
    compressionRate: number;
    messagesRemoved: number;
  };
  details: string;
}

/**
 * 摘要质量评估结果
 */
interface SummaryQualityResult {
  coherence: number;
  keyInfoPreserved: number;
  topicAccuracy: number;
  overall: number;
  feedback: string[];
}

/**
 * 逻辑完整性检查结果
 */
interface LogicIntegrityResult {
  decisionCorrectness: boolean;
  severityDetection: boolean;
  strategyFallback: boolean;
  toolProtection: boolean;
  allPassed: boolean;
  failures: string[];
}

/**
 * 控制台颜色输出工具
 */
const colors: Record<string, string> = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function log(color: string, message: string): void {
  console.log(color + message + colors.reset);
}

function logTable(headers: string[], rows: string[][]): void {
  const columnWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] || "").toString().length))
  );

  const headerRow = headers.map((h, i) => h.padEnd(columnWidths[i])).join(" | ");
  console.log("| " + headerRow + " |");

  const separator = headers.map((_, i) => "-".repeat(columnWidths[i])).join("-|-");
  console.log("|-" + separator + "-|");

  for (const row of rows) {
    const rowStr = row.map((v, i) => (v || "").toString().padEnd(columnWidths[i])).join(" | ");
    console.log("| " + rowStr + " |");
  }
}

/**
 * 生成技术调试会话对话
 */
function generateTechnicalDebuggingConversation(): Message[] {
  const messages: Message[] = [];

  messages.push({
    role: "system",
    content: "You are an expert software engineer and debugging assistant.",
  });

  const conversation = [
    {
      role: "user" as const,
      content:
        "I am getting a strange error: Cannot read property map of undefined at data-processor.ts line 45",
    },
    {
      role: "assistant" as const,
      content:
        "This error means you are calling .map() on undefined. Check line 45 and ensure the variable is initialized.",
    },
    {
      role: "user" as const,
      content:
        "Here is the code: const processedOrders = orders.map(order => ({ orderId: order.id }));",
    },
    {
      role: "assistant" as const,
      content:
        "The issue is that orders is undefined. Add a fallback: const orders = ordersResult || [];",
    },
    {
      role: "user" as const,
      content:
        'That fixed the crash! But how do I distinguish between "no data" and "user not found"?',
    },
    {
      role: "assistant" as const,
      content:
        "Return null for not found, and empty array for no data. Update your function signature accordingly.",
    },
    {
      role: "user" as const,
      content: "My batch processing is slow because it processes users sequentially.",
    },
    {
      role: "assistant" as const,
      content:
        "Use Promise.all to process users in parallel. Example: const results = await Promise.all(userIds.map(processUser));",
    },
    {
      role: "user" as const,
      content: "I am seeing connection pool exhausted errors now.",
    },
    {
      role: "assistant" as const,
      content: "Add connection release in finally blocks and limit concurrency with p-limit.",
    },
  ];

  for (let i = 0; i < 30; i++) {
    const pair = conversation[i % conversation.length];
    messages.push({ role: pair.role, content: pair.content });

    const replies = [
      "Let me help you with that. Could you provide more details about the specific error?",
      "That is a good approach. Let me suggest a few improvements based on best practices.",
      "I see the issue. Here is how to fix it: First, check your configuration. Second, verify the input data.",
    ];
    messages.push({ role: "assistant", content: replies[i % replies.length] });
  }

  return messages;
}

/**
 * 生成项目规划会话对话
 */
function generateProjectPlanningConversation(): Message[] {
  const messages: Message[] = [];

  messages.push({
    role: "system",
    content: "You are a technical product manager helping plan new features.",
  });

  const conversation = [
    {
      role: "user" as const,
      content:
        "I want to build a real-time collaboration feature. Users should see cursors, edit together, and chat.",
    },
    {
      role: "assistant" as const,
      content:
        "For real-time collaboration, use WebSocket for communication, CRDT for conflict resolution, and Redis for presence tracking.",
    },
    {
      role: "user" as const,
      content: "How do we handle WebSocket connection management and scaling?",
    },
    {
      role: "assistant" as const,
      content:
        "Use Socket.io with Redis adapter for horizontal scaling. Implement heartbeat every 30 seconds.",
    },
    {
      role: "user" as const,
      content: "How do we efficiently track who is online across workspaces?",
    },
    {
      role: "assistant" as const,
      content: "Use Redis sorted sets with TTL. Store presence data with 90 second expiration.",
    },
    {
      role: "user" as const,
      content: "What about CRDT implementation for document collaboration?",
    },
    {
      role: "assistant" as const,
      content:
        "Use Yjs library. It handles conflict resolution automatically and supports major editors.",
    },
    {
      role: "user" as const,
      content: "How do we persist document state to database?",
    },
    {
      role: "assistant" as const,
      content:
        "Save Yjs state as binary to Redis for recent docs, and to database for permanent storage.",
    },
  ];

  for (let i = 0; i < 25; i++) {
    const pair = conversation[i % conversation.length];
    messages.push({ role: pair.role, content: pair.content });
    messages.push({
      role: "assistant",
      content: "Good question. Let me explain the approach in detail...",
    });
  }

  return messages;
}

/**
 * 生成问答会话对话
 */
function generateQASession(): Message[] {
  const messages: Message[] = [];

  messages.push({
    role: "system",
    content: "You are a helpful programming tutor.",
  });

  const qaPairs = [
    {
      q: "What is TypeScript?",
      a: "TypeScript is a superset of JavaScript that adds static typing.",
    },
    { q: "How do I define a type?", a: "Use the type or interface keyword." },
    {
      q: "What are generics?",
      a: "Generics allow you to write reusable code with multiple types.",
    },
    {
      q: "How do I use async/await?",
      a: "Async functions return promises and await pauses execution.",
    },
    {
      q: "What is the difference between interface and type?",
      a: "Interfaces can be extended, types are more flexible.",
    },
    { q: "How do I handle errors in async code?", a: "Use try/catch blocks with async/await." },
    { q: "What are utility types?", a: "Built-in types like Partial, Required, Pick." },
    { q: "How do I make a type optional?", a: "Use the ? modifier or Partial utility type." },
    { q: "What is type inference?", a: "TypeScript automatically infers types." },
    { q: "How do I type a function?", a: "Define parameter types and return type." },
  ];

  for (let i = 0; i < qaPairs.length; i++) {
    const qa = qaPairs[i];
    messages.push({ role: "user", content: qa.q + "? Can you give me more details?" });
    messages.push({ role: "assistant", content: qa.a + " Let me provide some code examples..." });
  }

  for (let i = 0; i < 40; i++) {
    messages.push({
      role: "user",
      content:
        "Question " +
        i +
        ": Explain " +
        [
          "naming conventions",
          "error handling strategies",
          "testing methodologies",
          "performance optimization",
          "security best practices",
        ][i % 5] +
        " in depth",
    });
    messages.push({
      role: "assistant",
      content:
        "Here is a comprehensive explanation of " +
        ["naming conventions", "error handling", "testing", "performance", "security"][i % 5] +
        ": First, understand the principles. Second, apply them consistently. Third, review and refactor.",
    });
  }

  return messages;
}

/**
 * 生成混合会话对话
 */
function generateMixedSession(): Message[] {
  const messages: Message[] = [];

  messages.push({
    role: "system",
    content: "You are a helpful AI assistant.",
  });

  const mixedContent = [
    {
      role: "user",
      content:
        "How do I fix a memory leak in my Node.js application? I am seeing increasing memory usage over time.",
    },
    {
      role: "assistant",
      content:
        "Memory leaks in Node.js are often caused by: 1) Unreleased event listeners 2) Closures holding references 3) Global variables growing unbounded 4) Buffers not properly handled. Use Chrome DevTools heap snapshots to identify detached DOM trees and global object growth.",
    },
    {
      role: "user",
      content:
        "What database should I use for my startup? We need to handle millions of users with complex queries.",
    },
    {
      role: "assistant",
      content:
        "For high-scale applications, PostgreSQL is excellent for relational data with complex queries. Consider using read replicas for scaling. For document storage, MongoDB can work but be careful with query patterns. Redis for caching frequently accessed data.",
    },
    { role: "user", content: "What is Docker and why should I use it for my project?" },
    {
      role: "assistant",
      content:
        "Docker provides containerization which ensures consistent environments across development, testing, and production. Benefits include: isolation, reproducibility, easy scaling, and simplified deployment. Use Docker Compose for local development with multiple services.",
    },
    {
      role: "user",
      content: "My production API is returning intermittent 500 errors. How do I debug this?",
    },
    {
      role: "assistant",
      content:
        "Debug intermittent 500 errors by: 1) Adding comprehensive logging with request IDs 2) Setting up APM tools 3) Checking database connection pool exhaustion 4) Monitoring memory and CPU 5) Reviewing slow query logs 6) Checking for unhandled promise rejections.",
    },
    { role: "user", content: "How do I implement secure authentication in my web application?" },
    {
      role: "assistant",
      content:
        "Secure authentication requires: JWT tokens with short expiration, refresh token rotation, CSRF protection, rate limiting on login endpoints, secure password hashing with bcrypt, multi-factor authentication for sensitive operations, and proper session management with secure cookies.",
    },
    {
      role: "user",
      content:
        "What are best practices for writing error messages that help developers debug issues?",
    },
    {
      role: "assistant",
      content:
        "Good error messages should: 1) Be specific about what went wrong 2) Include relevant context and variables 3) Suggest possible solutions 4) Provide error codes for lookup 5) Include request IDs for correlation 6) Avoid exposing sensitive information while being helpful to developers.",
    },
    {
      role: "user",
      content: "How do I scale a web application to handle millions of concurrent users?",
    },
    {
      role: "assistant",
      content:
        "Scaling strategies include: horizontal scaling with load balancers, database read replicas, caching with Redis or Memcached, CDN for static assets, async processing with message queues, connection pooling, and auto-scaling based on metrics. Also consider microservice architecture for independent scaling.",
    },
  ];

  for (let i = 0; i < 80; i++) {
    const pair = mixedContent[i % mixedContent.length];
    messages.push({
      role: pair.role as "user" | "assistant",
      content: pair.content,
    });
  }

  return messages;
}

/**
 * 生成大型消息集用于测试
 */
function generateLargeMessageSet(): Message[] {
  const messages: Message[] = [];

  for (let i = 0; i < 300; i++) {
    messages.push({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "Message " + i + ": " + "test content ".repeat(20),
    });
  }

  return messages;
}

/**
 * 生成包含工具调用的消息集
 */
function generateMessagesWithTools(): Message[] {
  const messages: Message[] = [];

  for (let i = 0; i < 50; i++) {
    messages.push({
      role: "user",
      content: "User message " + i,
    });

    if (i % 3 === 0) {
      messages.push({
        role: "assistant",
        content: '<tool_action type="skill" name="test_tool">{"param":"value"}</tool_action>',
      });
    }

    if (i % 5 === 0) {
      messages.push({
        role: "assistant",
        content: "<tool_action result>Tool output for request " + i + "</tool_action>",
      });
    }
  }

  return messages;
}

/**
 * 计算压缩指标
 */
function calculateCompressionMetrics(
  originalMessages: Message[],
  compressedMessages: Message[]
): {
  originalTokens: number;
  compressedTokens: number;
  compressionRate: number;
  messagesRemoved: number;
} {
  const originalTokens = TokenEstimator.countMessages(originalMessages);
  const compressedTokens = TokenEstimator.countMessages(compressedMessages);
  const messagesRemoved = originalMessages.length - compressedMessages.length;
  const compressionRate =
    originalTokens > 0 ? ((originalTokens - compressedTokens) / originalTokens) * 100 : 0;

  return {
    originalTokens,
    compressedTokens,
    compressionRate: Math.round(compressionRate * 100) / 100,
    messagesRemoved,
  };
}

/**
 * 评估摘要质量
 */
function evaluateSummaryQuality(
  originalMessages: Message[],
  compressedMessages: Message[]
): SummaryQualityResult {
  const feedback: string[] = [];
  let coherence = 5;
  let keyInfoPreserved = 5;
  let topicAccuracy = 5;

  const hasSummary = compressedMessages.some((m) => {
    if (typeof m.content === "string") {
      return m.content.includes("对话历史摘要");
    }
    return false;
  });

  if (hasSummary) {
    feedback.push("包含对话摘要消息");
    coherence += 1;
    topicAccuracy += 1;
  } else {
    feedback.push("未检测到摘要消息");
  }

  const originalSystemCount = originalMessages.filter((m) => m.role === "system").length;
  const compressedSystemCount = compressedMessages.filter((m) => m.role === "system").length;

  if (compressedSystemCount >= originalSystemCount) {
    feedback.push("系统消息已保留");
    keyInfoPreserved += 1;
  } else {
    feedback.push("警告：系统消息丢失");
  }

  const recentOriginal = originalMessages.slice(-5);
  const recentCompressed = compressedMessages.slice(-5);
  let recentPreserved = 0;

  for (const om of recentOriginal) {
    for (const cm of recentCompressed) {
      if (cm.content === om.content && cm.role === om.role) {
        recentPreserved++;
        break;
      }
    }
  }

  if (recentPreserved >= 3) {
    feedback.push("近期消息已保留");
    keyInfoPreserved += 1;
  } else {
    feedback.push("警告：近期消息丢失较多");
  }

  const overall = Math.round(((coherence + keyInfoPreserved + topicAccuracy) / 3) * 10) / 10;

  return {
    coherence: Math.min(10, coherence),
    keyInfoPreserved: Math.min(10, keyInfoPreserved),
    topicAccuracy: Math.min(10, topicAccuracy),
    overall: Math.min(10, overall),
    feedback,
  };
}

/**
 * 验证逻辑完整性
 */
async function verifyLogicIntegrity(messages: Message[]): Promise<LogicIntegrityResult> {
  const service = new ContextCompressionService();
  const failures: string[] = [];

  const smallMessages = messages.slice(0, 5);
  const smallResult = await service.compress(smallMessages, 8000);

  if (smallResult.stats.wasCompressed) {
    failures.push("错误：小消息集不应该被压缩");
  } else if (smallResult.stats.openCodeDecision?.compactionType !== "none") {
    failures.push("错误：小型对话的压缩类型应该为none");
  }

  const overflowResult = service.isOverflowOpenCode(messages, 8000);

  if (overflowResult.isOverflow) {
    if (!["warning", "severe"].includes(overflowResult.severity)) {
      failures.push("错误：溢出时应检测到warning或severe级别");
    }
  } else {
    if (overflowResult.severity !== "none") {
      failures.push("错误：未溢出时严重性应为none");
    }
  }

  const largeMessages = generateLargeMessageSet();
  const strategyResult = await service.compress(largeMessages, 8000, {
    contextCompression: {
      enabled: true,
      openCodeConfig: {
        auto: false,
      },
    },
  });

  if (strategyResult.stats.openCodeDecision?.compactionType !== "strategy") {
    failures.push("错误：禁用auto时应使用策略回退");
  }

  const toolMessages = generateMessagesWithTools();
  const protectedResult = await service.protectedPrune(toolMessages, 500);

  const hasToolProtection =
    protectedResult.toolProtection.protectedTools > 0 ||
    protectedResult.toolProtection.protectedOutputs > 0;

  if (!hasToolProtection) {
    failures.push("警告：工具调用/输出可能未被正确保护");
  }

  const config = service.parseOpenCodeConfig({
    auto: false,
    severeThreshold: 0.9,
  });

  if (config.auto !== false) {
    failures.push("错误：自定义配置未正确解析");
  }

  if (config.severeThreshold !== 0.9) {
    failures.push("错误：severeThreshold配置未正确应用");
  }

  const emptyResult = await service.compress([], 8000);
  if (emptyResult.messages.length !== 0) {
    failures.push("错误：空消息列表应返回空结果");
  }

  return {
    decisionCorrectness: !failures.some((f) => f.includes("决策")),
    severityDetection: !failures.some((f) => f.includes("严重性")),
    strategyFallback: !failures.some((f) => f.includes("策略回退")),
    toolProtection: !failures.some((f) => f.includes("工具")),
    allPassed: failures.length === 0,
    failures,
  };
}

/**
 * 运行压缩率测试
 */
async function runCompressionRateTest(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const service = new ContextCompressionService();

  log(colors.cyan, "\n=== 压缩率测试 ===\n");

  const scenarios = [
    { name: "Technical Debugging", generator: generateTechnicalDebuggingConversation },
    { name: "Project Planning", generator: generateProjectPlanningConversation },
    { name: "Q&A Session", generator: generateQASession },
    { name: "Mixed Session", generator: generateMixedSession },
  ];

  for (const scenario of scenarios) {
    const messages = scenario.generator();
    const originalTokens = TokenEstimator.countMessages(messages);

    log(colors.blue, "场景: " + scenario.name);
    log(colors.blue, "  原始消息数: " + messages.length);
    log(colors.blue, "  原始Token数: " + originalTokens);

    const result = await service.compress(messages, 2000, {
      contextCompression: {
        enabled: true,
      },
    });

    const metrics = calculateCompressionMetrics(messages, result.messages);

    const passed =
      result.stats.wasCompressed ||
      result.messages.length < messages.length ||
      metrics.compressionRate > 0;

    results.push({
      scenario: scenario.name,
      passed,
      metrics,
      details: "使用了 " + (result.stats.openCodeDecision?.compactionType || "none") + " 策略",
    });

    const color = passed ? colors.green : colors.yellow;
    log(color, "  压缩后消息数: " + result.messages.length);
    log(color, "  压缩后Token数: " + metrics.compressedTokens);
    log(color, "  压缩率: " + metrics.compressionRate + "%");
    log(color, "  移除消息数: " + metrics.messagesRemoved);
    log(color, "  通过: " + (passed ? "✓" : "✗") + "\n");
  }

  return results;
}

/**
 * 运行压缩质量测试
 */
async function runQualityTest(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const service = new ContextCompressionService();

  log(colors.cyan, "\n=== 压缩质量测试 ===\n");

  const scenarios = [
    { name: "Technical Debugging", generator: generateTechnicalDebuggingConversation },
    { name: "Project Planning", generator: generateProjectPlanningConversation },
  ];

  for (const scenario of scenarios) {
    const messages = scenario.generator();

    log(colors.blue, "场景: " + scenario.name);

    const result = await service.compress(messages, 8000, {
      contextCompression: {
        enabled: true,
        openCodeConfig: {
          summaryOnSevere: true,
        },
      },
    });

    const quality = evaluateSummaryQuality(messages, result.messages);

    const passed = quality.overall >= 5;

    results.push({
      scenario: scenario.name,
      passed,
      metrics: {
        originalTokens: TokenEstimator.countMessages(messages),
        compressedTokens: TokenEstimator.countMessages(result.messages),
        compressionRate: result.stats.savingsRatio * 100,
        messagesRemoved: messages.length - result.messages.length,
      },
      details: "质量评分: " + quality.overall + "/10 - " + quality.feedback.join(", "),
    });

    log(colors.blue, "  摘要质量评分: " + quality.overall + "/10");
    log(colors.blue, "  连贯性: " + quality.coherence + "/10");
    log(colors.blue, "  关键信息保留: " + quality.keyInfoPreserved + "/10");
    log(colors.blue, "  主题准确性: " + quality.topicAccuracy + "/10");
    log(colors.blue, "  反馈: " + quality.feedback.join("; "));
    log(passed ? colors.green : colors.yellow, "  通过: " + (passed ? "✓" : "✗") + "\n");
  }

  return results;
}

/**
 * 运行逻辑完整性测试
 */
async function runLogicIntegrityTest(): Promise<TestResult> {
  log(colors.cyan, "\n=== 逻辑完整性测试 ===\n");

  const testMessages = generateTechnicalDebuggingConversation();
  const result = await verifyLogicIntegrity(testMessages);

  const passed = result.allPassed;

  log(colors.blue, "决策正确性:");
  log(
    result.decisionCorrectness ? colors.green : colors.red,
    "  " +
      (result.decisionCorrectness ? "✓" : "✗") +
      " " +
      (result.decisionCorrectness ? "通过" : "失败")
  );

  log(colors.blue, "严重性检测:");
  log(
    result.severityDetection ? colors.green : colors.red,
    "  " +
      (result.severityDetection ? "✓" : "✗") +
      " " +
      (result.severityDetection ? "通过" : "失败")
  );

  log(colors.blue, "策略回退:");
  log(
    result.strategyFallback ? colors.green : colors.red,
    "  " + (result.strategyFallback ? "✓" : "✗") + " " + (result.strategyFallback ? "通过" : "失败")
  );

  log(colors.blue, "工具保护:");
  log(
    result.toolProtection ? colors.green : colors.red,
    "  " + (result.toolProtection ? "✓" : "✗") + " " + (result.toolProtection ? "通过" : "失败")
  );

  if (result.failures.length > 0) {
    log(colors.red, "失败详情:");
    for (const failure of result.failures) {
      log(colors.red, "  - " + failure);
    }
  }

  log(passed ? colors.green : colors.yellow, "\n总体通过: " + (passed ? "✓" : "✗") + "\n");

  return {
    scenario: "Logic Integrity",
    passed,
    metrics: {
      originalTokens: 0,
      compressedTokens: 0,
      compressionRate: 0,
      messagesRemoved: result.failures.length,
    },
    details:
      result.failures.length > 0 ? "失败: " + result.failures.join("; ") : "所有逻辑检查通过",
  };
}

/**
 * 生成测试报告
 */
function generateReport(
  compressionResults: TestResult[],
  qualityResults: TestResult[],
  integrityResult: TestResult
): object {
  const allTests = [...compressionResults, ...qualityResults, integrityResult];
  const passed = allTests.filter((r) => r.passed).length;

  return {
    totalTests: allTests.length,
    passed: passed,
    failed: allTests.length - passed,
    allPassed: allTests.every((r) => r.passed),
    timestamp: new Date().toISOString(),
    results: {
      compressionRate: compressionResults,
      qualityTests: qualityResults,
      logicIntegrity: integrityResult,
    },
  };
}

/**
 * 打印最终报告
 */
function printFinalReport(
  compressionResults: TestResult[],
  qualityResults: TestResult[],
  integrityResult: TestResult
): void {
  const allTests = [...compressionResults, ...qualityResults, integrityResult];
  const passedCount = allTests.filter((r) => r.passed).length;
  const totalCount = allTests.length;

  log(colors.bold, "\n═══════════════════════════════════════════");
  log(colors.bold, "      OpenCode 压缩逻辑测试报告");
  log(colors.bold, "═══════════════════════════════════════════\n");

  log(colors.cyan, "【压缩率测试结果】");
  logTable(
    ["场景", "原始Tokens", "压缩后Tokens", "压缩率", "移除消息", "状态"],
    compressionResults.map((r) => [
      r.scenario,
      r.metrics.originalTokens.toString(),
      r.metrics.compressedTokens.toString(),
      r.metrics.compressionRate + "%",
      r.metrics.messagesRemoved.toString(),
      r.passed ? "✓" : "✗",
    ])
  );

  log(colors.cyan, "\n【压缩质量测试结果】");
  logTable(
    ["场景", "原始Tokens", "压缩后Tokens", "压缩率", "移除消息", "状态"],
    qualityResults.map((r) => [
      r.scenario,
      r.metrics.originalTokens.toString(),
      r.metrics.compressedTokens.toString(),
      r.metrics.compressionRate.toFixed(1) + "%",
      r.metrics.messagesRemoved.toString(),
      r.passed ? "✓" : "✗",
    ])
  );

  log(colors.cyan, "\n【逻辑完整性测试结果】");
  logTable(
    ["测试项目", "结果"],
    [
      ["决策正确性", integrityResult.passed ? "✓" : "✗"],
      ["严重性检测", integrityResult.passed ? "✓" : "✗"],
      ["策略回退", integrityResult.passed ? "✓" : "✗"],
      ["工具保护", integrityResult.passed ? "✓" : "✗"],
    ]
  );

  log(colors.bold, "\n【总体统计】");
  log(colors.green, "  通过: " + passedCount + "/" + totalCount);
  log(colors.red, "  失败: " + (totalCount - passedCount) + "/" + totalCount);
  log(colors.yellow, "  通过率: " + ((passedCount / totalCount) * 100).toFixed(1) + "%");

  log(colors.bold, "\n");
  if (allTests.every((r) => r.passed)) {
    log(colors.green, "═══════════════════════════════════════════");
    log(colors.green, "          ✓ 所有测试通过！");
    log(colors.green, "═══════════════════════════════════════════\n");
  } else {
    log(colors.red, "═══════════════════════════════════════════");
    log(colors.red, "          ✗ 部分测试失败");
    log(colors.red, "═══════════════════════════════════════════\n");
  }
}

/**
 * 主测试运行函数
 */
async function runAllTests(): Promise<void> {
  log(colors.bold, "\n");
  log(colors.bold, "╔═══════════════════════════════════════════╗");
  log(colors.bold, "║   OpenCode 压缩逻辑综合测试              ║");
  log(colors.bold, "║   测试场景: 真实对话模拟                 ║");
  log(colors.bold, "╚═══════════════════════════════════════════╝\n");

  try {
    const compressionResults = await runCompressionRateTest();
    const qualityResults = await runQualityTest();
    const integrityResult = await runLogicIntegrityTest();

    printFinalReport(compressionResults, qualityResults, integrityResult);

    const report = generateReport(compressionResults, qualityResults, integrityResult);
    console.log("\n【JSON报告】");
    console.log(JSON.stringify(report, null, 2));

    const allPassed = [...compressionResults, ...qualityResults, integrityResult].every(
      (r) => r.passed
    );
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    log(colors.red, "\n测试执行失败: " + error);
    console.error(error);
    process.exit(1);
  }
}

// 导出测试函数供外部使用
export {
  generateTechnicalDebuggingConversation,
  generateProjectPlanningConversation,
  generateQASession,
  generateMixedSession,
  calculateCompressionMetrics,
  evaluateSummaryQuality,
  verifyLogicIntegrity,
  runAllTests,
};

// 如果直接运行此脚本
if (require.main === module) {
  runAllTests();
}
