/**
 * All Compression Strategies Test
 *
 * 测试四种压缩策略: truncate, prune, summary, hybrid
 */

import { Message } from "../src/types";
import { getContextCompressionService } from "../src/services/context-compression";

function generateMockConversation(messageCount: number): Message[] {
  const messages: Message[] = [];

  messages.push({
    role: "system",
    content: "你是一个智能助手，专注于帮助用户解决技术问题和编程任务。",
  });

  for (let i = 1; i <= messageCount; i++) {
    const role = i % 2 === 1 ? "user" : "assistant";
    messages.push({
      role,
      content:
        role === "user"
          ? `问题 ${i}: 请帮我分析这个技术问题的解决方案。`
          : `回答 ${i}: 根据您的需求，我建议采用以下方案：1. 首先分析问题；2. 设计解决方案；3. 实现并测试。`,
    });
  }

  return messages;
}

async function runTests() {
  console.log("=".repeat(70));
  console.log("🧪 四种压缩策略对比测试");
  console.log("=".repeat(70));
  console.log();

  const compressionService = getContextCompressionService();
  const strategies = ["truncate", "prune", "summary", "hybrid"];
  const messageCounts = [50, 100, 200];

  for (const messageCount of messageCounts) {
    console.log(`\n📝 对话规模: ${messageCount} 条消息`);
    console.log("-".repeat(50));

    const messages = generateMockConversation(messageCount);
    const originalTokens = TokenEstimate(messages);
    console.log(`原始 Token: ${originalTokens}`);

    for (const strategy of strategies) {
      const result = await compressionService.compress(messages, 800, {
        // 使用更小的限制触发压缩
        contextCompression: {
          enabled: true,
          strategy: strategy as any,
          preserveSystemMessage: true,
          preserveRecent: 5,
        },
      } as any);

      const savings = originalTokens - result.stats.compactedTokens;
      const savingsPercent = (result.stats.savingsRatio * 100).toFixed(1);

      console.log(
        `  ${strategy.padEnd(10)}: ${result.stats.compactedTokens.toString().padStart(6)} tokens, 节省 ${savings.toString().padStart(5)} (${savingsPercent}%), 消息数: ${result.messages.length}`
      );
    }
  }

  // 策略特点对比
  console.log("\n\n📋 策略特点对比:");
  console.log("-".repeat(50));
  console.log("  truncate:   简单直接，从头部截断，保留最新消息");
  console.log("  prune:      移除相似短消息，合并连续用户消息");
  console.log("  summary:    保留最近消息，旧消息用摘要替代");
  console.log("  hybrid:     先修剪再截断，平衡信息保留");
  console.log();

  // 特殊测试: 大量短消息
  console.log("🔬 特殊测试: 连续短消息 (prune 策略优势场景)");
  console.log("-".repeat(50));

  const shortMessages: Message[] = [
    { role: "system", content: "系统提示词" },
    { role: "user", content: "好的" },
    { role: "assistant", content: "收到" },
    { role: "user", content: "继续" },
    { role: "assistant", content: "明白" },
    { role: "user", content: "然后呢" },
    { role: "assistant", content: "继续进行" },
    { role: "user", content: "好的" },
    { role: "assistant", content: "收到" },
    { role: "user", content: "OK" },
  ];

  for (const strategy of ["truncate", "prune"]) {
    const result = await compressionService.compress(shortMessages, 8000, {
      contextCompression: { enabled: true, strategy: strategy as any },
    } as any);

    console.log(
      `  ${strategy}: 原始 ${shortMessages.length} 条 -> 保留 ${result.messages.length} 条`
    );
  }

  console.log("\n" + "=".repeat(70));
  console.log("✅ 测试完成");
  console.log("=".repeat(70));
}

function TokenEstimate(messages: Message[]): number {
  let count = 0;
  for (const msg of messages) {
    const content = typeof msg.content === "string" ? msg.content : "";
    count += Math.ceil(content.length / 4) + 4;
  }
  return count;
}

runTests().catch(console.error);
