# ACE层级模型配置使用示例

本文档展示了如何使用AceLayerConfigService和ACE层级模型配置API来管理L1-L6层级的模型配置。

## 目录
- [概述](#概述)
- [数据库扩展](#数据库扩展)
- [服务端使用](#服务端使用)
- [API接口使用](#api接口使用)
- [完整示例](#完整示例)

## 概述

ACE（Artificial Cognitive Architecture）架构将智能系统分为6个层级，每个层级使用不同的模型以实现最优的性能和成本平衡：

- **L1 渴望层（道德约束）**: 伦理判断和道德约束
- **L2 全球战略层**: 长期规划和世界模型维护
- **L3 代理模型层**: 自我认知和能力边界管理
- **L4 执行功能层**: 任务拆解和流程控制
- **L5 认知控制层**: 快速推理和Scratchpad管理
- **L6 任务执行层**: 工具执行和直接操作

## 数据库扩展

数据库自动扩展，无需手动干预。初始化时会自动添加以下字段到 `llm_models` 表：

```sql
ALTER TABLE llm_models ADD COLUMN is_ace_layer_l1 INTEGER DEFAULT 0;
ALTER TABLE llm_models ADD COLUMN is_ace_layer_l2 INTEGER DEFAULT 0;
ALTER TABLE llm_models ADD COLUMN is_ace_layer_l3 INTEGER DEFAULT 0;
ALTER TABLE llm_models ADD COLUMN is_ace_layer_l4 INTEGER DEFAULT 0;
ALTER TABLE llm_models ADD COLUMN is_ace_layer_l5 INTEGER DEFAULT 0;
ALTER TABLE llm_models ADD COLUMN is_ace_layer_l6 INTEGER DEFAULT 0;
```

## 服务端使用

### 1. 获取服务实例

```typescript
import { AceLayerConfigService } from './src/services/AceLayerConfigService';

const aceLayerService = AceLayerConfigService.getInstance();
```

### 2. 获取层级模型

```typescript
// 获取L1层模型（渴望层 - 道德约束）
const l1Model = aceLayerService.getL1LayerModel();
if (l1Model) {
  console.log(`L1层模型: ${l1Model.modelName} (${l1Model.modelKey})`);
} else {
  console.log('L1层模型未配置');
}

// 获取L2层模型（全球战略层）
const l2Model = aceLayerService.getL2LayerModel();

// 获取L3层模型（代理模型层）
const l3Model = aceLayerService.getL3LayerModel();

// 获取L4层模型（执行功能层）
const l4Model = aceLayerService.getL4LayerModel();

// 获取L5层模型（认知控制层）
const l5Model = aceLayerService.getL5LayerModel();

// 获取L6层模型（任务执行层）
const l6Model = aceLayerService.getL6LayerModel();
```

### 3. 设置层级模型

```typescript
// 设置模型ID为1的模型为L1层模型
aceLayerService.setModelAsLayer(1, 'l1');

// 设置模型ID为2的模型为L2层模型
aceLayerService.setModelAsLayer(2, 'l2');

// 设置模型ID为3的模型为L3层模型
aceLayerService.setModelAsLayer(3, 'l3');
```

### 4. 获取所有层级模型

```typescript
const allLayers = aceLayerService.getAllLayerModels();
console.log('所有层级模型配置:', allLayers);

/*
输出示例:
{
  l1: {
    id: 1,
    modelKey: 'gpt-4',
    modelName: 'GPT-4',
    provider: 'openai'
  },
  l2: {
    id: 2,
    modelKey: 'gpt-4-turbo',
    modelName: 'GPT-4 Turbo',
    provider: 'openai'
  },
  l3: {
    id: 3,
    modelKey: 'gpt-3.5-turbo',
    modelName: 'GPT-3.5 Turbo',
    provider: 'openai'
  },
  l4: null,
  l5: null,
  l6: null
}
*/
```

### 5. 验证层级配置

```typescript
const validation = aceLayerService.validateAllLayers();
console.log('层级配置验证:', validation);

/*
输出示例:
{
  isValid: false,
  missingLayers: ['l4', 'l5', 'l6'],
  configuredLayers: ['l1', 'l2', 'l3']
}
*/
```

### 6. 获取推荐模型

```typescript
// 获取L1层推荐模型
const l1Recommended = aceLayerService.getRecommendedModels('l1');
console.log('L1层推荐模型:', l1Recommended);
// 输出: ['gpt-4', 'claude-3-5-sonnet', 'claude-3-opus']

// 获取L5层推荐模型
const l5Recommended = aceLayerService.getRecommendedModels('l5');
console.log('L5层推荐模型:', l5Recommended);
// 输出: ['llama-3-8b-instruct', 'gpt-3.5-turbo', 'claude-3-haiku']
```

### 7. 从层级移除模型

```typescript
// 从L1层移除模型
aceLayerService.removeModelFromLayer('l1');
```

### 8. 重置所有层级

```typescript
// 重置所有层级配置（警告：此操作将清除所有ACE层级配置）
aceLayerService.resetAllLayers();
```

### 9. 获取```typescript
// 获取L1层配置信息
const l1Config = aceLayerService.getLayerConfig('l1');
console.log层级配置信息

('L1层配置:', l1Config);

/*
输出示例:
{
  layer: 'l1',
  description: '渴望层（道德约束）',
  recommendedModels: ['gpt-4', 'claude-3-5-sonnet', 'claude-3-opus']
}
*/

// 获取所有层级配置
const allConfigs = aceLayerService.getAllLayerConfigs();
console.log('所有层级配置:', allConfigs);
```

## API接口使用

### 1. 获取所有层级模型配置

```bash
curl -X GET http://localhost:3000/api/ace/layers/models \
  -H "Authorization: Bearer your-api-key"
```

响应示例：
```json
{
  "success": true,
  "layers": {
    "l1": {
      "id": 1,
      "modelKey": "gpt-4",
      "modelName": "GPT-4",
      "provider": "openai"
    },
    "l2": null,
    "l3": null,
    "l4": null,
    "l5": null,
    "l6": null
  },
  "configs": {
    "l1": {
      "layer": "l1",
      "description": "渴望层（道德约束）",
      "recommendedModels": ["gpt-4", "claude-3-5-sonnet"]
    },
    ...
  },
  "stats": {
    "l1": true,
    "l2": false,
    "l3": false,
    "l4": false,
    "l5": false,
    "l6": false
  },
  "validation": {
    "isValid": false,
    "missingLayers": ["l2", "l3", "l4", "l5", "l6"],
    "configuredLayers": ["l1"]
  }
}
```

### 2. 获取指定层级模型

```bash
curl -X GET http://localhost:3000/api/ace/layers/l1/model \
  -H "Authorization: Bearer your-api-key"
```

响应示例：
```json
{
  "success": true,
  "layer": "l1",
  "config": {
    "layer": "l1",
    "description": "渴望层（道德约束）",
    "recommendedModels": ["gpt-4", "claude-3-5-sonnet"]
  },
  "model": {
    "id": 1,
    "modelKey": "gpt-4",
    "modelName": "GPT-4",
    "modelType": "nlp",
    "provider": "openai",
    "providerName": "OpenAI",
    "providerEnabled": true
  }
}
```

### 3. 获取层级推荐模型

```bash
curl -X GET http://localhost:3000/api/ace/layers/l1/recommended \
  -H "Authorization: Bearer your-api-key"
```

响应示例：
```json
{
  "success": true,
  "layer": "l1",
  "description": "渴望层（道德约束）",
  "recommendedModels": ["gpt-4", "claude-3-5-sonnet", "claude-3-opus"]
}
```

### 4. 验证所有层级配置

```bash
curl -X GET http://localhost:3000/api/ace/layers/validate \
  -H "Authorization: Bearer your-api-key"
```

响应示例：
```json
{
  "success": true,
  "isValid": false,
  "missingLayers": ["l2", "l3", "l4", "l5", "l6"],
  "configuredLayers": ["l1"],
  "stats": {
    "l1": true,
    "l2": false,
    "l3": false,
    "l4": false,
    "l5": false,
    "l6": false
  },
  "configs": {
    "l1": {
      "layer": "l1",
      "description": "渴望层（道德约束）",
      "recommendedModels": ["gpt-4", "claude-3-5-sonnet"]
    },
    ...
  }
}
```

### 5. 设置模型为指定层级

```bash
curl -X POST http://localhost:3000/api/ace/layers/l1/models \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{"modelId": 1}'
```

响应示例：
```json
{
  "success": true,
  "message": "Model 1 set as L1 layer",
  "layer": "l1",
  "modelId": 1
}
```

### 6. 快速配置层级模型（使用模型键）

```bash
curl -X POST http://localhost:3000/api/ace/layers/l1/quick-config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{"modelKey": "gpt-4"}'
```

响应示例：
```json
{
  "success": true,
  "message": "Model gpt-4 set as L1 layer",
  "layer": "l1",
  "model": {
    "id": 1,
    "modelKey": "gpt-4",
    "modelName": "GPT-4",
    "provider": "openai"
  }
}
```

### 7. 从指定层级移除模型

```bash
curl -X DELETE http://localhost:3000/api/ace/layers/l1/models \
  -H "Authorization: Bearer your-api-key"
```

响应示例：
```json
{
  "success": true,
  "message": "Model removed from L1 layer",
  "layer": "l1"
}
```

### 8. 重置所有层级配置

```bash
curl -X POST http://localhost:3000/api/ace/layers/reset \
  -H "Authorization: Bearer your-api-key"
```

响应示例：
```json
{
  "success": true,
  "message": "All ACE layer model configurations have been reset"
}
```

## 完整示例

以下是一个完整的示例，展示如何使用AceLayerConfigService：

```typescript
import { AceLayerConfigService } from './src/services/AceLayerConfigService';
import { LLMModelType } from './src/types/llm-models';

async function setupAceLayers() {
  const aceLayerService = AceLayerConfigService.getInstance();

  try {
    // 1. 验证当前配置
    console.log('=== 验证当前配置 ===');
    const validation = aceLayerService.validateAllLayers();
    console.log('配置完整性:', validation.isValid);
    console.log('已配置层级:', validation.configuredLayers);
    console.log('缺失层级:', validation.missingLayers);

    // 2. 设置L1层模型（渴望层 - 道德约束）
    console.log('\n=== 设置L1层模型 ===');
    const l1Models = aceLayerService.getRecommendedModels('l1');
    console.log('L1层推荐模型:', l1Models);
    // 假设我们选择GPT-4作为L1层模型
    aceLayerService.setModelAsLayer(1, 'l1');
    console.log('✅ L1层模型已设置为GPT-4');

    // 3. 设置L2层模型（全球战略层）
    console.log('\n=== 设置L2层模型 ===');
    const l2Models = aceLayerService.getRecommendedModels('l2');
    console.log('L2层推荐模型:', l2Models);
    // 假设我们选择GPT-4-Turbo作为L2层模型
    aceLayerService.setModelAsLayer(2, 'l2');
    console.log('✅ L2层模型已设置为GPT-4-Turbo');

    // 4. 设置L3层模型（代理模型层）
    console.log('\n=== 设置L3层模型 ===');
    const l3Models = aceLayerService.getRecommendedModels('l3');
    console.log('L3层推荐模型:', l3Models);
    // 假设我们选择GPT-3.5-Turbo作为L3层模型
    aceLayerService.setModelAsLayer(3, 'l3');
    console.log('✅ L3层模型已设置为GPT-3.5-Turbo');

    // 5. 设置L5层模型（认知控制层）
    console.log('\n=== 设置L5层模型 ===');
    const l5Models = aceLayerService.getRecommendedModels('l5');
    console.log('L5层推荐模型:', l5Models);
    // 假设我们选择Llama-3-8B-Instruct作为L5层模型
    aceLayerService.setModelAsLayer(4, 'l5');
    console.log('✅ L5层模型已设置为Llama-3-8B-Instruct');

    // 6. 获取所有层级模型
    console.log('\n=== 获取所有层级模型 ===');
    const allLayers = aceLayerService.getAllLayerModels();
    console.log('所有层级模型配置:');
    Object.entries(allLayers).forEach(([layer, model]) => {
      if (model) {
        console.log(`  ${layer.toUpperCase()}: ${model.modelName} (${model.modelKey}) [${model.provider}]`);
      } else {
        console.log(`  ${layer.toUpperCase()}: 未配置`);
      }
    });

    // 7. 最终验证
    console.log('\n=== 最终验证 ===');
    const finalValidation = aceLayerService.validateAllLayers();
    console.log('配置完整性:', finalValidation.isValid);
    console.log('已配置层级:', finalValidation.configuredLayers);
    console.log('缺失层级:', finalValidation.missingLayers);

    // 8. 获取层级模型统计
    console.log('\n=== 层级模型统计 ===');
    const stats = aceLayerService.getLayerModelStats();
    console.log('统计信息:');
    Object.entries(stats).forEach(([layer, hasModel]) => {
      const config = aceLayerService.getLayerConfig(layer as any);
      console.log(`  ${layer.toUpperCase()}: ${hasModel ? '✅' : '❌'} - ${config.description}`);
    });

    console.log('\n✅ ACE层级模型配置完成！');

  } catch (error) {
    console.error('❌ 配置过程中发生错误:', error);
  }
}

// 运行示例
setupAceLayers();
```

运行此示例后，您将看到类似以下的输出：

```
=== 验证当前配置 ===
配置完整性: false
已配置层级: []
缺失层级: ["l1", "l2", "l3", "l4", "l5", "l6"]

=== 设置L1层模型 ===
L1层推荐模型: ["gpt-4", "claude-3-5-sonnet", "claude-3-opus"]
✅ L1层模型已设置为GPT-4

=== 设置L2层模型 ===
L2层推荐模型: ["gpt-4-turbo", "claude-3-opus"]
✅ L2层模型已设置为GPT-4-Turbo

=== 设置L3层模型 ===
L3层推荐模型: ["gpt-4", "claude-3-haiku"]
✅ L3层模型已设置为GPT-3.5-Turbo

=== 设置L5层模型 ===
L5层推荐模型: ["llama-3-8b-instruct", "gpt-3.5-turbo", "claude-3-haiku"]
✅ L5层模型已设置为Llama-3-8B-Instruct

=== 获取所有层级模型 ===
所有层级模型配置:
  L1: GPT-4 (gpt-4) [openai]
  L2: GPT-4 Turbo (gpt-4-turbo) [openai]
  L3: GPT-3.5 Turbo (gpt-3.5-turbo) [openai]
  L4: 未配置
  L5: Llama-3-8B-Instruct (llama-3-8b-instruct) [ollama]
  L6: 未配置

=== 最终验证 ===
配置完整性: false
已配置层级: ["l1", "l2", "l3", "l5"]
缺失层级: ["l4", "l6"]

=== 层级模型统计 ===
统计信息:
  L1: ✅ - 渴望层（道德约束）
  L2: ✅ - 全球战略层
  L3: ✅ - 代理模型层
  L4: ❌ - 执行功能层
  L5: ✅ - 认知控制层
  L6: ❌ - 任务执行层

✅ ACE层级模型配置完成！
```

## 注意事项

1. **数据库事务**: 所有层级设置操作使用数据库事务确保原子性
2. **唯一性**: 每个层级只能有一个模型
3. **推荐模型**: 系统为每个层级提供了推荐模型列表
4. **兼容性**: 与现有LLMConfigService完全兼容
5. **日志记录**: 所有操作都有详细的日志记录

## 相关文档

- [LLMConfigService API文档](../src/services/LLMConfigService.ts)
- [ACE架构实现方案](../openspec/ACE-Architecture-Implementation.md)
- [API文档](../src/api/controllers/AceLayerController.ts)
