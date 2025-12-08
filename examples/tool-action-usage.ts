/**
 * Tool Action 标签解析 - 端到端使用示例
 *
 * 本示例展示如何使用 tool_action 标签解析系统，包括：
 * 1. 完整文本解析
 * 2. 流式检测
 * 3. 工具调度执行
 * 4. 与 ReActEngine 集成
 */

import {
  ToolActionParser,
  StreamTagDetector,
  ToolDispatcher,
  generateToolPrompt
} from '../src/core/tool-action';
import type { ToolActionCall, DetectionResult } from '../src/core/tool-action/types';

// ============================================================================
// 示例 1: 完整文本解析
// ============================================================================

function example1_FullTextParsing() {
  console.log('\n=== 示例 1: 完整文本解析 ===\n');

  const parser = new ToolActionParser();

  // 模拟 LLM 输出包含工具调用
  const llmOutput = `
我需要先搜索相关文件，然后读取内容。

<tool_action name="vector-search">
  <query value="用户认证相关代码" />
  <limit value="5" />
</tool_action>

搜索完成后，让我读取找到的文件：

<tool_action name="file-read">
  <path value="src/auth/login.ts" />
  <startLine value="1" />
  <endLine value="50" />
</tool_action>

以上是我执行的操作。
`;

  const result = parser.parse(llmOutput);

  console.log('解析结果:');
  console.log(`- 找到 ${result.toolCalls.length} 个工具调用`);
  console.log(`- 文本段落: ${result.textSegments.length} 个`);
  console.log(`- 未完成标签: ${result.pendingText ? '是' : '否'}`);

  // 输出工具调用详情
  result.toolCalls.forEach((call, i) => {
    console.log(`\n工具调用 #${i + 1}:`);
    console.log(`  名称: ${call.name}`);
    console.log(`  参数:`, call.parameters);
  });

  // 输出文本段落
  console.log('\n文本段落:');
  result.textSegments.forEach((seg, i) => {
    console.log(`  [${i + 1}] "${seg.content.trim().substring(0, 50)}..."`);
  });
}

// ============================================================================
// 示例 2: 流式检测
// ============================================================================

function example2_StreamDetection() {
  console.log('\n=== 示例 2: 流式检测 ===\n');

  const detector = new StreamTagDetector();

  // 模拟流式输入的多个 chunk
  const chunks = [
    '让我搜索一下相关内容',
    '<tool_action name="vector-',
    'search"><query value="认证',
    '" /><limit value="3" />',
    '</tool_action>',
    '搜索完成，继续处理'
  ];

  console.log('开始处理流式输入...\n');

  let totalEmitted = '';

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`Chunk ${i + 1}: "${chunk}"`);

    const result: DetectionResult = detector.processChunk(chunk);

    console.log(`  状态: ${detector.getState()}`);
    console.log(`  缓冲区: "${detector.getBuffer().substring(0, 30)}${detector.getBuffer().length > 30 ? '...' : ''}"`);
    console.log(`  输出文本: "${result.textToEmit}"`);

    if (result.textToEmit) {
      totalEmitted += result.textToEmit;
    }

    if (result.complete && result.toolAction) {
      console.log(`  ✅ 检测到完整工具调用!`);
      console.log(`     工具: ${result.toolAction.name}`);
      console.log(`     参数:`, result.toolAction.parameters);

      // 重置检测器以处理后续内容
      if (result.bufferRemainder) {
        console.log(`  剩余文本: "${result.bufferRemainder}"`);
        totalEmitted += result.bufferRemainder;
      }
      detector.reset();
    }

    console.log('');
  }

  console.log(`总输出文本: "${totalEmitted}"`);
}

// ============================================================================
// 示例 3: 工具调度执行
// ============================================================================

async function example3_ToolDispatch() {
  console.log('\n=== 示例 3: 工具调度执行 ===\n');

  const dispatcher = new ToolDispatcher({
    timeout: 30000,
    maxConcurrency: 3
  });

  // 查看可用工具
  const availableTools = dispatcher.getAvailableTools();
  console.log('可用工具列表:');
  availableTools.forEach(tool => {
    console.log(`  - ${tool.name}: ${tool.description}`);
  });

  // 生成工具提示词（可添加到系统提示中）
  const toolPrompt = generateToolPrompt(availableTools);
  console.log('\n生成的工具提示词长度:', toolPrompt.length, '字符');

  // 模拟工具调用
  const toolCall: ToolActionCall = {
    name: 'vector-search',
    parameters: {
      query: '文件读取',
      limit: '3'
    },
    rawText: '<tool_action name="vector-search">...</tool_action>',
    startIndex: 0,
    endIndex: 100
  };

  console.log('\n执行工具调用:', toolCall.name);

  // 检查工具是否存在
  if (!dispatcher.hasTool(toolCall.name)) {
    console.log(`  ❌ 工具不存在: ${toolCall.name}`);
    return;
  }

  // 执行工具
  const result = await dispatcher.dispatch(toolCall);

  console.log('执行结果:');
  console.log(`  成功: ${result.success}`);
  console.log(`  执行时间: ${result.executionTime}ms`);
  if (result.success) {
    console.log(`  结果:`, result.result);
  } else {
    console.log(`  错误:`, result.error);
  }
}

// ============================================================================
// 示例 4: 完整的 ReAct 循环模拟
// ============================================================================

async function example4_ReActSimulation() {
  console.log('\n=== 示例 4: ReAct 循环模拟 ===\n');

  const parser = new ToolActionParser();
  const dispatcher = new ToolDispatcher();

  // 模拟多轮 ReAct 对话
  const iterations = [
    {
      thought: '我需要先搜索相关的代码文件',
      action: `<tool_action name="vector-search">
  <query value="用户登录验证" />
  <limit value="3" />
</tool_action>`
    },
    {
      thought: '找到了相关文件，让我读取第一个文件的内容',
      action: `<tool_action name="file-read">
  <path value="src/auth/login.ts" />
</tool_action>`
    }
  ];

  for (let i = 0; i < iterations.length; i++) {
    const iteration = iterations[i];
    console.log(`\n--- 迭代 ${i + 1} ---`);
    console.log(`思考: ${iteration.thought}`);

    // 解析工具调用
    const llmOutput = `${iteration.thought}\n\n${iteration.action}`;
    const parseResult = parser.parse(llmOutput);

    if (parseResult.toolCalls.length > 0) {
      const toolCall = parseResult.toolCalls[0];
      console.log(`行动: 调用工具 [${toolCall.name}]`);
      console.log(`参数:`, toolCall.parameters);

      // 执行工具
      const result = await dispatcher.dispatch(toolCall);

      console.log(`观察: ${result.success ? '工具执行成功' : '工具执行失败'}`);
      if (result.success) {
        console.log(`结果摘要: ${JSON.stringify(result.result).substring(0, 100)}...`);
      } else {
        console.log(`错误: ${result.error}`);
      }
    }
  }

  console.log('\n--- ReAct 循环完成 ---');
}

// ============================================================================
// 示例 5: 在 ChatService 中使用（配置示例）
// ============================================================================

function example5_ChatServiceConfig() {
  console.log('\n=== 示例 5: ChatService 配置示例 ===\n');

  // ChatService 使用时的配置选项
  const chatOptions = {
    selfThinking: {
      enabled: true,                      // 启用 ReAct 多轮思考
      maxIterations: 5,                   // 最大迭代次数
      enableToolActionParsing: true,      // 启用 tool_action 标签解析
      toolActionTimeout: 30000            // 工具执行超时 30 秒
    }
  };

  console.log('ChatService 配置:');
  console.log(JSON.stringify(chatOptions, null, 2));

  console.log('\n使用方式:');
  console.log(`
// 在 API 调用中启用 tool_action 解析
const response = await chatService.chat(messages, {
  selfThinking: {
    enabled: true,
    enableToolActionParsing: true,
    toolActionTimeout: 30000
  }
});
`);
}

// ============================================================================
// 示例 6: 系统提示词生成
// ============================================================================

function example6_SystemPromptGeneration() {
  console.log('\n=== 示例 6: 系统提示词生成 ===\n');

  const dispatcher = new ToolDispatcher();
  const tools = dispatcher.getAvailableTools();

  // 生成工具提示词
  const toolPrompt = generateToolPrompt(tools);

  console.log('生成的工具系统提示词:');
  console.log('----------------------------------------');
  console.log(toolPrompt);
  console.log('----------------------------------------');

  console.log('\n将此提示词添加到系统提示中，LLM 就能以 <tool_action> 格式调用工具');
}

// ============================================================================
// 示例 7: 错误处理
// ============================================================================

async function example7_ErrorHandling() {
  console.log('\n=== 示例 7: 错误处理 ===\n');

  const parser = new ToolActionParser();
  const dispatcher = new ToolDispatcher();

  // 1. 不完整的标签
  console.log('1. 处理不完整标签:');
  const incompleteText = '文本内容<tool_action name="test"><query value="test"';
  const incompleteResult = parser.parse(incompleteText);
  console.log(`   未完成标签: ${incompleteResult.pendingText ? '是' : '否'}`);
  console.log(`   等待更多输入: "${incompleteResult.pendingText?.substring(0, 50)}..."`);

  // 2. 无效的工具名称
  console.log('\n2. 处理不存在的工具:');
  const invalidCall: ToolActionCall = {
    name: 'non-existent-tool',
    parameters: {},
    rawText: '<tool_action name="non-existent-tool"></tool_action>',
    startIndex: 0,
    endIndex: 50
  };
  const invalidResult = await dispatcher.dispatch(invalidCall);
  console.log(`   成功: ${invalidResult.success}`);
  console.log(`   错误: ${invalidResult.error}`);

  // 3. 验证工具调用
  console.log('\n3. 验证工具调用格式:');
  const validCall: ToolActionCall = {
    name: 'vector-search',
    parameters: { query: 'test' },
    rawText: '<tool_action name="vector-search">...</tool_action>',
    startIndex: 0,
    endIndex: 50
  };
  console.log(`   工具存在: ${dispatcher.hasTool(validCall.name)}`);
  console.log(`   格式有效: ${parser.isValidToolAction(validCall)}`);
}

// ============================================================================
// 运行所有示例
// ============================================================================

async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          Tool Action 标签解析 - 端到端使用示例              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    example1_FullTextParsing();
    example2_StreamDetection();
    await example3_ToolDispatch();
    await example4_ReActSimulation();
    example5_ChatServiceConfig();
    example6_SystemPromptGeneration();
    await example7_ErrorHandling();

    console.log('\n✅ 所有示例执行完成!');
  } catch (error) {
    console.error('\n❌ 示例执行出错:', error);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  runAllExamples();
}

// 导出示例函数供测试使用
export {
  example1_FullTextParsing,
  example2_StreamDetection,
  example3_ToolDispatch,
  example4_ReActSimulation,
  example5_ChatServiceConfig,
  example6_SystemPromptGeneration,
  example7_ErrorHandling,
  runAllExamples
};
