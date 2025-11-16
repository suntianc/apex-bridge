import { PromptBuilder } from '../../../src/services/memory/PromptBuilder';
import { Message } from '../../../src/types';
import {
  SemanticMemoryService,
  SemanticMemorySearchResponse
} from '../../../src/services/memory/SemanticMemoryService';
import {
  EpisodicMemoryService,
  EpisodicMemorySearchResponse
} from '../../../src/services/memory/EpisodicMemoryService';

describe('PromptBuilder', () => {
  let builder: PromptBuilder;
  let mockSemanticService: jest.Mocked<SemanticMemoryService>;
  let mockEpisodicService: jest.Mocked<EpisodicMemoryService>;

  beforeEach(() => {
    mockSemanticService = {
      searchSimilar: jest.fn(),
      saveSemantic: jest.fn(),
      recallSemantic: jest.fn()
    } as any;

    mockEpisodicService = {
      queryWindow: jest.fn(),
      recordEvent: jest.fn(),
      getRecentEvents: jest.fn(),
      summarizeRange: jest.fn()
    } as any;

    builder = new PromptBuilder(mockSemanticService, mockEpisodicService);
  });

  describe('buildPrompt', () => {
    it('should build prompt structure with all sections', async () => {
      const messages: Message[] = [
        {
          role: 'system',
          content: 'You are a helpful assistant.'
        },
        {
          role: 'user',
          content: 'Hello, how are you?'
        }
      ];

      const structure = await builder.buildPrompt(messages, {
        includeSessionMemory: true,
        memoryFilter: {
          userId: 'user-1'
        }
      });

      expect(structure.system).toBeDefined();
      expect(structure.memory).toBeDefined();
      expect(structure.user).toBe('Hello, how are you?');
      expect(structure.toolInstr).toBeDefined();
    });

    it('should include Session Memory when enabled', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Response 1' },
        { role: 'user', content: 'Message 2' }
      ];

      const structure = await builder.buildPrompt(messages, {
        includeSessionMemory: true,
        sessionMemoryLimit: 3, // 包含所有3条消息
        memoryFilter: {
          userId: 'user-1'
        }
      });

      expect(structure.memory).toContain('[会话历史]');
      expect(structure.memory).toContain('Message 1');
      expect(structure.memory).toContain('Response 1');
      expect(structure.memory).toContain('Message 2');
    });

    it('should exclude Session Memory when disabled', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Message 1' }
      ];

      const structure = await builder.buildPrompt(messages, {
        includeSessionMemory: false,
        memoryFilter: {
          userId: 'user-1'
        }
      });

      expect(structure.memory).not.toContain('[会话历史]');
    });

    it('should include Episodic Memory when service is available', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Test message' }
      ];

      mockEpisodicService.queryWindow.mockResolvedValue({
        events: [
          {
            id: 'event-1',
            userId: 'user-1',
            content: 'Remember to buy milk',
            timestamp: Date.now(),
            eventType: 'task'
          }
        ]
      } as EpisodicMemorySearchResponse);

      const structure = await builder.buildPrompt(messages, {
        episodicMemoryTopK: 1,
        memoryFilter: {
          userId: 'user-1'
        }
      });

      expect(structure.memory).toContain('[情景记忆]');
      expect(structure.memory).toContain('Remember to buy milk');
    });

    it('should include TOOL INSTR section when enabled', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Test' }
      ];

      const structure = await builder.buildPrompt(messages, {
        includeToolInstr: true,
        memoryFilter: {
          userId: 'user-1'
        }
      });

      expect(structure.toolInstr).toBeDefined();
      expect(structure.toolInstr).toContain('[工具调用格式]');
      expect(structure.toolInstr).toContain('```abp');
    });

    it('should exclude TOOL INSTR section when disabled', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Test' }
      ];

      const structure = await builder.buildPrompt(messages, {
        includeToolInstr: false,
        memoryFilter: {
          userId: 'user-1'
        }
      });

      expect(structure.toolInstr).toBeUndefined();
    });

    it('should filter Episodic Memory by context', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Test' }
      ];

      mockEpisodicService.queryWindow.mockResolvedValue({
        events: [
          {
            id: 'event-1',
            userId: 'user-1',
            personaId: 'persona-1',
            content: 'Memory 1',
            timestamp: Date.now(),
            eventType: 'task'
          },
          {
            id: 'event-2',
            userId: 'user-2', // 不同的 userId
            content: 'Memory 2',
            timestamp: Date.now(),
            eventType: 'task'
          }
        ]
      } as EpisodicMemorySearchResponse);

      const structure = await builder.buildPrompt(messages, {
        memoryFilter: {
          userId: 'user-1',
          personaId: 'persona-1'
        }
      });

      expect(structure.memory).toContain('Memory 1');
      expect(structure.memory).not.toContain('Memory 2');
    });
  });

  describe('toMessages', () => {
    it('should convert prompt structure to messages array', () => {
      const structure = {
        system: 'System content',
        memory: 'Memory content',
        user: 'User content',
        toolInstr: 'Tool instruction'
      };

      const messages = builder.toMessages(structure);

      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('System content');
      expect(messages[0].content).toContain('[MEMORY]');
      expect(messages[0].content).toContain('Memory content');
      expect(messages[0].content).toContain('Tool instruction');

      const userMessage = messages.find((msg) => msg.role === 'user');
      expect(userMessage).toBeDefined();
      expect(userMessage?.content).toBe('User content');
    });

    it('should handle missing sections gracefully', () => {
      const structure = {
        user: 'User content only'
      };

      const messages = builder.toMessages(structure);

      expect(messages.length).toBe(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('User content only');
    });
  });

  describe('memory filtering', () => {
    it('should filter by userId', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Test' }
      ];

      mockEpisodicService.queryWindow.mockResolvedValue({
        events: [
          {
            id: 'event-1',
            userId: 'user-1',
            content: 'Memory for user-1',
            timestamp: Date.now(),
            eventType: 'task'
          },
          {
            id: 'event-2',
            userId: 'user-2',
            content: 'Memory for user-2',
            timestamp: Date.now(),
            eventType: 'task'
          }
        ]
      } as EpisodicMemorySearchResponse);

      const structure = await builder.buildPrompt(messages, {
        memoryFilter: {
          userId: 'user-1'
        }
      });

      expect(structure.memory).toContain('Memory for user-1');
      expect(structure.memory).not.toContain('Memory for user-2');
    });

    it('should filter by minImportance', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Test' }
      ];

      mockEpisodicService.queryWindow.mockResolvedValue({
        events: [
          {
            id: 'event-1',
            userId: 'user-1',
            content: 'High importance memory',
            timestamp: Date.now(),
            eventType: 'task',
            importance: 0.9
          },
          {
            id: 'event-2',
            userId: 'user-1',
            content: 'Low importance memory',
            timestamp: Date.now(),
            eventType: 'task',
            importance: 0.3
          }
        ]
      } as EpisodicMemorySearchResponse);

      const structure = await builder.buildPrompt(messages, {
        memoryFilter: {
          userId: 'user-1',
          minImportance: 0.5
        }
      });

      expect(structure.memory).toContain('High importance memory');
      expect(structure.memory).not.toContain('Low importance memory');
    });
  });
});

