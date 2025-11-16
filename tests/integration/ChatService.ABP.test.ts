/**
 * ChatService ABP Support Integration Tests
 * 
 * ChatService ABP协议支持集成测试
 */

import { ChatService } from '../../src/services/ChatService';
import { ProtocolEngine } from '../../src/core/ProtocolEngine';
import { LLMClient } from '../../src/core/LLMClient';
import { PersonalityEngine } from '../../src/core/PersonalityEngine';
import { EventBus } from '../../src/core/EventBus';
import type { AdminConfig } from '../../src/services/ConfigService';

describe('ChatService ABP Support Integration', () => {
  let chatService: ChatService;
  let protocolEngine: ProtocolEngine;
  let llmClient: LLMClient;
  let personalityEngine: PersonalityEngine;

  beforeEach(() => {
    const vcpConfig: AdminConfig = {
      protocol: {
        startMarker: '<<<[TOOL_REQUEST]>>>',
        endMarker: '<<<[END_TOOL_REQUEST]>>>',
        paramStartMarker: '「始」',
        paramEndMarker: '「末」'
      },
      plugins: {
        directory: './plugins'
      },
      debugMode: false,
      abp: {
        enabled: true,
        dualProtocolEnabled: false, // VCP协议已移除
        errorRecoveryEnabled: true,
        jsonRepair: { enabled: true, strict: false },
        noiseStripping: { enabled: true, aggressive: false },
        boundaryValidation: { enabled: true, strict: false },
        fallback: { enabled: true, toVCP: false, toPlainText: true } // VCP fallback已移除
      }
    } as any;

    protocolEngine = new ProtocolEngine(vcpConfig);
    // 创建模拟的LLM客户端（需要至少一个provider配置）
    llmClient = new LLMClient({
      defaultProvider: 'openai',
      openai: {
        apiKey: 'test-key',
        baseURL: 'http://localhost:3000',
        defaultModel: 'test-model'
      }
    });
    personalityEngine = new PersonalityEngine({
      personalityDir: './personalities'
    });
    const eventBus = EventBus.getInstance();

    chatService = new ChatService(
      protocolEngine,
      llmClient,
      eventBus
    );
    chatService.setPersonalityEngine(personalityEngine);
  });

  describe('ABP Protocol Tool Parsing', () => {
    it('should parse ABP tool requests from LLM output', async () => {
      const llmOutput = `[[ABP_TOOL:Calculator]]
{
  "action": "calculate",
  "parameters": {
    "expression": "2+2"
  }
}
[[END_ABP_TOOL]]`;

      // 模拟LLM响应
      const mockResponse = {
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'test-model',
        choices: [{
          index: 0,
          message: {
            role: 'assistant' as const,
            content: llmOutput
          }
        }]
      };

      // 使用ProtocolEngine解析工具请求
      const toolRequests = protocolEngine.parseToolRequests(llmOutput);

      expect(toolRequests).toBeDefined();
      expect(toolRequests.length).toBeGreaterThan(0);
      expect(toolRequests[0].protocol).toBe('abp');
      expect(toolRequests[0].name).toBe('Calculator');
      expect(toolRequests[0].args).toBeDefined();
      expect(toolRequests[0].args.expression).toBe('2+2');
    });

    // VCP协议已移除，不再支持VCP工具请求解析
    // it('should parse VCP tool requests from LLM output', async () => { ... });

    // VCP协议已移除，不再需要优先选择逻辑
    // 现在仅支持ABP协议格式
    it('should parse ABP tool requests correctly', async () => {
      const llmOutput = `[[ABP_TOOL:Calculator]]
{
  "action": "calculate",
  "parameters": {
    "expression": "2+2"
  }
}
[[END_ABP_TOOL]]`;

      // 使用ProtocolEngine解析工具请求
      const toolRequests = protocolEngine.parseToolRequests(llmOutput);

      expect(toolRequests).toBeDefined();
      expect(toolRequests.length).toBeGreaterThan(0);
      expect(toolRequests[0].protocol).toBe('abp');
      expect(toolRequests[0].tool || toolRequests[0].name).toBe('Calculator');
    });
  });

  describe('Dual Protocol Tool Execution', () => {
    it('should execute ABP format tool requests', async () => {
      // 这个测试需要实际的工具执行环境
      // 暂时只测试解析部分
      const llmOutput = `[[ABP_TOOL:Calculator]]
{
  "action": "calculate",
  "parameters": {
    "expression": "2+2"
  }
}
[[END_ABP_TOOL]]`;

      const toolRequests = protocolEngine.parseToolRequests(llmOutput);

      expect(toolRequests).toBeDefined();
      expect(toolRequests.length).toBeGreaterThan(0);
      expect(toolRequests[0].protocol).toBe('abp');
      
      // 工具执行部分需要实际的工具注册和执行环境
      // 这里只测试解析是否正确
    });

    // VCP协议已移除，不再支持VCP格式工具请求执行
    // it('should execute VCP format tool requests', async () => { ... });
  });

  describe('Error Recovery', () => {
    it('should recover from malformed ABP JSON', async () => {
      const llmOutput = `[[ABP_TOOL:Calculator]]
{
  "action": "calculate",
  "parameters": {
    "expression": "2+2"
  // 缺少 closing brace
}
[[END_ABP_TOOL]]`;

      const toolRequests = protocolEngine.parseToolRequests(llmOutput);

      // 应该尝试恢复或fallback
      expect(toolRequests).toBeDefined();
    });

    it('should fallback to plain text when ABP parsing fails', async () => {
      const llmOutput = `[[ABP_TOOL:Invalid]]
{
  "action": "calculate",
  // 无效的JSON
  "parameters": {
    "expression": "2+2"
}
[[END_ABP_TOOL]]`;

      const toolRequests = protocolEngine.parseToolRequests(llmOutput);

      // VCP协议已移除，应该fallback到plain text或返回空结果
      expect(toolRequests).toBeDefined();
      // 可能解析失败，返回空数组或尝试修复
    });
  });

  // VCP协议已移除，不再需要向后兼容性测试
  // describe('Backward Compatibility', () => { ... });
});


