# 测试说明

## PersonalityEngine 测试

### 运行测试

```bash
# 安装依赖（如果还没有）
npm install --save-dev jest @types/jest ts-jest

# 运行所有测试
npm test

# 运行特定测试文件
npm test -- PersonalityEngine.test.ts

# 监听模式（开发时使用）
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

### 测试覆盖范围

PersonalityEngine 测试覆盖以下功能：

1. **构造函数和初始化**
   - 默认配置初始化
   - 自定义配置初始化
   - 默认人格加载

2. **JSON配置加载**
   - 有效JSON配置加载
   - 无效JSON错误处理
   - 必需字段验证

3. **TXT配置向后兼容**
   - TXT文件加载
   - 名字和头像提取
   - 兼容模式标记

4. **System Prompt构建**
   - JSON配置的Prompt构建
   - TXT配置的Prompt构建
   - 缓存机制

5. **消息注入**
   - 人格System Prompt插入
   - 用户System消息保留
   - 消息顺序验证

6. **缓存功能**
   - 人格配置缓存
   - System Prompt缓存
   - 缓存清除

7. **默认人格Fallback**
   - 不存在人格的Fallback
   - 默认人格创建

8. **Agent ID验证**
   - 无效ID拒绝
   - 中文字符支持

9. **多人格切换**
   - 不同人格加载
   - 人格切换验证

10. **刷新功能**
    - 人格刷新
    - 文件重新加载

### 测试文件结构

```
tests/
└── core/
    └── PersonalityEngine.test.ts  # PersonalityEngine单元测试
```

### 注意事项

- 测试使用了 `fs` 模块的 mock，模拟文件系统操作
- 测试使用了 `logger` 模块的 mock，避免控制台输出干扰
- 所有测试都是独立的，可以并行运行
- 测试不依赖实际的文件系统，完全使用mock

