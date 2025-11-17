/**
 * ABP Variable Engine Tests
 * 
 * ABP变量引擎单元测试
 */

import { ABPVariableEngine } from '../../../src/core/protocol/ABPVariableEngine';
import { VariableEngine } from '../../../src/core/variable/VariableEngine';
import { IVariableProvider, VariableContext } from '../../../src/types/variable';

// Mock VariableProvider for testing (使用独立实现的接口)
class MockVariableProvider implements IVariableProvider {
  name: string;
  namespace: string;
  private values: Map<string, string>;

  constructor(name: string, namespace: string) {
    this.name = name;
    this.namespace = namespace;
    this.values = new Map();
  }

  setValue(key: string, value: string): void {
    this.values.set(key, value);
  }

  async resolve(key: string, context?: VariableContext): Promise<string | null> {
    // 解析 key 格式: namespace:variableKey
    const parts = key.split(':');
    if (parts.length === 2 && parts[0] === this.namespace) {
      const variableKey = parts[1];
      if (this.values.has(variableKey)) {
        return this.values.get(variableKey) as string;
      }
    }
    return null;
  }

  getSupportedKeys(): string[] {
    return Array.from(this.values.keys()).map(key => `${this.namespace}:${key}`);
  }
}

describe('ABPVariableEngine', () => {
  let variableEngine: VariableEngine;
  let abpVariableEngine: ABPVariableEngine;

  beforeEach(() => {
    variableEngine = new VariableEngine();
    abpVariableEngine = new ABPVariableEngine(variableEngine, {
      cacheEnabled: true,
      cacheTTL: 1000, // 1秒，方便测试
    });
  });

  describe('resolveAll', () => {
    it('should resolve variables using VariableEngine', async () => {
      const provider = new MockVariableProvider('test', 'test');
      provider.setValue('var1', 'value1');
      // 先注册到variableEngine，然后ABPVariableEngine会使用它
      variableEngine.registerProvider(provider);

      const content = 'Hello {{test:var1}}';
      const result = await abpVariableEngine.resolveAll(content);

      expect(result).toBe('Hello value1');
    });

    it('should cache resolved values when cache is enabled', async () => {
      const provider = new MockVariableProvider('test', 'test');
      provider.setValue('var1', 'value1');
      variableEngine.registerProvider(provider);

      const content = 'Hello {{test:var1}}';
      
      // First call
      const result1 = await abpVariableEngine.resolveAll(content);
      expect(result1).toBe('Hello value1');

      // Change value
      provider.setValue('var1', 'value2');

      // Second call should use cache (within TTL)
      const result2 = await abpVariableEngine.resolveAll(content);
      expect(result2).toBe('Hello value1'); // Should use cached value

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Third call should use new value
      const result3 = await abpVariableEngine.resolveAll(content);
      expect(result3).toBe('Hello value2');
    });

    it('should not cache when cache is disabled', async () => {
      const engineNoCache = new ABPVariableEngine(variableEngine, {
        cacheEnabled: false,
      });

      const provider = new MockVariableProvider('test', 'test');
      provider.setValue('var1', 'value1');
      variableEngine.registerProvider(provider);

      const content = 'Hello {{test:var1}}';
      
      const result1 = await engineNoCache.resolveAll(content);
      expect(result1).toBe('Hello value1');

      // Change value
      provider.setValue('var1', 'value2');

      // Should use new value immediately (no cache)
      const result2 = await engineNoCache.resolveAll(content);
      expect(result2).toBe('Hello value2');
    });

    it('should handle multiple variables', async () => {
      const provider1 = new MockVariableProvider('test1', 'test1');
      provider1.setValue('var1', 'value1');
      variableEngine.registerProvider(provider1);

      const provider2 = new MockVariableProvider('test2', 'test2');
      provider2.setValue('var2', 'value2');
      variableEngine.registerProvider(provider2);

      const content = 'Hello {{test1:var1}} and {{test2:var2}}';
      const result = await abpVariableEngine.resolveAll(content);

      expect(result).toBe('Hello value1 and value2');
    });

    it('should handle context parameter', async () => {
      const provider = new MockVariableProvider('test', 'test');
      provider.setValue('var1', 'value1');
      variableEngine.registerProvider(provider);

      const content = 'Hello {{test:var1}}';
      const context = { userId: 'user123' };
      
      const result = await abpVariableEngine.resolveAll(content, context);

      expect(result).toBe('Hello value1');
    });
  });

  describe('Provider Management', () => {
    it('should register and use providers', async () => {
      const provider = new MockVariableProvider('test', 'test');
      provider.setValue('var1', 'value1');
      
      variableEngine.registerProvider(provider);
      abpVariableEngine.registerProvider(provider);

      const providers = abpVariableEngine.getProviders();
      expect(providers).toContain(provider);
    });

    it('should remove providers', () => {
      const provider = new MockVariableProvider('test', 'test');
      variableEngine.registerProvider(provider);
      abpVariableEngine.registerProvider(provider);

      expect(abpVariableEngine.getProviders()).toContain(provider);

      abpVariableEngine.removeProvider('test');

      const providers = abpVariableEngine.getProviders();
      expect(providers).not.toContain(provider);
    });

    it('should get VariableEngine instance', () => {
      const engine = abpVariableEngine.getVCPVariableEngine();
      expect(engine).toBe(variableEngine);
    });
  });

  describe('Cache Management', () => {
    it('should clear cache', async () => {
      const provider = new MockVariableProvider('test', 'test');
      provider.setValue('var1', 'value1');
      variableEngine.registerProvider(provider);

      const content = 'Hello {{test:var1}}';
      
      // Resolve to populate cache
      await abpVariableEngine.resolveAll(content);

      // Change value
      provider.setValue('var1', 'value2');

      // Should use cached value
      let result = await abpVariableEngine.resolveAll(content);
      expect(result).toBe('Hello value1');

      // Clear cache
      abpVariableEngine.clearCache();

      // Should use new value
      result = await abpVariableEngine.resolveAll(content);
      expect(result).toBe('Hello value2');
    });
  });
});

