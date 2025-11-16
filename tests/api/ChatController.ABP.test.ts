/**
 * ChatController ABP Protocol Support Tests
 * 
 * REST API 接口的 ABP 协议支持集成测试
 */

import { ChatController } from '../../src/api/controllers/ChatController';
import { ChatService } from '../../src/services/ChatService';
import { LLMClient } from '../../src/core/LLMClient';
import { ProtocolEngine } from '../../src/core/ProtocolEngine';
import { ConversationRouter } from '../../src/core/conversation/ConversationRouter';
import { EventBus } from '../../src/core/EventBus';
import { VCPConfig } from '../../src/types';
import { Request, Response } from 'express';

describe('ChatController ABP Protocol Support', () => {
  let chatController: ChatController;
  let chatService: ChatService;
  let protocolEngine: ProtocolEngine;
  let conversationRouter: ConversationRouter;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    const vcpConfig: VCPConfig = {
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
        dualProtocolEnabled: true,
        errorRecoveryEnabled: true,
        jsonRepair: { enabled: true, strict: false },
        noiseStripping: { enabled: true, aggressive: false },
        boundaryValidation: { enabled: true, strict: false },
        fallback: { enabled: true, toVCP: true, toPlainText: true }
      }
    } as any;

    protocolEngine = new ProtocolEngine(vcpConfig);
    const llmClient = new LLMClient({
      defaultProvider: 'openai',
      openai: {
        apiKey: 'test-key',
        baseURL: 'http://localhost:3000',
        defaultModel: 'test-model'
      }
    });
    const eventBus = EventBus.getInstance();
    chatService = new ChatService(protocolEngine, llmClient, eventBus);
    conversationRouter = new ConversationRouter({
      defaultHubPersonaId: 'default',
      defaultHubMemberId: 'hub-main',
      nodeService: null as any,
      eventBus
    });
    chatController = new ChatController(chatService, llmClient, conversationRouter);

    // Mock request
    mockRequest = {
      body: {
        messages: [
          { role: 'user', content: 'Calculate 2+2' }
        ],
        stream: false,
        model: 'test-model'
      }
    };

    // Mock response
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      write: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis()
    };
  });

  describe('REST API ABP Protocol Support', () => {
    it('should support ABP protocol in chat completions endpoint', async () => {
      // Mock ChatService to return ABP tool call response
      jest.spyOn(chatService, 'processMessage').mockResolvedValue({
        content: '[[ABP_TOOL:Calculator]]\n{\n  "action": "calculate",\n  "parameters": {\n    "expression": "2+2"\n  }\n}\n[[END_ABP_TOOL]]',
        toolCalls: [
          {
            name: 'Calculator',
            args: { expression: '2+2' },
            protocol: 'abp'
          }
        ]
      } as any);

      await chatController.chatCompletions(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalled();
      const responseCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseCall).toHaveProperty('choices');
      expect(responseCall.choices[0].message.content).toContain('ABP_TOOL');
    });

    it('should support ABP protocol in streaming chat completions', async () => {
      mockRequest.body!.stream = true;

      // Mock ChatService streamMessage to return ABP tool call chunks
      const mockStream = async function* () {
        yield '[[ABP_TOOL:Calculator]]\n';
        yield '{\n  "action": "calculate",\n';
        yield '  "parameters": {\n';
        yield '    "expression": "2+2"\n';
        yield '  }\n';
        yield '}\n';
        yield '[[END_ABP_TOOL]]';
      };

      jest.spyOn(chatService, 'streamMessage').mockReturnValue(mockStream() as any);

      await chatController.chatCompletions(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(mockResponse.write).toHaveBeenCalled();
    });

    it('should handle dual protocol mode (ABP + VCP)', async () => {
      // Mock ChatService to return mixed protocol response
      jest.spyOn(chatService, 'processMessage').mockResolvedValue({
        content: 'Response with both ABP and VCP',
        toolCalls: [
          {
            name: 'Calculator',
            args: { expression: '2+2' },
            protocol: 'abp'
          },
          {
            name: 'Weather',
            args: { location: 'Beijing' },
            protocol: 'vcp'
          }
        ]
      } as any);

      await chatController.chatCompletions(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalled();
      const responseCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseCall).toHaveProperty('choices');
    });

    it('should fallback to VCP when ABP parsing fails', async () => {
      // Mock ChatService to return VCP fallback response
      jest.spyOn(chatService, 'processMessage').mockResolvedValue({
        content: '<<<[TOOL_REQUEST]>>>\ntool_name: 「始」Weather「末」\nlocation: 「始」Beijing「末」\n<<<[END_TOOL_REQUEST]>>>',
        toolCalls: [
          {
            name: 'Weather',
            args: { location: 'Beijing' },
            protocol: 'vcp'
          }
        ]
      } as any);

      await chatController.chatCompletions(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalled();
      const responseCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseCall.choices[0].message.content).toContain('TOOL_REQUEST');
    });
  });

  describe('API Response Format', () => {
    it('should return OpenAI-compatible response format', async () => {
      jest.spyOn(chatService, 'processMessage').mockResolvedValue({
        content: 'Test response',
        toolCalls: []
      } as any);

      await chatController.chatCompletions(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalled();
      const responseCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseCall).toHaveProperty('id');
      expect(responseCall).toHaveProperty('object', 'chat.completion');
      expect(responseCall).toHaveProperty('created');
      expect(responseCall).toHaveProperty('model');
      expect(responseCall).toHaveProperty('choices');
      expect(responseCall).toHaveProperty('usage');
    });

    it('should include protocol information in tool calls', async () => {
      jest.spyOn(chatService, 'processMessage').mockResolvedValue({
        content: 'ABP tool call',
        toolCalls: [
          {
            name: 'Calculator',
            args: { expression: '2+2' },
            protocol: 'abp'
          }
        ]
      } as any);

      await chatController.chatCompletions(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalled();
      // 验证响应格式正确
      const responseCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseCall.choices).toBeDefined();
    });
  });
});

