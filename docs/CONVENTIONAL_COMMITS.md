# Conventional Commits 规范

> **文档目的**: 建立 ApexBridge 项目的标准化提交信息格式，提高代码历史可读性和自动化维护能力

## 📋 规范概述

本规范基于 [Conventional Commits](https://www.conventionalcommits.org/) 规范，结合项目特点制定了适合 ApexBridge 的提交信息格式。

### 🎯 核心目标

- **提高可读性** - 清晰的提交历史，便于代码审查
- **自动化支持** - 支持自动生成 changelog 和版本管理
- **团队协作** - 统一的提交格式，降低沟通成本
- **问题追踪** - 方便关联 issue 和 PR

## 📝 提交信息格式

### 🔧 基本格式

```bash
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### 📋 组成部分

1. **Type (类型)**: 必需，说明提交的性质
2. **Scope (范围)**: 可选，说明影响的模块
3. **Description (描述)**: 必需，简洁的变更说明
4. **Body (正文)**: 可选，详细的变更说明
5. **Footer (脚注)**: 可选，关联信息和 breaking changes

## 🏷️ 类型 (Type) 定义

### 📦 主要类型

| 类型 | 描述 | 示例 |
|------|------|------|
| **feat** | 新功能 | `feat: add user authentication` |
| **fix** | 修复bug | `fix: resolve memory leak in RAG service` |
| **docs** | 文档更新 | `docs: update API documentation` |
| **style** | 代码格式 | `style: format code with prettier` |
| **refactor** | 重构代码 | `refactor: improve RAG service architecture` |
| **test** | 测试相关 | `test: add unit tests for personality engine` |
| **chore** | 构建过程 | `chore: update dependencies` |

### 🔧 特殊类型

| 类型 | 描述 | 使用场景 |
|------|------|----------|
| **perf** | 性能优化 | `perf: improve search performance by 50%` |
| **ci** | CI/CD配置 | `ci: add GitHub Actions workflow` |
| **build** | 构建系统 | `build: upgrade webpack to v5` |
| **revert** | 回滚提交 | `revert: feat: add experimental feature` |

## 🎯 范围 (Scope) 定义

### 🏗️ 核心模块

| 模块 | 范围标识 | 示例 |
|------|----------|------|
| **VCP引擎** | `vcp`, `engine` | `feat(vcp): add plugin hot-reload` |
| **LLM客户端** | `llm`, `client` | `fix(llm): resolve DeepSeek API timeout` |
| **人格引擎** | `personality`, `personas` | `feat(personality): support dynamic persona switching` |
| **情感引擎** | `emotion`, `emotional` | `refactor(emotion): improve emotion calculation algorithm` |
| **RAG服务** | `rag`, `search` | `feat(rag): add semantic group expansion` |
| **插件系统** | `plugin`, `plugins` | `feat(plugins): add service plugin type` |
| **API接口** | `api`, `routes` | `fix(api): correct response format in chat endpoint` |
| **管理后台** | `admin`, `dashboard` | `feat(admin): add real-time monitoring` |
| **配置系统** | `config`, `settings` | `fix(config): resolve environment variable loading` |

### 📦 子项目

| 项目 | 范围标识 | 示例 |
|------|----------|------|
| **RAG包** | `rag-package`, `vcp-rag` | `feat(rag-package): add caching layer` |
| **SDK包** | `sdk-package`, `vcp-sdk` | `fix(sdk-package): resolve WebSocket connection issue` |

## 💬 描述 (Description) 规范

### ✅ 好的描述

- 使用现在时态: "add" 而不是 "added" 或 "adds"
- 小写字母开头
- 简洁明了，不超过50个字符
- 说明"做什么"而不是"怎么做"

### ❌ 不好的描述

- 模糊不清: `fix bug`
- 过于详细: `implement a new function to handle user authentication by checking credentials against database`
- 包含不必要的上下文: `as requested in issue #123`

### ✅ 示例对比

| 好的示例 | 不好的示例 |
|----------|------------|
| `feat: add user authentication` | `feat: implement user authentication system` |
| `fix: resolve memory leak in RAG service` | `fix: fix memory issue` |
| `docs: update installation guide` | `docs: updated docs` |

## 📄 正文 (Body) 规范

### 📝 格式要求

- 可选内容，详细描述变更
- 与描述之间空一行
- 每行不超过72个字符
- 使用什么、为什么、怎么做的结构

### 📋 内容结构

```text
简要说明变更的动机和原因。

详细描述变更的具体内容，包括：
- 实现的技术方案
- 影响的范围
- 使用的方法或算法

关闭的issue: Fixes #123
```

### ✅ 正文示例

```text
Add support for multiple embedding providers to improve RAG service
flexibility and reduce dependency on single API provider.

The implementation includes:
- Abstract embedding service interface
- Support for OpenAI, Qwen, and custom providers
- Automatic failover mechanism
- Performance optimization with connection pooling

This change allows users to:
- Choose from multiple embedding services
- Implement custom embedding providers
- Improve service reliability with failover

Closes #156, #157
```

## 🔗 脚注 (Footer) 规范

### 🔗 关联 Issues

```text
Fixes #123
Closes #456
Refs #789
```

### 💥 Breaking Changes

```text
BREAKING CHANGE: RAG service API has been updated to support multiple
knowledge bases. Existing code using single knowledge base needs to be
updated to specify knowledgeBase parameter.
```

### 🔐 安全相关

```text
Security: fix potential XSS vulnerability in admin dashboard
```

## 🎨 实际示例

### 📦 新功能提交

```text
feat(rag): add semantic group expansion

Implement semantic group expansion to improve RAG search relevance
by expanding queries with semantically related terms.

The feature includes:
- Configurable expansion rules
- Support for multiple expansion strategies
- Performance optimization with caching

This improves search recall by ~15% while maintaining precision.

Closes #234
```

### 🔧 修复提交

```text
fix(llm): resolve rate limiting error with DeepSeek API

Add retry mechanism and exponential backoff for DeepSeek API requests
to handle rate limiting gracefully.

The issue occurred when multiple concurrent requests exceeded API limits.
Now implements:
- Automatic retry with exponential backoff
- Request queuing to avoid rate limits
- Better error messages for rate limit errors

Fixes #189
```

### 📚 文档提交

```text
docs(readme): improve installation instructions

Update README.md with clearer installation steps and troubleshooting
guide for common setup issues.

Changes include:
- Step-by-step installation guide
- Common problems and solutions
- Environment variable examples
- Verification commands

Based on user feedback from issue #145.
```

### 🔄 重构提交

```text
refactor(personality): improve persona loading performance

Optimize persona loading mechanism by implementing lazy loading
and caching to reduce startup time.

Previous implementation loaded all personas at startup, causing
delays. New approach:
- Load personas on-demand
- Cache frequently used personas
- Preload default persona only

Improves startup time by ~60% for large persona sets.

Performance impact:
- Startup time: 2.3s -> 0.9s
- Memory usage: +15MB for cache
- First load time: similar performance
```

## 🤖 自动化集成

### 📋 Commitlint 配置

```json
// commitlint.config.js
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'chore',
        'ci',
        'build',
        'revert'
      ]
    ],
    'scope-enum': [
      2,
      'always',
      [
        'vcp',
        'llm',
        'personality',
        'emotion',
        'rag',
        'plugins',
        'api',
        'admin',
        'config',
        'rag-package',
        'sdk-package'
      ]
    ],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
    'subject-max-length': [2, 'always', 50],
    'body-max-line-length': [2, 'always', 72]
  }
};
```

### 🔄 自动 Changelog

```json
// package.json
{
  "scripts": {
    "release": "conventional-changelog -i CHANGELOG.md -s",
    "release:minor": "conventional-changelog -i CHANGELOG.md -s -r 0",
    "release:major": "conventional-changelog -i CHANGELOG.md -s -r 1"
  },
  "devDependencies": {
    "@commitlint/cli": "^17.0.0",
    "@commitlint/config-conventional": "^17.0.0",
    "conventional-changelog-cli": "^2.0.0",
    "husky": "^8.0.0",
    "lint-staged": "^13.0.0"
  }
}
```

### 🪝 Git Hooks

```json
// package.json
{
  "husky": {
    "hooks": {
      "commit-msg": "commitlint -E HUSKY_GIT_PARAMS",
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.{js,ts}": ["eslint --fix", "prettier --write"],
    "*.{md,json}": ["prettier --write"]
  }
}
```

## 📞 工具和资源

### 🛠️ 推荐工具

- **VS Code 扩展**: Conventional Commits
- **命令行工具**: commitizen, cz-conventional-changelog
- **验证工具**: commitlint
- **自动化工具**: standard-version, conventional-changelog

### 📚 学习资源

- **官方规范**: https://www.conventionalcommits.org/
- **详细指南**: https://github.com/conventional-changelog/commitlint
- **最佳实践**: https://www.alexluong.com/posts/5-tips-for-better-commit-messages/

## 🎯 执行计划

### 🚀 实施步骤

1. **配置工具**
   ```bash
   npm install --save-dev @commitlint/cli @commitlint/config-conventional husky lint-staged
   ```

2. **创建配置文件**
   - 添加 `commitlint.config.js`
   - 更新 `package.json` scripts
   - 配置 Git hooks

3. **团队培训**
   - 讲解规范内容
   - 演示工具使用
   - 提供示例参考

4. **逐步迁移**
   - 新功能开发使用新规范
   - 修复重要bug时使用新规范
   - 完全迁移后严格执行

### 📊 监控和改进

- **定期审查**: 每月检查提交信息质量
- **收集反馈**: 从团队成员收集使用体验
- **持续改进**: 根据实际使用情况调整规范

---

**文档维护**: 项目开发团队
**版本**: v1.0
**最后更新**: 2025-11-13

遵循这个规范，我们的代码历史将更加清晰，自动化程度更高，团队协作更高效！ 🚀