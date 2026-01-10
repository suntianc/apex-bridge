/**
 * Context Compression Integration Test
 *
 * 模拟真实多轮对话，测试四种上下文压缩策略
 *
 * 运行方式:
 *   npx ts-node tests/compression-integration-test.ts
 */

import { Message } from "../src/types";
import { TokenEstimator } from "../src/services/context-compression/TokenEstimator";
import { getContextCompressionService } from "../src/services/context-compression";
import { TruncateStrategy } from "../src/services/context-compression/strategies/TruncateStrategy";
import { PruneStrategy } from "../src/services/context-compression/strategies/PruneStrategy";
import { SummaryStrategy } from "../src/services/context-compression/strategies/SummaryStrategy";
import { HybridStrategy } from "../src/services/context-compression/strategies/HybridStrategy";

interface TestResult {
  strategy: string;
  round: number;
  originalTokens: number;
  compressedTokens: number;
  originalMessages: number;
  compressedMessages: number;
  savingsRatio: number;
  savingsTokens: number;
  compressionApplied: boolean;
}

interface ConversationRound {
  round: number;
  userMessage: string;
  assistantResponse: string;
}

function generateTechnicalConversation(rounds: number): ConversationRound[] {
  const conversations: ConversationRound[] = [];

  const topics = [
    "项目架构设计",
    "数据库优化",
    "API 接口设计",
    "缓存策略",
    "消息队列",
    "微服务架构",
    "安全认证",
    "日志监控",
    "性能调优",
    "容灾备份",
  ];

  for (let i = 1; i <= rounds; i++) {
    const topic = topics[(i - 1) % topics.length];
    conversations.push({
      round: i,
      userMessage: `第 ${i} 轮对话 - 关于 ${topic}：请帮我分析当前的技术方案，给出具体的实现建议和注意事项。需要考虑可扩展性、性能和维护性。`,
      assistantResponse: `好的，我来详细分析 ${topic} 的技术方案。首先，当前方案的核心思路是...在实际实现中，需要注意以下几点：1. 数据库设计要遵循第三范式；2. API 接口采用 RESTful 风格；3. 缓存使用 Redis 集群；4. 消息队列采用 Kafka；5. 添加完善的监控告警。具体的代码实现可以参考以下示例：...整个方案预计可以在两周内完成开发，包括单元测试和集成测试。`,
    });
  }

  return conversations;
}

function buildConversationHistory(
  systemPrompt: string,
  conversationRounds: ConversationRound[],
  maxRound: number
): Message[] {
  const messages: Message[] = [];

  messages.push({
    role: "system",
    content: systemPrompt,
  });

  for (let i = 0; i < Math.min(maxRound, conversationRounds.length); i++) {
    messages.push({
      role: "user",
      content: conversationRounds[i].userMessage,
    });
    messages.push({
      role: "assistant",
      content: conversationRounds[i].assistantResponse,
    });
  }

  return messages;
}

async function testCompression(
  strategy: string,
  conversationRounds: ConversationRound[],
  systemPrompt: string,
  contextLimit: number,
  outputReserve: number
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const compressionService = getContextCompressionService();

  const truncateStrategy = new TruncateStrategy();
  const pruneStrategy = new PruneStrategy();
  const summaryStrategy = new SummaryStrategy();
  const hybridStrategy = new HybridStrategy();

  for (let round = 10; round <= conversationRounds.length; round += 10) {
    const messages = buildConversationHistory(systemPrompt, conversationRounds, round);
    const originalTokens = TokenEstimator.countMessages(messages);
    const originalMessages = messages.length;

    const usableLimit = contextLimit - outputReserve;
    let compressedTokens = originalTokens;
    let compressedMessages = originalMessages;
    let savingsRatio = 0;
    let savingsTokens = 0;
    let compressionApplied = false;

    if (originalTokens > usableLimit) {
      compressionApplied = true;

      switch (strategy) {
        case "truncate": {
          const result = await truncateStrategy.compress(messages, {
            maxTokens: usableLimit,
            preserveSystemMessage: true,
            minMessageCount: 2,
          });
          compressedTokens = result.compactedTokens;
          compressedMessages = result.messages.length;
          savingsTokens = originalTokens - compressedTokens;
          savingsRatio = originalTokens > 0 ? savingsTokens / originalTokens : 0;
          break;
        }
        case "prune": {
          const result = await pruneStrategy.compress(messages, {
            maxTokens: usableLimit,
            preserveSystemMessage: true,
            minMessageCount: 2,
          });
          compressedTokens = result.compactedTokens;
          compressedMessages = result.messages.length;
          savingsTokens = originalTokens - compressedTokens;
          savingsRatio = originalTokens > 0 ? savingsTokens / originalTokens : 0;
          break;
        }
        case "summary": {
          const result = await summaryStrategy.compress(messages, {
            maxTokens: usableLimit,
            preserveSystemMessage: true,
            minMessageCount: 2,
            preserveRecent: 5,
          } as any);
          compressedTokens = result.compactedTokens;
          compressedMessages = result.messages.length;
          savingsTokens = originalTokens - compressedTokens;
          savingsRatio = originalTokens > 0 ? savingsTokens / originalTokens : 0;
          break;
        }
        case "hybrid": {
          const result = await hybridStrategy.compress(messages, {
            maxTokens: usableLimit,
            preserveSystemMessage: true,
            minMessageCount: 2,
          });
          compressedTokens = result.compactedTokens;
          compressedMessages = result.messages.length;
          savingsTokens = originalTokens - compressedTokens;
          savingsRatio = originalTokens > 0 ? savingsTokens / originalTokens : 0;
          break;
        }
      }
    }

    results.push({
      strategy,
      round,
      originalTokens,
      compressedTokens,
      originalMessages,
      compressedMessages,
      savingsRatio,
      savingsTokens,
      compressionApplied,
    });
  }

  return results;
}

async function runTests() {
  console.log("=".repeat(80));
  console.log("🧪 上下文压缩集成测试 - 模拟真实多轮对话");
  console.log("=".repeat(80));
  console.log();

  const systemPrompt = `你是一个专业的技术顾问，专注于帮助用户解决软件开发中的各种问题。
你的职责包括：
1. 分析技术需求和方案设计
2. 提供具体的代码实现建议
3. 解答技术选型和架构设计问题
4. 帮助排查和解决技术难题

请始终保持专业、耐心和友好的态度，用通俗易懂的语言解释复杂的技术概念。`;

  const conversationRounds = generateTechnicalConversation(100);
  const strategies = ["truncate", "prune", "summary", "hybrid"];
  const contextLimit = 8000;
  const outputReserve = 4000;

  console.log(`📋 测试配置:`);
  console.log(`  - 对话轮数: ${conversationRounds.length}`);
  console.log(`  - 模型上下文限制: ${contextLimit} tokens`);
  console.log(`  - 输出保留空间: ${outputReserve} tokens`);
  console.log(`  - 可用上下文: ${contextLimit - outputReserve} tokens`);
  console.log();

  const allResults: { [key: string]: TestResult[] } = {};

  for (const strategy of strategies) {
    console.log(`⏳ 测试 ${strategy} 策略中...`);
    allResults[strategy] = await testCompression(
      strategy,
      conversationRounds,
      systemPrompt,
      contextLimit,
      outputReserve
    );
    console.log(`  ✅ ${strategy} 策略测试完成 (${allResults[strategy].length} 个测试点)`);
  }

  console.log("\n" + "=".repeat(80));
  console.log("📊 测试结果汇总");
  console.log("=".repeat(80));
  console.log();

  console.log(
    "┌─────────┬──────────┬───────────────┬──────────────┬─────────────┬────────────┬────────────┐"
  );
  console.log(
    "│ Round   │ 策略     │ 原始 Tokens   │ 压缩后 Tokens│ 节省 Tokens │ 节省比例   │ 已压缩     │"
  );
  console.log(
    "├─────────┼──────────┼───────────────┼──────────────┼─────────────┼────────────┼────────────┤"
  );

  for (const strategy of strategies) {
    const results = allResults[strategy];
    for (const result of results) {
      const savingsPercent = (result.savingsRatio * 100).toFixed(1);
      const compressed = result.compressionApplied ? "✓" : "-";
      console.log(
        `│ ${result.round.toString().padEnd(7)} │ ${strategy.padEnd(8)} │ ${result.originalTokens.toString().padEnd(13)} │ ${result.compressedTokens.toString().padEnd(12)} │ ${result.savingsTokens.toString().padEnd(11)} │ ${savingsPercent.toString().padEnd(10)}% │ ${compressed.padEnd(10)} │`
      );
    }
    console.log(
      "├─────────┼──────────┼───────────────┼──────────────┼─────────────┼────────────┼────────────┤"
    );
  }

  console.log();

  console.log("📈 策略效果对比 (50轮对话时):");
  console.log("-".repeat(70));
  const round50Results = strategies.map((s) => ({
    strategy: s,
    result: allResults[s].find((r) => r.round === 50)!,
  }));

  round50Results.sort((a, b) => b.result.savingsRatio - a.result.savingsRatio);

  for (const { strategy, result } of round50Results) {
    const barLength = Math.floor(result.savingsRatio * 40);
    const bar = "█".repeat(barLength) + "░".repeat(40 - barLength);
    const savingsPercent = (result.savingsRatio * 100).toFixed(1);
    console.log(
      `  ${strategy.padEnd(8)}: ${bar} ${savingsPercent}% (${result.savingsTokens} tokens)`
    );
  }

  console.log();
  console.log("📊 各策略特点分析:");
  console.log("-".repeat(70));
  console.log(`
  truncate (截断):
    - 简单直接，从头部截断旧消息
    - 保留最新对话，但可能丢失重要历史信息
    - 计算复杂度低，性能最好

  prune (修剪):
    - 移除相似短消息，合并连续用户消息
    - 保留信息密度高的内容
    - 适用于短消息较多的场景

  summary (摘要):
    - 保留最近 N 条消息原文
    - 旧消息用摘要替代
    - 保留更多上下文语义，但需要摘要生成

  hybrid (混合):
    - 先修剪再截断
    - 结合两种策略的优点
    - 平衡信息保留和 Token 限制
`);

  console.log("=".repeat(80));
  console.log("✅ 测试完成");
  console.log("=".repeat(80));
}

runTests().catch(console.error);
