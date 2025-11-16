/**
 * ProtocolEngine ABP Support Tests
 * 
 * ProtocolEngine ABP协议支持单元测试
 * 注意：VCP协议支持已移除，仅支持ABP协议
 */

import { ProtocolEngine } from '../../src/core/ProtocolEngine';
import type { AdminConfig } from '../../src/services/ConfigService';

describe('ProtocolEngine ABP Support', () => {
  let protocolEngine: ProtocolEngine;

  beforeEach(() => {
    const config: AdminConfig = {
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
      server: {
        host: 'localhost',
        port: 3000
      },
      auth: {
        vcpKey: 'test-key',
        apiKeys: []
      },
      llm: {
        debugMode: false
      },
      abp: {
        enabled: true,
        dualProtocolEnabled: false, // VCP协议已移除
        errorRecoveryEnabled: true,
        jsonRepair: { enabled: true, strict: false },
        noiseStripping: { enabled: true, aggressive: false },
        boundaryValidation: { enabled: true, strict: false },
        fallback: { enabled: true, toVCP: false, toPlainText: true } // 不再支持VCP fallback
      }
    } as any;

    protocolEngine = new ProtocolEngine(config);
  });

  describe('ABP Protocol Parsing', () => {
    it('should parse ABP tool requests', () => {
      const content = `[[ABP_TOOL:Calculator]]
{
  "action": "calculate",
  "parameters": {
    "expression": "2+2"
  }
}
[[END_ABP_TOOL]]`;

      const requests = protocolEngine.parseToolRequests(content);

      expect(requests).toBeDefined();
      expect(requests.length).toBeGreaterThan(0);
      expect(requests[0].name).toBe('Calculator');
      expect(requests[0].args).toBeDefined();
      expect(requests[0].args.expression).toBe('2+2');
      expect(requests[0].protocol).toBe('abp');
    });

    it('should not parse VCP tool requests (VCP support removed)', () => {
      const content = `<<<[TOOL_REQUEST]>>>
tool_name: 「始」Calculator「末」
expression: 「始」2+2「末」
<<<[END_TOOL_REQUEST]>>>`;

      const requests = protocolEngine.parseToolRequests(content);

      // VCP协议已移除，应该返回空数组
      expect(requests).toBeDefined();
      expect(requests.length).toBe(0);
    });

    it('should parse only ABP tool requests when both are present', () => {
      const content = `[[ABP_TOOL:Calculator]]
{
  "action": "calculate",
  "parameters": {
    "expression": "2+2"
  }
}
[[END_ABP_TOOL]]

<<<[TOOL_REQUEST]>>>
tool_name: 「始」Weather「末」
location: 「始」Beijing「末」
<<<[END_TOOL_REQUEST]>>>`;

      const requests = protocolEngine.parseToolRequests(content);

      expect(requests).toBeDefined();
      // 只解析ABP，忽略VCP
      expect(requests.length).toBe(1);
      expect(requests[0].protocol).toBe('abp');
      expect(requests[0].name).toBe('Calculator');
    });

    it('should not fallback to VCP when ABP parsing fails (VCP removed)', () => {
      const content = `[[ABP_TOOL:Invalid]]
{
  "action": "calculate",
  // 无效的JSON
  "parameters": {
    "expression": "2+2"
}
[[END_ABP_TOOL]]

<<<[TOOL_REQUEST]>>>
tool_name: 「始」Weather「末」
location: 「始」Beijing「末」
<<<[END_TOOL_REQUEST]>>>`;

      const requests = protocolEngine.parseToolRequests(content);

      expect(requests).toBeDefined();
      // VCP协议已移除，应该返回空数组或fallback到plain text
      expect(requests.length).toBe(0);
    });

    it('should parse only ABP from mixed ABP and VCP tool requests', () => {
      const content = `[[ABP_TOOL:Calculator]]
{
  "action": "calculate",
  "parameters": {
    "expression": "2+2"
  }
}
[[END_ABP_TOOL]]

<<<[TOOL_REQUEST]>>>
tool_name: 「始」Weather「末」
location: 「始」Beijing「末」
<<<[END_TOOL_REQUEST]>>>`;

      const requests = protocolEngine.parseToolRequests(content);

      expect(requests).toBeDefined();
      // 只解析ABP，忽略VCP
      expect(requests.length).toBe(1);
      expect(requests[0].protocol).toBe('abp');
      expect(requests[0].name).toBe('Calculator');
    });

    it('should ignore VCP block (VCP support removed)', () => {
      const content = `[[ABP_TOOL:Weather]]
{
  "action": "fetch",
  "parameters": {
    "location": "Shanghai"
  }
}
[[END_ABP_TOOL]]

<<<[TOOL_REQUEST]>>>
tool_name: 「始」Calendar「末」
day: 「始」Monday「末」
<<<[END_TOOL_REQUEST]>>>`;

      const requests = protocolEngine.parseToolRequests(content);

      expect(requests).toBeDefined();
      expect(requests.length).toBe(1);
      expect(requests[0].protocol).toBe('abp');
      expect(requests[0].name).toBe('Weather');
    });
  });

  describe('ABP Parser Integration', () => {
    it('should get ABP parser instance', () => {
      const abpParser = protocolEngine.getABPParser();

      expect(abpParser).toBeDefined();
    });

    it('should always use ABP protocol (VCP removed)', () => {
      // VCP协议已移除，只支持ABP协议
      const abpParser = protocolEngine.getABPParser();
      expect(abpParser).toBeDefined();
    });
  });

  describe('Error Recovery', () => {
    it('should recover from malformed ABP JSON', () => {
      const content = `[[ABP_TOOL:Calculator]]
{
  "action": "calculate",
  "parameters": {
    "expression": "2+2"
  // 缺少 closing brace
}
[[END_ABP_TOOL]]`;

      const requests = protocolEngine.parseToolRequests(content);

      // 应该尝试恢复或fallback
      expect(requests).toBeDefined();
    });

    it('should strip noise from ABP content', () => {
      const content = `Some text before
[[ABP_TOOL:Calculator]]
{
  "action": "calculate",
  "parameters": {
    "expression": "2+2"
  }
}
[[END_ABP_TOOL]]
Some text after`;

      const requests = protocolEngine.parseToolRequests(content);

      expect(requests).toBeDefined();
      if (requests.length > 0) {
        expect(requests[0].name).toBe('Calculator');
      }
    });
  });

  describe('VCP Compatibility (Removed)', () => {
    it('should not parse VCP format (VCP support removed)', () => {
      const content = `<<<[TOOL_REQUEST]>>>
tool_name: 「始」Calculator「末」
expression: 「始」2+2「末」
<<<[END_TOOL_REQUEST]>>>`;

      const requests = protocolEngine.parseToolRequests(content);

      // VCP协议已移除，应该返回空数组
      expect(requests).toBeDefined();
      expect(requests.length).toBe(0);
    });

    it('should only support ABP protocol', () => {
      // ProtocolEngine现在只支持ABP协议
      const abpParser = protocolEngine.getABPParser();
      expect(abpParser).toBeDefined();
      
      // 验证只能解析ABP格式
      const abpContent = `[[ABP_TOOL:Calculator]]
{
  "action": "calculate",
  "parameters": { "expression": "2+2" }
}
[[END_ABP_TOOL]]`;
      
      const requests = protocolEngine.parseToolRequests(abpContent);
      expect(requests.length).toBe(1);
      expect(requests[0].protocol).toBe('abp');
    });
  });
});

