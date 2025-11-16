/**
 * 情感标注集成测试
 * 测试EmotionEngine + RAGMemoryService的完整流程
 */

import { EmotionEngine } from '../../src/core/EmotionEngine';
import { RAGMemoryService } from '../../src/services/RAGMemoryService';
import { EmotionType } from '../../src/types/personality';

describe('Emotion Recording Integration', () => {
  let emotionEngine: EmotionEngine;
  let memoryService: RAGMemoryService;
  let mockRAGService: any;

  beforeEach(() => {
    // Mock RAG服务
    mockRAGService = {
      addDocument: jest.fn().mockResolvedValue(undefined),
      search: jest.fn().mockResolvedValue([])
    };

    // 创建EmotionEngine（快速模式）
    emotionEngine = new EmotionEngine({
      fastModeEnabled: true,
      cacheEnabled: true,
      recordingEnabled: false // 不使用EmotionEngine的记录，我们用ChatService直接调用MemoryService
    });
    
    // 创建MemoryService
    memoryService = new RAGMemoryService(mockRAGService, {
      defaultKnowledgeBase: 'test-kb',
      enableLogging: false
    });

    // 初始化
    emotionEngine.initialize();
  });

  describe('完整流程测试', () => {
    it('应该检测情感并记录到记忆系统', async () => {
      // 1. 用户发送开心的消息
      const userMessage = '太好了！今天真是个好日子！';
      
      // 2. 检测情感
      const emotion = await emotionEngine.detectEmotion(userMessage);
      expect(emotion.type).toBe(EmotionType.HAPPY);
      expect(emotion.intensity).toBeGreaterThan(0.5);
      
      // 3. 记录到记忆系统
      await memoryService.recordEmotion('user123', emotion, userMessage);
      
      // 4. 验证记录
      expect(mockRAGService.addDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          content: userMessage,
          knowledgeBase: 'test-kb',
          metadata: expect.objectContaining({
            source: 'emotion',
            emotion: expect.objectContaining({
              type: EmotionType.HAPPY,
              intensity: emotion.intensity
            }),
            tags: ['emotion:happy']
          })
        })
      );
    });

    it('应该检测负面情感并记录', async () => {
      const userMessage = '我最近心情很不好，感觉很沮丧';
      
      const emotion = await emotionEngine.detectEmotion(userMessage);
      expect(emotion.type).toBe(EmotionType.SAD);
      
      await memoryService.recordEmotion('user456', emotion, userMessage);
      
      expect(mockRAGService.addDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            emotion: expect.objectContaining({
              type: EmotionType.SAD
            }),
            tags: ['emotion:sad']
          })
        })
      );
    });

    it('应该记录不同强度的情感', async () => {
      // 轻微开心
      const mildMessage = '还不错';
      const mildEmotion = await emotionEngine.detectEmotion(mildMessage);
      await memoryService.recordEmotion('user789', mildEmotion, mildMessage);
      
      // 非常开心
      const strongMessage = '太棒了！简直无法置信！我好兴奋！';
      const strongEmotion = await emotionEngine.detectEmotion(strongMessage);
      await memoryService.recordEmotion('user789', strongEmotion, strongMessage);
      
      // 验证两次都记录了
      expect(mockRAGService.addDocument).toHaveBeenCalledTimes(2);
      
      // 验证强度差异
      const calls = mockRAGService.addDocument.mock.calls;
      const mildIntensity = calls[0][0].metadata.emotion.intensity;
      const strongIntensity = calls[1][0].metadata.emotion.intensity;
      
      expect(strongIntensity).toBeGreaterThanOrEqual(mildIntensity);
    });
  });

  describe('检索带情感的记录', () => {
    beforeEach(() => {
      // Mock搜索返回结果
      mockRAGService.search.mockResolvedValue([
        {
          id: 'memory-1',
          content: '我最近心情很不好',
          metadata: {
            userId: 'user123',
            timestamp: Date.now() - 86400000, // 1天前
            source: 'emotion',
            emotion: {
              type: EmotionType.SAD,
              intensity: 0.85,
              confidence: 0.9
            },
            tags: ['emotion:sad']
          },
          score: 0.95
        },
        {
          id: 'memory-2',
          content: '今天真开心',
          metadata: {
            userId: 'user123',
            timestamp: Date.now() - 3600000, // 1小时前
            source: 'emotion',
            emotion: {
              type: EmotionType.HAPPY,
              intensity: 0.9,
              confidence: 0.95
            },
            tags: ['emotion:happy']
          },
          score: 0.92
        }
      ]);
    });

    it('应该检索到带情感标签的记忆', async () => {
      const memories = await memoryService.recall('最近心情如何', {
        userId: 'user123'
      });
      
      expect(memories).toHaveLength(2);
      
      // 验证第一条记录包含情感信息
      expect(memories[0].metadata.emotion).toBeDefined();
      expect(memories[0].metadata.emotion.type).toBe(EmotionType.SAD);
      expect(memories[0].metadata.emotion.intensity).toBe(0.85);
      expect(memories[0].metadata.tags).toContain('emotion:sad');
      
      // 验证第二条记录
      expect(memories[1].metadata.emotion.type).toBe(EmotionType.HAPPY);
      expect(memories[1].metadata.emotion.intensity).toBe(0.9);
    });
  });

  describe('容错机制', () => {
    it('应该在记录失败时不阻塞流程', async () => {
      // 设置RAG服务抛出错误
      mockRAGService.addDocument.mockRejectedValueOnce(new Error('Storage failed'));
      
      const emotion = await emotionEngine.detectEmotion('我好开心');
      
      // 应该不抛出错误（catch block处理）
      await expect(
        memoryService.recordEmotion('user999', emotion, 'test')
      ).resolves.not.toThrow();
    });

    it('应该在RAG服务不可用时优雅降级', async () => {
      // 没有addDocument方法
      delete mockRAGService.addDocument;
      mockRAGService.addDocument = undefined;
      
      const emotion = await emotionEngine.detectEmotion('测试');
      
      // 应该记录警告但不抛出错误
      await expect(
        memoryService.recordEmotion('user000', emotion, 'test')
      ).resolves.not.toThrow();
    });
  });

  describe('性能测试', () => {
    it('应该快速检测情感（快速模式）', async () => {
      const startTime = Date.now();
      await emotionEngine.detectEmotion('我今天特别开心！');
      const duration = Date.now() - startTime;
      
      // 快速模式应该在毫秒级完成
      expect(duration).toBeLessThan(100);
    });

    it('应该缓存重复检测结果', async () => {
      const message = '好难过啊';
      
      const emotion1 = await emotionEngine.detectEmotion(message);
      const emotion2 = await emotionEngine.detectEmotion(message); // 相同消息
      
      // 应该返回相同的对象或值
      expect(emotion2.type).toBe(emotion1.type);
      expect(emotion2.intensity).toBe(emotion1.intensity);
    });
  });

  describe('现实场景模拟', () => {
    it('模拟一周的情感记录和检索', async () => {
      const userId = 'demo-user';
      
      // 模拟一周的情感变化
      const weeklyEmotions = [
        { message: '周一心情不错', expectedType: EmotionType.HAPPY },
        { message: '周二有点累', expectedType: EmotionType.NEUTRAL },
        { message: '周三很焦虑，要考试了', expectedType: EmotionType.ANXIOUS },
        { message: '周四考试过了，好开心', expectedType: EmotionType.HAPPY },
        { message: '周五和朋友吵架了，很生气', expectedType: EmotionType.ANGRY },
        { message: '周六和好了，太兴奋了', expectedType: EmotionType.EXCITED },
        { message: '周日在家休息，很平静', expectedType: EmotionType.NEUTRAL }
      ];
      
      // 记录每一天的情感
      const recordedEmotions = [];
      for (const item of weeklyEmotions) {
        const emotion = await emotionEngine.detectEmotion(item.message);
        await memoryService.recordEmotion(userId, emotion, item.message);
        recordedEmotions.push({ ...item, detected: emotion });
      }
      
      // 验证所有情感都被记录
      expect(mockRAGService.addDocument).toHaveBeenCalledTimes(7);
      
      // 验证情感类型分布
      const types = recordedEmotions.map(e => e.detected.type);
      expect(types).toContain(EmotionType.HAPPY);
      expect(types).toContain(EmotionType.ANXIOUS);
      expect(types).toContain(EmotionType.ANGRY);
      expect(types).toContain(EmotionType.EXCITED);
      
      console.log('\n📊 一周情感统计:');
      console.log(`总记录数: ${recordedEmotions.length}`);
      console.log('情感分布:');
      const emotionCount = new Map<EmotionType, number>();
      types.forEach(t => emotionCount.set(t, (emotionCount.get(t) || 0) + 1));
      emotionCount.forEach((count, type) => {
        console.log(`  ${type}: ${count}次`);
      });
    });
  });
});



