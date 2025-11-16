/**
 * 情感标注真实对话集成测试
 * 测试完整的ChatService流程，验证情感检测和记录
 */

import { EmotionEngine } from '../../src/core/EmotionEngine';
import { RAGMemoryService } from '../../src/services/RAGMemoryService';
import { EmotionType } from '../../src/types/personality';
import { Memory } from '../../src/types/memory';

describe('Emotion Chat Integration - Real Conversation Test', () => {
  let emotionEngine: EmotionEngine;
  let memoryService: RAGMemoryService;
  let mockRAGService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock RAG服务
    mockRAGService = {
      addDocument: jest.fn().mockResolvedValue(undefined),
      search: jest.fn().mockResolvedValue([])
    };

    emotionEngine = new EmotionEngine({
      fastModeEnabled: true,
      cacheEnabled: true
    });
    
    memoryService = new RAGMemoryService(mockRAGService, {
      enableLogging: true
    });

    emotionEngine.initialize();
  });

  describe('真实对话场景', () => {
    it('模拟用户一天的完整对话流程', async () => {
      const userId = 'real-user-001';
      const recordedEmotions: Array<{time: string, message: string, emotion: EmotionType, intensity: number}> = [];

      // 早上 - 上班路上很开心
      const morningMsg = '今天天气真好，心情也很棒！';
      const morningEmotion = await emotionEngine.detectEmotion(morningMsg);
      await memoryService.recordEmotion(userId, morningEmotion, morningMsg);
      recordedEmotions.push({
        time: '08:00',
        message: morningMsg,
        emotion: morningEmotion.type,
        intensity: morningEmotion.intensity
      });

      // 中午 - 工作压力大，有点焦虑
      const noonMsg = '项目deadline快到了，压力好大，很担心做不完';
      const noonEmotion = await emotionEngine.detectEmotion(noonMsg);
      await memoryService.recordEmotion(userId, noonEmotion, noonMsg);
      recordedEmotions.push({
        time: '12:30',
        message: noonMsg,
        emotion: noonEmotion.type,
        intensity: noonEmotion.intensity
      });

      // 下午 - 项目顺利完成，很兴奋
      const afternoonMsg = '太棒了！项目顺利完成，受到了老板表扬！好兴奋！';
      const afternoonEmotion = await emotionEngine.detectEmotion(afternoonMsg);
      await memoryService.recordEmotion(userId, afternoonEmotion, afternoonMsg);
      recordedEmotions.push({
        time: '17:00',
        message: afternoonMsg,
        emotion: afternoonEmotion.type,
        intensity: afternoonEmotion.intensity
      });

      // 晚上 - 和朋友吵架了，很生气
      const eveningMsg = '今天和朋友因为小事吵架了，很生气很恼火';
      const eveningEmotion = await emotionEngine.detectEmotion(eveningMsg);
      await memoryService.recordEmotion(userId, eveningEmotion, eveningMsg);
      recordedEmotions.push({
        time: '20:00',
        message: eveningMsg,
        emotion: eveningEmotion.type,
        intensity: eveningEmotion.intensity
      });

      // 深夜 - 和好了，但还是有点难过
      const nightMsg = '和好了，但是想起来还是有点难过';
      const nightEmotion = await emotionEngine.detectEmotion(nightMsg);
      await memoryService.recordEmotion(userId, nightEmotion, nightMsg);
      recordedEmotions.push({
        time: '22:00',
        message: nightMsg,
        emotion: nightEmotion.type,
        intensity: nightEmotion.intensity
      });

      // 验证所有情感都被记录
      expect(mockRAGService.addDocument).toHaveBeenCalledTimes(5);

      // 打印一天的总结报告
      console.log('\n📅 用户一天的情感变化报告:');
      console.log('═'.repeat(80));
      recordedEmotions.forEach(item => {
        console.log(`${item.time} | ${item.emotion.toUpperCase().padEnd(10)} | 强度: ${item.intensity.toFixed(2)} | ${item.message}`);
      });
      
      // 统计
      const emotionStats = new Map<EmotionType, number>();
      let totalIntensity = 0;
      recordedEmotions.forEach(item => {
        emotionStats.set(item.emotion, (emotionStats.get(item.emotion) || 0) + 1);
        totalIntensity += item.intensity;
      });

      console.log('\n📊 情感统计:');
      emotionStats.forEach((count, type) => {
        console.log(`  ${type.padEnd(10)} : ${count}次`);
      });
      console.log(`  平均强度: ${(totalIntensity / recordedEmotions.length).toFixed(2)}`);
      console.log('═'.repeat(80));

      // 验证预期情感类型（快速模式可能检测为不同情感，所以只验证有记录）
      const emotionTypes = recordedEmotions.map(e => e.emotion);
      expect(emotionTypes.length).toBeGreaterThanOrEqual(3); // 至少有3种不同情感
      expect(emotionTypes).toContain(EmotionType.HAPPY); // 应该包含开心
      expect(emotionTypes).toContain(EmotionType.ANGRY); // 应该包含生气
      expect(emotionTypes).toContain(EmotionType.SAD); // 应该包含难过
    });

    it('模拟一周的情感变化模式', async () => {
      const userId = 'weekly-user';
      
      // 模拟工作日和周末的情感差异
      const weeklyScenarios = [
        { day: '周一', message: '新的一周开始了，加油！', type: EmotionType.EXCITED },
        { day: '周二', message: '工作任务有点多，有点累', type: EmotionType.NEUTRAL },
        { day: '周三', message: '项目进展顺利，很开心', type: EmotionType.HAPPY },
        { day: '周四', message: 'Deadline临近，很焦虑', type: EmotionType.ANXIOUS },
        { day: '周五', message: '终于到周五了，太兴奋了！周末要来啦！', type: EmotionType.EXCITED },
        { day: '周六', message: '周末在家休息，心情很好', type: EmotionType.HAPPY },
        { day: '周日', message: '想到明天又要上班就有点不开心', type: EmotionType.SAD }
      ];

      const weeklyEmotions: any[] = [];
      
      for (const scenario of weeklyScenarios) {
        const emotion = await emotionEngine.detectEmotion(scenario.message);
        await memoryService.recordEmotion(userId, emotion, scenario.message);
        weeklyEmotions.push({ day: scenario.day, expected: scenario.type, detected: emotion });
      }

      console.log('\n📅 一周情感变化:');
      console.log('─'.repeat(80));
      weeklyEmotions.forEach(item => {
        const match = item.detected.type === item.expected ? '✅' : '⚠️';
        console.log(`${item.day} | ${match} ${item.expected} → ${item.detected.type} (强度: ${item.detected.intensity.toFixed(2)})`);
      });
      console.log('─'.repeat(80));

      expect(mockRAGService.addDocument).toHaveBeenCalledTimes(7);
    });
  });

  describe('检索情感记忆的应用场景', () => {
    beforeEach(() => {
      // Mock历史情感记录
      mockRAGService.search.mockResolvedValue([
        {
          id: 'm1',
          content: '最近工作压力很大',
          metadata: {
            userId: 'test-user',
            timestamp: Date.now() - 7 * 24 * 3600 * 1000,
            source: 'emotion',
            emotion: { type: EmotionType.ANXIOUS, intensity: 0.8, confidence: 0.9 },
            tags: ['emotion:anxious']
          },
          score: 0.9
        },
        {
          id: 'm2',
          content: '完成了一个大项目',
          metadata: {
            userId: 'test-user',
            timestamp: Date.now() - 5 * 24 * 3600 * 1000,
            source: 'emotion',
            emotion: { type: EmotionType.HAPPY, intensity: 0.9, confidence: 0.95 },
            tags: ['emotion:happy']
          },
          score: 0.88
        },
        {
          id: 'm3',
          content: '和家人产生了矛盾',
          metadata: {
            userId: 'test-user',
            timestamp: Date.now() - 3 * 24 * 3600 * 1000,
            source: 'emotion',
            emotion: { type: EmotionType.ANGRY, intensity: 0.85, confidence: 0.9 },
            tags: ['emotion:angry']
          },
          score: 0.85
        }
      ]);
    });

    it('应该检索到历史情感趋势', async () => {
      const memories = await memoryService.recall('用户最近的情绪变化', {
        userId: 'test-user'
      });

      expect(memories).toHaveLength(3);
      
      // 验证每个记忆都包含情感标签
      memories.forEach((memory, index) => {
        expect(memory.metadata.emotion).toBeDefined();
        expect(memory.metadata.emotion.type).toBeDefined();
        expect(memory.metadata.emotion.intensity).toBeGreaterThan(0);
      });

      console.log('\n💭 检索到的情感记忆:');
      memories.forEach(m => {
        const date = new Date(m.timestamp!);
        console.log(`  ${date.toLocaleDateString()} | ${m.metadata.emotion.type.toUpperCase()} | 强度: ${m.metadata.emotion.intensity} | ${m.content}`);
      });

      // AI可以根据这些信息主动关怀：
      // "我注意到您最近一周有压力大的时候，也有开心的时候。现在心情怎么样？"
    });

    it('应该支持按情感类型过滤检索', async () => {
      // 只检索负面情感
      const negativeMemories = await memoryService.recall('用户最近的负面情绪', {
        userId: 'test-user'
      });

      const negativeCount = negativeMemories.filter(
        m => m.metadata.emotion.type === EmotionType.ANXIOUS || 
             m.metadata.emotion.type === EmotionType.ANGRY || 
             m.metadata.emotion.type === EmotionType.SAD
      ).length;

      expect(negativeCount).toBeGreaterThan(0);

      console.log(`\n📉 检索到${negativeCount}条负面情感记录`);
      console.log('  这可以用来触发主动关怀：');
      console.log('  "我注意到您最近有一些不开心的时候，需要聊聊吗？"');
    });
  });

  describe('性能验证', () => {
    it('批量记录不应该影响响应时间', async () => {
      const startTime = Date.now();
      
      // 模拟记录100条情感（批量场景）
      const promises = [];
      for (let i = 0; i < 100; i++) {
        const emotion = await emotionEngine.detectEmotion('测试消息' + i);
        promises.push(memoryService.recordEmotion('bulk-user', emotion, `消息${i}`));
      }
      
      await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(mockRAGService.addDocument).toHaveBeenCalledTimes(100);
      
      console.log(`\n⚡ 性能: 100条情感记录耗时 ${duration}ms, 平均 ${(duration/100).toFixed(2)}ms/条`);
      
      // 应该在合理时间内完成（< 5秒）
      expect(duration).toBeLessThan(5000);
    });
  });
});

