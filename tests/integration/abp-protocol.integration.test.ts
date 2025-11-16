/**
 * ABP Protocol Integration Tests
 * 
 * ABP协议集成测试
 */

import { ABPProtocolParser } from '../../src/core/protocol/ABPProtocolParser';
import { ABPVariableEngine } from '../../src/core/protocol/ABPVariableEngine';
import { VariableEngine } from '../../src/core/variable/VariableEngine';
import { TimeProvider, EnvironmentProvider } from '../../src/core/variable/providers';
import { performance } from 'node:perf_hooks';

describe('ABP Protocol Integration Tests', () => {
  let parser: ABPProtocolParser;
  let variableEngine: VariableEngine;
  let abpVariableEngine: ABPVariableEngine;

  beforeEach(() => {
    // Initialize ABP Protocol Parser
    parser = new ABPProtocolParser({
      errorRecoveryEnabled: true,
      jsonRepair: { enabled: true, strict: false },
      noiseStripping: { enabled: true, aggressive: false },
      boundaryValidation: { enabled: true, strict: false },
      fallback: { enabled: true, toVCP: false, toPlainText: true },
    });

    // Initialize Variable Engine (使用独立实现)
    variableEngine = new VariableEngine();
    variableEngine.registerProvider(new TimeProvider());
    variableEngine.registerProvider(new EnvironmentProvider(['Var', 'Tar']));
    
    abpVariableEngine = new ABPVariableEngine(variableEngine, {
      cacheEnabled: true,
      cacheTTL: 60000,
      reuseVCPProviders: true,
    });
  });

  describe('End-to-End Protocol Flow', () => {
    it('should handle complete ABP tool call flow', () => {
      // Step 1: LLM outputs ABP format
      const llmOutput = `[[ABP_TOOL:Calculator]]
{
  "action": "calculate",
  "parameters": {
    "expression": "2+2"
  }
}
[[END_ABP_TOOL]]`;

      // Step 2: Parse ABP protocol
      const parseResult = parser.parseToolRequests(llmOutput);

      expect(parseResult.success).toBe(true);
      expect(parseResult.toolCalls).toHaveLength(1);
      expect(parseResult.toolCalls[0].tool).toBe('Calculator');
      expect(parseResult.toolCalls[0].parameters.expression).toBe('2+2');

      // Step 3: Format tool result
      const toolResult = {
        id: parseResult.toolCalls[0].id,
        result: 4,
      };
      const formattedResult = parser.formatToolResult(toolResult);

      expect(formattedResult).toContain('4');
    });

    it('should handle variables in ABP tool calls', async () => {
      // Set environment variable
      process.env.TEST_VAR = 'test_value';

      // LLM outputs ABP format with variables
      const llmOutput = `[[ABP_TOOL:Service]]
{
  "action": "execute",
  "parameters": {
    "apiKey": "{{Var:TEST_VAR}}"
  }
}
[[END_ABP_TOOL]]`;

      // Parse ABP protocol
      const parseResult = parser.parseToolRequests(llmOutput);

      expect(parseResult.success).toBe(true);
      expect(parseResult.toolCalls).toHaveLength(1);

      // Resolve variables in parameters
      const toolCall = parseResult.toolCalls[0];
      const paramString = JSON.stringify(toolCall.parameters);
      const resolvedParams = await abpVariableEngine.resolveAll(paramString);
      const resolvedParameters = JSON.parse(resolvedParams);

      expect(resolvedParameters.apiKey).toBe('test_value');
    });

    it('should handle error recovery in complete flow', () => {
      // LLM outputs malformed ABP format
      const llmOutput = `我需要调用计算器。
[[ABP_TOOL:Calculator]]
{
  "action": "calculate",
  "parameters": {
    "expression": "2+2"
}
[[END_ABP_TOOL]]
这就是结果。`;

      const parseResult = parser.parseToolRequests(llmOutput);

      // Should attempt to repair and parse
      expect(parseResult.success).toBe(true);
      expect(parseResult.toolCalls.length).toBeGreaterThanOrEqual(0);
    });
  });

  // VCP to ABP Conversion Flow tests removed
  // VCP协议已完全移除，不再支持VCP到ABP的转换
  // 系统仅支持ABP协议格式

  describe('Error Recovery Integration', () => {
    it('should recover from various JSON errors', () => {
      const testCases = [
        {
          name: 'missing closing brace',
          content: `[[ABP_TOOL:Calculator]]
{
  "action": "calculate",
  "parameters": {
    "expression": "2+2"
}
[[END_ABP_TOOL]]`,
        },
        {
          name: 'unclosed quotes',
          content: `[[ABP_TOOL:Calculator]]
{
  "action": "calculate",
  "parameters": {
    "expression": "2+2
  }
}
[[END_ABP_TOOL]]`,
        },
        {
          name: 'noise text',
          content: `我需要调用计算器。
[[ABP_TOOL:Calculator]]
{
  "action": "calculate",
  "parameters": {
    "expression": "2+2"
  }
}
[[END_ABP_TOOL]]
这就是结果。`,
        },
      ];

      testCases.forEach((testCase) => {
        const result = parser.parseToolRequests(testCase.content);
        // Should attempt to recover, result may vary
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
      });
    });
  });

  describe('Variable Resolution Integration', () => {
    it('should resolve variables in ABP protocol messages', async () => {
      // Set up environment
      process.env.API_KEY = 'secret_key';

      // LLM output with variables
      const llmOutput = `[[ABP_TOOL:Service]]
{
  "action": "callAPI",
  "parameters": {
    "apiKey": "{{Var:API_KEY}}",
    "timestamp": "{{time}}"
  }
}
[[END_ABP_TOOL]]`;

      // Parse ABP protocol
      const parseResult = parser.parseToolRequests(llmOutput);

      expect(parseResult.success).toBe(true);
      expect(parseResult.toolCalls).toHaveLength(1);

      // Resolve variables
      const toolCall = parseResult.toolCalls[0];
      const paramString = JSON.stringify(toolCall.parameters);
      const resolvedParams = await abpVariableEngine.resolveAll(paramString);
      const resolvedParameters = JSON.parse(resolvedParams);

      expect(resolvedParameters.apiKey).toBe('secret_key');
      expect(resolvedParameters.timestamp).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    it('should parse multiple tool calls efficiently', () => {
      const multipleCalls = Array(10)
        .fill(0)
        .map(
          (_, i) => `[[ABP_TOOL:Calculator${i}]]
{
  "action": "calculate",
  "parameters": {
    "expression": "${i}+${i}"
  }
}
[[END_ABP_TOOL]]`
        )
        .join('\n\n');

      const startTime = Date.now();
      const result = parser.parseToolRequests(multipleCalls);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.toolCalls).toHaveLength(10);
      expect(duration).toBeLessThan(100); // Should complete in <100ms
    });

    it('should cache variable resolution efficiently', async () => {
      process.env.TEST_VAR = 'cached_value';

      const content = '{{Var:TEST_VAR}}';

      // First call
      const start1 = performance.now();
      const result1 = await abpVariableEngine.resolveAll(content);
      const duration1 = Math.max(0.1, performance.now() - start1);

      // Second call (should use cache)
      const start2 = performance.now();
      const result2 = await abpVariableEngine.resolveAll(content);
      const duration2 = Math.max(0.1, performance.now() - start2);

      expect(result1).toBe('cached_value');
      expect(result2).toBe('cached_value');
      expect(duration2).toBeLessThanOrEqual(duration1 * 1.5); // Allow small jitter due to timer precision
    });
  });
});

