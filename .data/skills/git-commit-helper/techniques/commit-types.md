# 提交类型详细说明

## 约定式提交类型

### feat - 新功能
**用途**：添加新功能、特性或模块

**示例**：
```
feat(auth): add OAuth2 login support
feat(api): implement user profile endpoint
feat(ui): add dark mode toggle
```

**注意事项**：
- 即使很小的功能也使用`feat`
- 新增依赖库也属于`feat`
- 不要在feat中修复bug

---

### fix - 修复bug
**用途**：修复bug、热修复、补丁

**示例**：
```
fix(api): handle null pointer in user service
fix(ui): resolve button alignment issue in mobile view
fix(auth): timeout exception when validating token
```

**注意事项**：
- 明确说明修复了什么问题
- 如果有Bug编号，在Footer中关联
- 不要在fix中同时添加新功能

---

### docs - 文档更新
**用途**：文档相关的所有变更

**示例**：
```
docs(readme): update installation instructions
docs(api): add authentication section
docs: update contribution guidelines
```

**注意事项**：
- 包括README、注释、API文档等
- 格式调整（如缩进、空行）也属于docs
- 不要在docs中修改代码

---

### style - 代码格式
**用途**：不影响代码含义的变更

**示例**：
```
style(ui): fix indentation in CSS
style(code): remove unused imports
style(format): adjust line spacing
```

**注意事项**：
- ESLint、Prettier自动修复的变更
- 不影响代码逻辑的变更
- 不要用style修复功能性问题

---

### refactor - 重构
**用途**：既不修复bug也不添加功能的代码变更

**示例**：
```
refactor(auth): extract token validation to separate module
refactor(ui): simplify component structure
refactor(api): improve error handling pattern
```

**注意事项**：
- 改善代码结构但不改变行为
- 提高代码质量但不修复问题
- 不要在refactor中修复bug或添加功能

---

### perf - 性能优化
**用途**：提高性能的代码变更

**示例**：
```
perf(api): optimize database query with index
perf(ui): reduce bundle size by code splitting
perf(cache): implement LRU cache for session storage
```

**注意事项**：
- 明确说明性能提升
- 提供具体指标（如果可能）
- 不要用perf做无关的代码调整

---

### test - 测试相关
**用途**：添加或修改测试

**示例**：
```
test(auth): add unit tests for login function
test(api): increase test coverage for user endpoints
test(ui): add E2E tests for checkout flow
```

**注意事项**：
- 包括单元测试、集成测试、E2E测试
- 测试环境的配置变更
- 不要用test修改生产代码

---

### build - 构建系统
**用途**：影响构建系统或外部依赖的变更

**示例**：
```
build: upgrade webpack to v5
build(deps): update React to 18.0
build: configure Docker image for production
```

**注意事项**：
- 包括打包工具、依赖库升级
- 构建脚本的修改
- 部署配置的变更

---

### ci - 持续集成
**用途**：CI配置文件和脚本的变更

**示例**：
```
ci: add GitHub Actions workflow for testing
ci: configure pre-commit hooks
ci: update Node.js version in pipeline
```

**注意事项**：
- GitHub Actions、GitLab CI、Jenkins等配置
- CI/CD脚本的修改
- 自动化工具的配置文件

---

### chore - 其他变更
**用途**：不属于其他类型的辅助性变更

**示例**：
```
chore: update .gitignore to exclude logs
chore: reorganize project structure
chore: add pre-commit hooks
```

**注意事项**：
- 项目维护类变更
- 工具配置的调整
- 不要用chore修复问题或添加功能

---

### revert - 回滚
**用途**：回滚之前的提交

**示例**：
```
revert: feat(auth): add OAuth2 login support

This reverts commit abc1234567890def1234567890abcdef12345678.
```

**注意事项**：
- 自动生成，通常不需要手动编写
- 包含被回滚提交的SHA
- 简要说明回滚原因

---

## 类型选择决策树

```
变更是否修复了bug？
├─ 是 → 使用 fix
└─ 否 → 是否添加了新功能？
    ├─ 是 → 使用 feat
    └─ 否 → 是否修改了文档？
        ├─ 是 → 使用 docs
        └─ 否 → 是否只调整了格式？
            ├─ 是 → 使用 style
            └─ 否 → 是否重构了代码？
                ├─ 是 → 使用 refactor
                └─ 否 → 是否提升了性能？
                    ├─ 是 → 使用 perf
                    └─ 否 → 是否添加/修改了测试？
                        ├─ 是 → 使用 test
                        └─ 否 → 是否影响构建？
                            ├─ 是 → 使用 build/ci
                            └─ 否 → 使用 chore
```

## 最佳实践

### 1. 单一职责原则
每个提交应该只包含一个类型的变更：
```
❌ 错误：feat(auth): add login and fix validation bug
✅ 正确：
  1. feat(auth): add OAuth2 login support
  2. fix(auth): resolve validation timeout issue
```

### 2. 优先使用具体类型
选择最匹配变更性质的类型：
```
❌ 错误：chore: implement new API endpoint
✅ 正确：feat(api): add user profile endpoint
```

### 3. 保持一致性
团队内统一使用相同的类型标准：
- 在代码规范中明确列出所有可用类型
- 在代码审查中检查类型选择的正确性
- 使用工具自动检查提交信息格式

### 4. Scope的使用
Scope用于细化变更的范围：
```
feat(auth): add OAuth2 login
feat(auth, ui): add login page
feat(ui): add dark mode  # 无需scope，因为变更明确
```

## 常见错误

### 错误1：使用错误的类型
```
❌ feat: update documentation
✅ docs: update documentation

❌ fix: refactor user service
✅ refactor: simplify user service
```

### 错误2：类型描述不一致
```
❌ feat: removed old API
✅ feat: add new API endpoint

❌ docs: fixed typo
✅ docs: correct typo in README
```

### 错误3：混合多种类型
```
❌ feat: add login and fix bug and update docs
✅ 应拆分为：
  - feat: add OAuth2 login
  - fix: resolve validation timeout
  - docs: update authentication guide
```

---

记住：选择正确的提交类型是编写高质量提交信息的第一步。它帮助团队快速理解每次变更的性质和重要性。
