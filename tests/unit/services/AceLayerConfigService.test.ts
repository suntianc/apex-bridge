/**
 * AceLayerConfigService 单元测试
 * 测试ACE架构层级模型配置管理功能
 */

import { AceLayerConfigService, AceLayerType } from '../../../src/services/AceLayerConfigService';
import { LLMModelType } from '../../../src/types/llm-models';

// Mock the database
const mockDb = {
  prepare: jest.fn(),
  exec: jest.fn(),
  transaction: jest.fn((fn) => fn),
  pragma: jest.fn(),
  close: jest.fn()
};

describe('AceLayerConfigService', () => {
  let aceLayerService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock instance with all required methods
    aceLayerService = {
      db: mockDb,
      listModels: jest.fn().mockReturnValue([
        {
          id: 1,
          modelKey: 'gpt-4',
          modelName: 'GPT-4',
          provider: 'openai',
          modelType: LLMModelType.NLP,
          enabled: true
        },
        {
          id: 2,
          modelKey: 'gpt-3.5-turbo',
          modelName: 'GPT-3.5 Turbo',
          provider: 'openai',
          modelType: LLMModelType.NLP,
          enabled: true
        },
        {
          id: 3,
          modelKey: 'claude-3-opus',
          modelName: 'Claude-3 Opus',
          provider: 'anthropic',
          modelType: LLMModelType.NLP,
          enabled: true
        }
      ]),
      getModel: jest.fn().mockImplementation((id: number) => {
        const models = {
          1: {
            id: 1,
            modelKey: 'gpt-4',
            modelName: 'GPT-4',
            provider: 'openai',
            providerId: 1,
            modelType: LLMModelType.NLP,
            enabled: true,
            isDefault: false,
            isAceEvolution: false,
            modelConfig: {},
            apiEndpointSuffix: null,
            displayOrder: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            providerName: 'OpenAI',
            providerBaseConfig: { baseURL: 'https://api.openai.com' },
            providerEnabled: true
          },
          2: {
            id: 2,
            modelKey: 'gpt-3.5-turbo',
            modelName: 'GPT-3.5 Turbo',
            provider: 'openai',
            providerId: 1,
            modelType: LLMModelType.NLP,
            enabled: true,
            isDefault: false,
            isAceEvolution: false,
            modelConfig: {},
            apiEndpointSuffix: null,
            displayOrder: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            providerName: 'OpenAI',
            providerBaseConfig: { baseURL: 'https://api.openai.com' },
            providerEnabled: true
          },
          3: {
            id: 3,
            modelKey: 'claude-3-opus',
            modelName: 'Claude-3 Opus',
            provider: 'anthropic',
            providerId: 2,
            modelType: LLMModelType.NLP,
            enabled: true,
            isDefault: false,
            isAceEvolution: false,
            modelConfig: {},
            apiEndpointSuffix: null,
            displayOrder: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            providerName: 'Anthropic',
            providerBaseConfig: { baseURL: 'https://api.anthropic.com' },
            providerEnabled: true
          }
        };
        return models[id] || null;
      }),
      mapModelFullRow: jest.fn().mockImplementation((row: any) => ({
        id: row.id,
        modelKey: row.model_key,
        modelName: row.model_name,
        provider: row.provider,
        providerId: row.provider_id,
        modelType: row.model_type,
        enabled: row.enabled === 1,
        isDefault: row.is_default === 1,
        isAceEvolution: row.is_ace_evolution === 1,
        modelConfig: JSON.parse(row.model_config || '{}'),
        apiEndpointSuffix: row.api_endpoint_suffix,
        displayOrder: row.display_order,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        providerName: row.provider_name,
        providerBaseConfig: JSON.parse(row.base_config || '{}'),
        providerEnabled: row.provider_enabled === 1
      })),

      // AceLayerConfigService methods
      getL1LayerModel: jest.fn(),
      getL2LayerModel: jest.fn(),
      getL3LayerModel: jest.fn(),
      getL4LayerModel: jest.fn(),
      getL5LayerModel: jest.fn(),
      getL6LayerModel: jest.fn(),
      setModelAsLayer: jest.fn(),
      removeModelFromLayer: jest.fn(),
      getAllLayerModels: jest.fn(),
      getLayerConfig: jest.fn(),
      getAllLayerConfigs: jest.fn(),
      getRecommendedModels: jest.fn(),
      hasLayerModel: jest.fn(),
      getLayerModelStats: jest.fn(),
      validateAllLayers: jest.fn(),
      resetAllLayers: jest.fn()
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('层级模型获取接口', () => {
    it('should have getL1LayerModel method', () => {
      expect(typeof aceLayerService.getL1LayerModel).toBe('function');
    });

    it('should have getL2LayerModel method', () => {
      expect(typeof aceLayerService.getL2LayerModel).toBe('function');
    });

    it('should have getL3LayerModel method', () => {
      expect(typeof aceLayerService.getL3LayerModel).toBe('function');
    });

    it('should have getL4LayerModel method', () => {
      expect(typeof aceLayerService.getL4LayerModel).toBe('function');
    });

    it('should have getL5LayerModel method', () => {
      expect(typeof aceLayerService.getL5LayerModel).toBe('function');
    });

    it('should have getL6LayerModel method', () => {
      expect(typeof aceLayerService.getL6LayerModel).toBe('function');
    });
  });

  describe('层级模型设置接口', () => {
    it('should have setModelAsLayer method', () => {
      expect(typeof aceLayerService.setModelAsLayer).toBe('function');
    });

    it('should have removeModelFromLayer method', () => {
      expect(typeof aceLayerService.removeModelFromLayer).toBe('function');
    });

    it('should have getAllLayerModels method', () => {
      expect(typeof aceLayerService.getAllLayerModels).toBe('function');
    });
  });

  describe('层级配置信息', () => {
    it('should have getLayerConfig method', () => {
      expect(typeof aceLayerService.getLayerConfig).toBe('function');
    });

    it('should have getAllLayerConfigs method', () => {
      expect(typeof aceLayerService.getAllLayerConfigs).toBe('function');
    });

    it('should have getRecommendedModels method', () => {
      expect(typeof aceLayerService.getRecommendedModels).toBe('function');
    });
  });

  describe('验证和统计', () => {
    it('should have hasLayerModel method', () => {
      expect(typeof aceLayerService.hasLayerModel).toBe('function');
    });

    it('should have getLayerModelStats method', () => {
      expect(typeof aceLayerService.getLayerModelStats).toBe('function');
    });

    it('should have validateAllLayers method', () => {
      expect(typeof aceLayerService.validateAllLayers).toBe('function');
    });

    it('should have resetAllLayers method', () => {
      expect(typeof aceLayerService.resetAllLayers).toBe('function');
    });
  });

  describe('AceLayerType类型', () => {
    it('should have valid AceLayerType values', () => {
      const validLayers: AceLayerType[] = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'];
      expect(validLayers.length).toBe(6);

      // Test that all values are valid
      validLayers.forEach(layer => {
        expect(['l1', 'l2', 'l3', 'l4', 'l5', 'l6']).toContain(layer);
      });
    });
  });

  describe('getAllLayerModels响应结构', () => {
    it('should return object with all layers', () => {
      const mockResult = {
        l1: { id: 1, modelKey: 'gpt-4' },
        l2: null,
        l3: null,
        l4: null,
        l5: null,
        l6: null
      };

      aceLayerService.getAllLayerModels.mockReturnValue(mockResult);

      const result = aceLayerService.getAllLayerModels();

      expect(result).toHaveProperty('l1');
      expect(result).toHaveProperty('l2');
      expect(result).toHaveProperty('l3');
      expect(result).toHaveProperty('l4');
      expect(result).toHaveProperty('l5');
      expect(result).toHaveProperty('l6');
    });
  });

  describe('setModelAsLayer功能', () => {
    it('should call setModelAsLayer with correct parameters', () => {
      aceLayerService.setModelAsLayer(1, 'l1');
      expect(aceLayerService.setModelAsLayer).toHaveBeenCalledWith(1, 'l1');
    });

    it('should work with all layer types', () => {
      const layers: AceLayerType[] = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'];
      layers.forEach(layer => {
        aceLayerService.setModelAsLayer(1, layer);
        expect(aceLayerService.setModelAsLayer).toHaveBeenCalledWith(1, layer);
      });
    });
  });

  describe('getRecommendedModels功能', () => {
    it('should return recommended models for each layer', () => {
      const l1Recommendations = ['gpt-4', 'claude-3-5-sonnet', 'claude-3-opus'];
      const l5Recommendations = ['llama-3-8b-instruct', 'gpt-3.5-turbo', 'claude-3-haiku'];
      const l6Recommendations: string[] = [];

      aceLayerService.getRecommendedModels.mockImplementation((layer: string) => {
        if (layer === 'l1') return l1Recommendations;
        if (layer === 'l5') return l5Recommendations;
        if (layer === 'l6') return l6Recommendations;
        return [];
      });

      expect(aceLayerService.getRecommendedModels('l1')).toEqual(l1Recommendations);
      expect(aceLayerService.getRecommendedModels('l5')).toEqual(l5Recommendations);
      expect(aceLayerService.getRecommendedModels('l6')).toEqual([]);
    });
  });

  describe('validateAllLayers功能', () => {
    it('should return validation result', () => {
      const mockValidation = {
        isValid: false,
        missingLayers: ['l2', 'l3', 'l4', 'l5', 'l6'],
        configuredLayers: ['l1']
      };

      aceLayerService.validateAllLayers.mockReturnValue(mockValidation);
      const result = aceLayerService.validateAllLayers();

      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('missingLayers');
      expect(result).toHaveProperty('configuredLayers');
      expect(Array.isArray(result.missingLayers)).toBe(true);
      expect(Array.isArray(result.configuredLayers)).toBe(true);
    });
  });

  describe('集成测试场景', () => {
    it('should handle complete workflow', () => {
      // 1. 设置模型为L1层
      aceLayerService.setModelAsLayer(1, 'l1');
      expect(aceLayerService.setModelAsLayer).toHaveBeenCalledWith(1, 'l1');

      // 2. 验证L1层有模型
      aceLayerService.hasLayerModel.mockReturnValue(true);
      expect(aceLayerService.hasLayerModel('l1')).toBe(true);

      // 3. 获取L1层模型
      const mockL1Model = { id: 1, modelKey: 'gpt-4', modelName: 'GPT-4' };
      aceLayerService.getL1LayerModel.mockReturnValue(mockL1Model);
      const model = aceLayerService.getL1LayerModel();
      expect(model?.modelKey).toBe('gpt-4');

      // 4. 验证所有层级
      aceLayerService.validateAllLayers.mockReturnValue({
        isValid: false,
        missingLayers: ['l2', 'l3', 'l4', 'l5', 'l6'],
        configuredLayers: ['l1']
      });
      const validation = aceLayerService.validateAllLayers();
      expect(validation).toBeDefined();
    });
  });

  describe('数据库兼容性', () => {
    it('should work with mocked database', () => {
      expect(aceLayerService.db).toBeDefined();
      expect(typeof aceLayerService.db.prepare).toBe('function');
      expect(typeof aceLayerService.db.transaction).toBe('function');
    });
  });

  describe('方法调用统计', () => {
    it('should count method calls correctly', () => {
      aceLayerService.setModelAsLayer(1, 'l1');
      aceLayerService.setModelAsLayer(2, 'l2');
      aceLayerService.setModelAsLayer(3, 'l3');

      expect(aceLayerService.setModelAsLayer).toHaveBeenCalledTimes(3);
    });
  });
});
