## Why

Apex Bridge v2.0需要支持人格化AI交互，让每个AI拥有独特的性格、说话方式和行为模式，这是区别于普通AI助手的核心差异化特性。当前系统虽然支持Agent文件，但缺乏结构化的人格配置和动态System Prompt构建能力。

## What Changes

- 新增PersonalityEngine核心类，支持加载JSON格式的人格配置文件
- 向后兼容现有的Agent/目录中的.txt格式文件
- 实现动态System Prompt构建，基于人格配置生成个性化提示词
- 集成到ChatService，在调用LLM前注入人格
- 支持通过agent_id参数切换不同人格
- 添加3个预装人格配置示例（专业助手、温暖伙伴、活泼助手）
- 实现缓存机制提升性能

**BREAKING**: 无，完全向后兼容

## Impact

- Affected specs: 新增`personality`能力（capability）
- Affected code:
  - `src/core/PersonalityEngine.ts` (新增)
  - `src/types/personality.ts` (新增)
  - `src/services/ChatService.ts` (修改，集成人格注入)
  - `src/api/controllers/ChatController.ts` (修改，支持agent_id参数)
  - `config/personality/` (新增目录和配置文件)

