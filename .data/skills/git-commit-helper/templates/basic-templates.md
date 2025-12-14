# 基础提交模板

## 标准模板

### 通用模板
```
<type>(<scope>): <subject>

<body>

<footer>
```

### 模板说明
- **type:** 提交类型（feat, fix, docs等）
- **scope:** 影响范围（可选，如auth, ui, api等）
- **subject:** 简短描述（50字符内）
- **body:** 详细说明（解释为什么和怎么做）
- **footer:** 关联信息和破坏性变更

---

## 功能开发模板

### 新功能
```
feat(<scope>): <short description>

Add <feature name> functionality:

Added:
- <feature point 1>
- <feature point 2>
- <feature point 3>

<Additional context or requirements>

Closes #<issue number>
```

### 示例
```
feat(auth): add OAuth2 login support

Add OAuth2 authentication flow supporting Google and GitHub:

Added:
- OAuth2 client configuration
- Secure token handling
- User model extensions
- Login UI with provider selection

Requires OAuth app registration

Closes #123
```

---

## Bug修复模板

### 常规修复
```
fix(<scope>): <short description>

<Problem description>

Fixed:
- <fix point 1>
- <fix point 2>
- <fix point 3>

Before: <what was wrong>
After: <what is fixed>

Fixes #<issue number>
```

### 示例
```
fix(auth): handle token expiration edge case

When a token expires exactly at request time, the system
was throwing unhandled exceptions.

Fixed:
- Add try-catch for token validation
- Return proper 401 response
- Clear client-side session data

Before: 500 errors on token expiration
After: Clean 401 responses with user-friendly messages

Fixes #234
```

---

## 文档更新模板

### 文档添加
```
docs(<scope>): <short description>

Add <documentation type> for <subject>:

Added:
- <doc point 1>
- <doc point 2>
- <doc point 3>

Includes code examples and best practices.

Closes #<issue number>
```

### 示例
```
docs(api): add authentication guide

Add comprehensive authentication documentation:

Added:
- OAuth2 flow with code examples
- JWT token lifecycle explanation
- Error handling best practices
- Security considerations and common pitfalls

Includes curl examples and Postman collection.

Closes #345
```

---

## 重构模板

### 代码重构
```
refactor(<scope>): <short description>

Extract <what> to improve <benefits>:

Changes:
- <change 1>
- <change 2>
- <change 3>

No functional changes, only code organization.
This sets up for future features without breaking changes.

All tests pass, +<number> new unit tests added.
```

### 示例
```
refactor(auth): extract validation logic

Extract validation logic from user controller to separate
service to improve code reusability and testability:

Changes:
- Create UserValidationService
- Add comprehensive input sanitization
- Implement consistent error messages
- Improve test coverage to 95%

No functional changes, only code organization improvements.

All tests pass, +120 new unit tests added.
```

---

## 性能优化模板

### 性能提升
```
perf(<scope>): <short description>

<Optimization description>:

Optimizations:
- <optimization 1>
- <optimization 2>
- <optimization 3>

Results:
- <metric>: <before> -> <after> (<improvement>%)

Requires <requirements if any>

Closes #<issue number>
```

### 示例
```
perf(db): optimize user search query

Replace naive search implementation with Elasticsearch:

Optimizations:
- Index user profiles in Elasticsearch cluster
- Add search filters for name, email, status
- Implement fuzzy matching for typos
- Cache frequent queries with 5min TTL

Results:
- Search time: 1200ms -> 45ms (96% improvement)
- Memory usage: -40%
- Throughput: +300% (from 50 to 200 req/s)

Requires elasticsearch@8.0+ cluster

Closes #456
```

---

## 测试相关模板

### 测试添加
```
test(<scope>): <short description>

Add comprehensive test coverage for <subject>:

Added:
- <test type 1> for <scenario>
- <test type 2> for <scenario>
- <test type 3> for <scenario>

Coverage:
- Lines: <before>% → <after>% (+<increase>%)
- Branches: <before>% → <after>% (+<increase>%)

All tests pass in CI pipeline (<execution time>)

Closes #<issue number>
```

### 示例
```
test(api): add integration tests for user endpoints

Add comprehensive integration test suite:

Added:
- User registration flow (happy path + edge cases)
- Login with valid/invalid credentials
- Password reset flow
- Rate limiting behavior

Coverage:
- Lines: 65% → 89% (+24%)
- Branches: 58% → 82% (+24%)

All tests pass in CI pipeline (2m 15s execution time)

Closes #567
```

---

## 破坏性变更模板

### 重大更新
```
feat(<scope>)!: <short description>

BREAKING CHANGE: <brief description>

Migration guide:
1. <step 1>
2. <step 2>
3. <step 3>

Benefits:
- <benefit 1>
- <benefit 2>
- <benefit 3>

<Additional context or timeline>

Closes #<issue number>
Refs #<related issues>
```

### 示例
```
feat(api)!: migrate to GraphQL

BREAKING CHANGE: REST API removed, GraphQL API required

Migration guide:
1. Install @company/graphql-client v2.0+
2. Update all API calls to GraphQL queries
3. Replace REST endpoints with GraphQL operations
4. Update error handling (GraphQL errors format)

Benefits:
- 60% reduction in network requests
- Strongly-typed schema with TypeScript
- Better development experience with auto-completion
- Efficient data fetching with query batching

Migration period: 2 weeks (until 2024-02-01)
Support for REST API ends: 2024-02-15

Closes #678
Refs #567, #589
```

---

## 回滚模板

### 回滚提交
```
revert: <original commit hash>

<Original commit message>

This reverts commit <commit hash>.

Reason: <brief reason for revert>

See: #<issue number>
```

### 示例
```
revert: feat(auth): add OAuth2 login support

This reverts commit abc123def456.

Reason: Critical security vulnerability discovered
in OAuth2 implementation. Full fix in #123.

See: #123, #124
```

---

## 合并模板

### 分支合并
```
merge branch '<branch-name>' into <target-branch>

Conflicts resolved:
- <file 1>
- <file 2>

Signed-off-by: <name> <email>
```

### 示例
```
merge branch 'feature/new-ui' into main

Conflicts resolved:
- src/components/Login.tsx
- src/pages/Dashboard.tsx

Signed-off-by: Jane Smith <jane@company.com>
```

---

## 多作者模板

### 协作开发
```
feat(<scope>): <short description>

<Description>

Co-authored-by: <name> <email>
Co-authored-by: <name> <email>

<Additional context>

Closes #<issue number>
```

### 示例
```
feat(auth): implement multi-factor authentication

Add TOTP-based two-factor authentication:

Features:
- Generate/validate TOTP secrets
- 2FA setup and verification UI
- Encrypted TOTP secret storage
- Backup codes for account recovery

Co-authored-by: Alice Johnson <alice@company.com>
Co-authored-by: Bob Chen <bob@company.com>

Requires database migration script (see PR #789)

Closes #789
```

---

## 快速参考模板

### 提交类型选择
- **feat:** 新功能
- **fix:** Bug修复
- **docs:** 文档更新
- **style:** 代码格式（不影响代码运行的变动）
- **refactor:** 重构（即不是新增功能，也不是修改bug的代码变动）
- **perf:** 性能优化
- **test:** 增加测试
- **build:** 构建系统或外部依赖变动
- **ci:** 持续集成配置文件和脚本变动
- **chore:** 其他修改（不修改src或测试文件的变动）
- **revert:** 回滚之前的提交

### 模板速查表

| 类型 | 场景 | 关键词 |
|------|------|--------|
| feat | 新功能 | Add, Implement, Create |
| fix | Bug修复 | Fix, Resolve, Handle |
| docs | 文档 | Add, Update, Create |
| refactor | 重构 | Extract, Simplify, Improve |
| perf | 性能 | Optimize, Improve, Reduce |
| test | 测试 | Add, Improve, Expand |
| style | 格式 | Format, Lint, Style |
| build | 构建 | Update, Configure, Migrate |
| ci | CI/CD | Update, Fix, Configure |
| chore | 其他 | Update, Maintain, Update |

### 常用Footer关键词

| 关键词 | 含义 | GitHub行为 |
|--------|------|------------|
| Closes #123 | 关闭Issue | 自动关闭 |
| Fixes #123 | 修复Bug | 自动关闭 |
| Resolves #123 | 解决问题 | 自动关闭 |
| Refs #123 | 关联Issue | 创建引用 |
| See #123 | 查看参考 | 创建引用 |
| BREAKING CHANGE | 破坏性变更 | 标记为Major |
| Signed-off-by | 署名 | 添加DCO |
| Co-authored-by | 共同作者 | 显示多作者 |

---

## 使用指南

### 选择模板
1. 确定提交类型（feat, fix, docs等）
2. 选择对应模板
3. 填充具体信息
4. 检查长度限制

### 定制化
- 根据团队约定调整模板
- 添加项目特定字段
- 保持格式一致性

### 工具集成
- 配置IDE模板
- 使用commit hooks
- 集成CI检查

---

**记住：** 模板是起点，不是终点。根据具体情况调整，保持清晰和准确。
