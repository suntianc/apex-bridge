/**
 * Context Compression Test Script
 *
 * 测试上下文压缩功能
 *
 * 运行方式:
 *   npx ts-node tests/context-compression-test.ts
 *   npm run test:context-compression
 */

import { Message } from "../src/types";
import { getContextCompressionService } from "../src/services/context-compression";
import { TokenEstimator } from "../src/services/context-compression/TokenEstimator";

// 生成模拟对话历史
function generateMockConversation(messageCount: number): Message[] {
  const messages: Message[] = [];
  const roles: Array<"system" | "user" | "assistant"> = ["system", "user", "assistant"];

  // 添加系统消息
  messages.push({
    role: "system",
    content:
      "你是一个智能助手，专注于帮助用户解决技术问题和编程任务。你具有丰富的知识储备，能够提供准确、有用的回答。",
  });

  // 生成对话历史
  for (let i = 1; i <= messageCount; i++) {
    const role = i % 2 === 1 ? "user" : "assistant";
    messages.push({
      role,
      content:
        role === "user"
          ? `这是第 ${i} 条用户消息。我需要讨论一些关于项目架构的问题，请帮我分析一下当前的实现方案是否合理。我们需要考虑扩展性、性能和维护性等多个方面。`
          : `好的，关于第 ${i} 条消息的问题，我来详细分析一下。根据您的需求，我建议采用以下方案：首先，我们需要确保系统的模块化设计；其次，要考虑性能优化策略；最后，还需要制定完善的测试计划。`,
    });
  }

  return messages;
}

// 测试配置
const testConfigs = [
  { name: "默认配置", config: undefined },
  { name: "禁用压缩", config: { enabled: false } },
  { name: "小输出保留", config: { enabled: true, outputReserve: 2000 } },
  {
    name: "保留系统消息",
    config: { enabled: true, preserveSystemMessage: true, minMessageCount: 3 },
  },
  { name: "保留更多消息", config: { enabled: true, minMessageCount: 10 } },
];

// 主测试函数
async function runTests() {
  console.log("=".repeat(70));
  console.log("🧪 上下文压缩功能测试");
  console.log("=".repeat(70));
  console.log();

  // 创建压缩服务实例
  const compressionService = getContextCompressionService();

  // 测试不同规模的对话
  const testCases = [
    { name: "短对话 (10条消息)", messageCount: 10 },
    { name: "中等对话 (50条消息)", messageCount: 50 },
    { name: "长对话 (100条消息)", messageCount: 100 },
    { name: "超长对话 (200条消息)", messageCount: 200 },
  ];

  for (const testCase of testCases) {
    console.log(`\n📝 ${testCase.name}`);
    console.log("-".repeat(50));

    // 生成模拟对话
    const messages = generateMockConversation(testCase.messageCount);
    const originalTokens = TokenEstimator.countMessages(messages);

    console.log(`原始消息数: ${messages.length}`);
    console.log(`原始 Token 数: ${originalTokens}`);

    // 测试不同配置
    for (const config of testConfigs) {
      // 模拟 ModelRegistry 获取上下文限制
      const contextLimit = 8000; // 假设模型上下文窗口为 8000 tokens

      // 应用压缩
      const result = await compressionService.compress(messages, contextLimit, {
        contextCompression: config.config,
      } as any);

      // 计算节省比例
      const savingsPercent = (result.stats.savingsRatio * 100).toFixed(1);
      const savingsTokens = result.stats.originalTokens - result.stats.compactedTokens;

      // 打印结果
      console.log(`\n  ${config.name}:`);
      console.log(`    压缩后 Token: ${result.stats.compactedTokens}`);
      console.log(`    节省: ${savingsTokens} tokens (${savingsPercent}%)`);
      console.log(`    消息数: ${result.messages.length}`);

      if (result.stats.wasCompressed) {
        console.log(`    状态: ✅ 已压缩`);
      } else {
        console.log(`    状态: ⏭️ 未压缩 (无需压缩)`);
      }
    }
  }

  // 测试策略可用性
  console.log("\n\n📋 可用的压缩策略:");
  console.log("-".repeat(50));
  const strategies = compressionService.getAvailableStrategies();
  strategies.forEach((strategy, index) => {
    console.log(`  ${index + 1}. ${strategy}`);
  });

  // 测试边界情况
  console.log("\n\n🔬 边界情况测试:");
  console.log("-".repeat(50));

  // 空消息
  const emptyResult = await compressionService.compress([], 8000, undefined);
  console.log(
    `空消息: 压缩后消息数 = ${emptyResult.messages.length}, Token = ${emptyResult.stats.compactedTokens}`
  );

  // 单条系统消息
  const singleMessage: Message[] = [
    {
      role: "system",
      content: "你是一个智能助手。",
    },
  ];
  const singleResult = await compressionService.compress(singleMessage, 8000, undefined);
  console.log(
    `单条消息: 压缩后消息数 = ${singleResult.messages.length}, Token = ${singleResult.stats.compactedTokens}`
  );

  // 超过绝对限制的情况
  console.log("\n\n⚡ 性能测试 (1000条消息):");
  console.log("-".repeat(50));
  const largeMessages = generateMockConversation(1000);
  const startTime = Date.now();
  const largeResult = await compressionService.compress(largeMessages, 8000, undefined);
  const elapsed = Date.now() - startTime;
  console.log(`处理时间: ${elapsed}ms`);
  console.log(`原始 Token: ${largeResult.stats.originalTokens}`);
  console.log(`压缩后 Token: ${largeResult.stats.compactedTokens}`);
  console.log(`节省比例: ${(largeResult.stats.savingsRatio * 100).toFixed(1)}%`);

  console.log("\n\n" + "=".repeat(70));
  console.log("✅ 测试完成");
  console.log("=".repeat(70));
}

// 运行测试
runTests().catch(console.error);
