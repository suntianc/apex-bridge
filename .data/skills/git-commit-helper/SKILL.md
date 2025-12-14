---
name: "git-commit-helper"
description: "Git提交信息生成助手，帮助开发者编写规范、清晰、语义化的提交信息，支持多种项目类型和场景"
version: "1.0"
author: "Development Team"
tags: ["git", "version-control", "commit", "development", "workflow"]
---

# Git提交信息生成助手

## 核心能力

本Skill专注于帮助开发者编写高质量的Git提交信息：

**提交规范**：
- 遵循约定式提交（Conventional Commits）标准
- 适配不同项目类型的提交规范
- 自动生成分类标签和类型前缀

**信息提取**：
- 从代码变更中提取关键信息
- 识别变更类型和影响范围
- 自动关联相关的Issue/PR

**质量优化**：
- 生成清晰、简洁的提交信息
- 避免模糊和冗余的描述
- 保持一致的格式和风格

## 触发场景

**当用户请求以下内容时自动激活**：
- "帮我写一个git提交信息"
- "这个代码变更应该怎么提交？"
- "生成符合规范的commit message"
- "git commit信息模板"
- "如何写好git提交信息？"
- "这个修复应该用什么提交类型？"

**不适用于**：
- 纯理论研究（不涉及具体代码变更）
- 其他版本控制系统（SVN、Mercurial等）
- 与Git无关的技术问题

## 快速指导

### 约定式提交格式（参考`structure/conventional-commits.md`）

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**常用类型**：
- `feat`: 新功能
- `fix`: 修复bug
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建或辅助工具变动

### 提交信息三原则（参考`techniques/three-principles.md`）

1. **简洁性**：用最少的词表达最清楚的意思
2. **一致性**：使用统一的格式和术语
3. **可读性**：让其他开发者快速理解变更内容

## 详细资源说明

**核心技术**：
- `techniques/commit-types.md` - 详细的提交类型说明
- `techniques/three-principles.md` - 编写高质量提交信息的三大原则
- `techniques/scope-guidelines.md` - 作用域使用指南

**结构模板**：
- `structure/conventional-commits.md` - 约定式提交规范详解
- `structure/body-writing.md` - 提交信息正文编写技巧
- `structure/footer-guidelines.md` - 页脚信息使用指南

**经典案例**：
- `examples/good-commits.md` - 优秀提交信息案例分析
- `examples/bad-commits.md` - 常见错误提交信息及修正
- `examples/project-specific.md` - 不同项目类型的提交示例

**实用模板**：
- `templates/basic-templates.md` - 基础提交信息模板
- `templates/feature-templates.md` - 功能开发提交模板
- `templates/bugfix-templates.md` - Bug修复提交模板
- `templates/refactor-templates.md` - 重构提交模板

*这些资源文件包含了完整的Git提交信息编写指南和实用案例*

## 常见问题解答

**Q: 如何选择合适的提交类型？**
A: 参考`techniques/commit-types.md`，根据变更的性质选择最匹配的类型。如果变更同时属于多个类型，选择最主要的类型。

**Q: 提交信息应该写多长？**
A: 标题控制在50字符以内，正文每行72字符内。简洁明了比详细描述更重要。

**Q: 如何处理一次提交包含多个不相关的变更？**
A: 拆分提交，每个提交只包含一个逻辑变更。如果确实无法拆分，在正文中清晰说明包含的多个变更。

**Q: 英文不好，提交信息可以用中文吗？**
A: 可以，但需要团队内部统一标准。开源项目建议使用英文，团队项目可以统一使用中文。

**Q: 何时使用Scope（作用域）？**
A: Scope用于说明变更影响的模块（如`feat(auth):`），大型项目中建议使用，小型项目可以省略。

## 进阶技巧

1. **自动生成提交信息**：使用工具根据Diff自动生成初稿
2. **团队规范集成**：将提交规范集成到CI/CD流程中
3. **自动化检查**：使用Git Hook或GitHub Actions检查提交信息质量
4. **变更日志生成**：基于提交信息自动生成CHANGELOG

## 最佳实践

1. **使用现在时**：用"add"而不是"added"
2. **避免句号**：提交信息标题末尾不要加句号
3. **一致性优先**：团队内部保持统一的提交风格
4. **定期回顾**：定期检查提交历史，确保质量

---

**使用提示**：本Skill专注于Git提交信息编写。如需其他Git操作指导（如分支管理、合并策略等），请明确指定具体需求。
