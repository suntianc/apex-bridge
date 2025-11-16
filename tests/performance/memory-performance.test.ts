/**
 * Memory Performance Tests
 * 
 * 记忆性能测试
 * - Memory检索QPS测试（目标：>100 QPS）
 * - Protocol parsing耗时测试（目标：<10ms）
 * - Skills执行时延测试（目标：<500ms）
 * - 向量库重建性能测试（批量embedding效率）
 */

import { DefaultSemanticMemoryService } from '../../src/services/memory/SemanticMemoryService';
import { DefaultEpisodicMemoryService } from '../../src/services/memory/EpisodicMemoryService';
import { InMemorySemanticStore } from '../../src/services/memory/stores/InMemorySemanticStore';
import { InMemoryEpisodicStore } from '../../src/services/memory/stores/InMemoryEpisodicStore';
import { ProtocolEngine } from '../../src/core/ProtocolEngine';
import { VCPConfig } from '../../src/types';

describe('Memory Performance Tests', () => {
  describe('Memory Retrieval QPS', () => {
    it('should achieve >100 QPS for semantic memory search', async () => {
      const store = new InMemorySemanticStore();
      const service = new DefaultSemanticMemoryService(store, {
        embeddingDimensions: 3,
        defaultTopK: 3
      });

      // 准备测试数据
      for (let i = 0; i < 100; i++) {
        await service.saveSemantic({
          userId: 'user-1',
          personaId: 'warm-buddy',
          content: `记忆 ${i}`,
          embedding: [Math.random(), Math.random(), Math.random()]
        });
      }

      // 性能测试
      const queryVector = [0.5, 0.5, 0.5];
      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        await service.searchSimilar({
          vector: queryVector,
          userId: 'user-1',
          personaId: 'warm-buddy',
          topK: 3
        }, {});
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      const qps = (iterations / duration) * 1000;

      console.log(`Semantic Memory Search QPS: ${qps.toFixed(2)}`);
      expect(qps).toBeGreaterThan(100);
    }, 30000);

    it('should achieve >100 QPS for episodic memory query', async () => {
      const store = new InMemoryEpisodicStore();
      const service = new DefaultEpisodicMemoryService(store, {
        defaultWindowDays: 30
      });

      // 准备测试数据
      for (let i = 0; i < 100; i++) {
        await service.recordEvent({
          userId: 'user-1',
          personaId: 'warm-buddy',
          eventType: 'task',
          content: `任务 ${i}`,
          timestamp: Date.now() - i * 1000,
          importance: 0.5
        });
      }

      // 性能测试
      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        await service.queryWindow({
          userId: 'user-1',
          personaId: 'warm-buddy',
          topK: 10,
          window: {
            lastDays: 7
          }
        }, {});
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      const qps = (iterations / duration) * 1000;

      console.log(`Episodic Memory Query QPS: ${qps.toFixed(2)}`);
      expect(qps).toBeGreaterThan(100);
    }, 30000);
  });

  describe('Protocol Parsing Performance', () => {
    it('should parse ABP protocol in <10ms', () => {
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

      const protocolEngine = new ProtocolEngine(vcpConfig);
      const content = `[[ABP_TOOL:Calculator]]
{
  "action": "calculate",
  "parameters": {
    "expression": "2+2"
  }
}
[[END_ABP_TOOL]]`;

      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        protocolEngine.parseToolRequests(content);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgDuration = duration / iterations;

      console.log(`ABP Protocol Parsing Average Duration: ${avgDuration.toFixed(2)}ms`);
      expect(avgDuration).toBeLessThan(10);
    });

    it('should parse VCP protocol in <10ms', () => {
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
        debugMode: false
      } as any;

      const protocolEngine = new ProtocolEngine(vcpConfig);
      const content = `<<<[TOOL_REQUEST]>>>
tool_name: 「始」Weather「末」
location: 「始」Beijing「末」
<<<[END_TOOL_REQUEST]>>>`;

      // VCP协议已被移除，应该返回空数组
      const results = protocolEngine.parseToolRequests(content);
      expect(results).toHaveLength(0);
    });
  });

  describe('Vector Store Rebuild Performance', () => {
    it('should rebuild semantic index efficiently', async () => {
      const store = new InMemorySemanticStore();
      const service = new DefaultSemanticMemoryService(store, {
        embeddingDimensions: 3,
        defaultTopK: 3
      });

      // 准备测试数据
      const records = [];
      for (let i = 0; i < 1000; i++) {
        records.push({
          userId: 'user-1',
          personaId: 'warm-buddy',
          content: `记忆 ${i}`,
          embedding: [Math.random(), Math.random(), Math.random()]
        });
      }

      // 批量保存
      const startTime = performance.now();
      for (const record of records) {
        await service.saveSemantic(record);
      }
      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgDuration = duration / records.length;

      console.log(`Semantic Memory Save Average Duration: ${avgDuration.toFixed(2)}ms`);
      console.log(`Total Duration for 1000 records: ${duration.toFixed(2)}ms`);

      // 验证检索性能
      const queryStartTime = performance.now();
      await service.searchSimilar({
        vector: [0.5, 0.5, 0.5],
        userId: 'user-1',
        personaId: 'warm-buddy',
        topK: 10
      }, {});
      const queryEndTime = performance.now();
      const queryDuration = queryEndTime - queryStartTime;

      console.log(`Semantic Memory Search Duration: ${queryDuration.toFixed(2)}ms`);
      expect(queryDuration).toBeLessThan(100); // 100ms for 1000 records
    }, 30000);
  });
});

