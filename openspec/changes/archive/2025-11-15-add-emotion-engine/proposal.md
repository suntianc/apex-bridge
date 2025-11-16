## Why

Apex Bridge v2.0需要让AI能够识别用户情绪并做出共情响应，这是提升用户体验和温度感的核心功能。当前系统虽然支持人格化，但缺乏情感识别和共情能力，无法根据用户情绪调整回复风格。

## What Changes

- 新增EmotionEngine核心类，实现基于LLM的快速情感识别
- 定义6种情感类型（happy/sad/angry/excited/neutral/anxious）
- 实现情感响应模板库（不同人格对不同情感有不同的响应模板）
- 集成到ChatService，在调用LLM前识别用户情感并调整回复风格
- 支持情感记录（存储到记忆系统，可选）
- 优化性能，确保情感识别延迟 < 100ms

**BREAKING**: 无，完全向后兼容

## Impact

- Affected specs: 新增`emotion`能力（capability）
- Affected code:
  - `src/core/EmotionEngine.ts` (新增)
  - `src/types/personality.ts` (扩展，已有EmotionType和Emotion接口)
  - `src/services/ChatService.ts` (修改，集成情感识别)
  - `config/emotion/` (新增目录，情感响应模板)
- Dependencies:
  - PersonalityEngine (M1.1) - 已完成 ✅
  - LLMClient - 已存在 ✅

