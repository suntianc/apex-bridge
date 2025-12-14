# 提交正文编写指南

## 核心原则

### 1. 使用现在时
- ✅ Use: "Add feature" not "Added feature"
- ✅ Use: "Fix bug" not "Fixed bug"
- ✅ Use: "Change API" not "Changed API"

**原因：** 提交信息描述的是这个提交做了什么，而不是之前的状态

### 2. 使用祈使句
- ✅ Use: "Update documentation"
- ✅ Use: "Refactor authentication logic"
- ❌ Avoid: "Updating documentation"
- ❌ Avoid: "Refactored authentication logic"

### 3. 长度控制
- **标题：** 50字符以内
- **正文：** 每行72字符以内（便于在终端显示）
- **完整信息：** 包含标题和正文，不超过整个提交信息的1/3

## 正文结构

### 标准格式
```
简要说明（50字符内）

详细说明（可多行，72字符/行）
解释：
- 为什么做这个变更
- 变更的内容
- 变更的影响

如果有破坏性变更，需要在正文最后明确说明BREAKING CHANGE
```

### 模板
```
简短标题（50字符内）

详细说明第一段：解释"什么"和"为什么"
- 要点1
- 要点2
- 要点3

如果需要，进一步说明变更的技术细节

BREAKING CHANGE: 破坏性变更说明（如果有）
```

## 编写技巧

### 1. 开头句
**作用：** 概括整个变更

**模板：**
```
[动词] [对象] [位置/范围]
```

**示例：**
- Add OAuth2 authentication support
- Fix memory leak in data processing
- Refactor user validation logic
- Optimize database query performance

### 2. 详细说明段落
**包含要素：**

#### 问题说明（What was the problem）
```
Before: [描述之前的问题]
```

#### 解决方案（What changed）
```
After: [描述现在的状态]
```

#### 技术细节（Technical details）
```
Implementation:
- [技术细节1]
- [技术细节2]
```

#### 影响说明（Impact）
```
Impact:
- [影响1]
- [影响2]
```

### 3. 要点列表
**使用要点列表的情况：**
- 有多个相关变更
- 需要清晰列出功能点
- 要点相互独立

**格式：**
```
Added:
- [要点1]
- [要点2]

Changed:
- [要点1]
- [要点2]

Removed:
- [要点1]
- [要点2]
```

## 常见模式

### 模式1：新功能
```
feat(api): add user authentication endpoint

Implement JWT-based authentication:

Added:
- POST /api/auth/login endpoint
- Token validation middleware
- Refresh token logic

Requires database migration (see #123)

Closes #45
```

### 模式2：Bug修复
```
fix(auth): handle token expiration edge case

When a token expires exactly at request time, the system
was throwing unhandled exceptions.

Fixed:
- Add try-catch for token validation
- Return proper 401 response
- Log error for monitoring

Before: 500 errors on token expiration
After: Clean 401 responses, logged appropriately

Fixes #67
```

### 模式3：性能优化
```
perf(db): optimize user search query

Reduce database load by adding proper indexes:

Changes:
- Add composite index on (email, status)
- Implement query result caching
- Use pagination for large result sets

Results:
- Query time: 1200ms -> 45ms (96% improvement)
- Database CPU: -60%
- Throughput: +300%

Requires elasticsearch@8.0+ cluster

Closes #89
```

### 模式4：重构
```
refactor(auth): extract validation to separate service

Extract validation logic to improve reusability:

- Create UserValidationService
- Move all validation methods
- Improve test coverage to 95%

No functional changes, only code organization.
This sets up for future features without breaking changes.

All tests pass, +120 new unit tests added.
```

### 模式5：文档更新
```
docs(api): add authentication guide

Add comprehensive authentication documentation:

- OAuth2 flow with code examples
- JWT token lifecycle explanation
- Error handling best practices
- Security considerations and common pitfalls
- Migration guide from v1 to v2

Includes curl examples and Postman collection.

Closes #101
```

## 避免的错误

### ❌ 错误1：标题过长
```
Bad: fix the issue where user authentication tokens would expire unexpectedly and cause server errors

Good: fix(auth): handle token expiration edge case
```

### ❌ 错误2：没有说明为什么
```
Bad: update user service

Good: feat(users): add user profile picture support

Add avatar upload and display functionality:
- POST /api/users/avatar endpoint
- Image validation and resizing
- Store in S3 with CDN
- Update user model schema

Closes #112
```

### ❌ 错误3：混合多个主题
```
Bad: add login feature and fix bugs and update docs

Good: feat(auth): add OAuth2 login support
Good: fix(auth): handle empty password validation
Good: docs(auth): add login flow documentation
```

### ❌ 错误4：使用被动语态
```
Bad: the user model was updated to include avatar_url

Good: feat(users): add avatar_url field to user model
```

### ❌ 错误5：缺少上下文
```
Bad: refactor some code

Good: refactor(api): simplify query builder interface

Extract common query patterns:
- Add QueryBuilder class
- Standardize filter methods
- Reduce duplicate code by 40%

No functional changes, only code organization.
```

## 特殊情况处理

### 破坏性变更（Breaking Changes）
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
- Better development experience

Migration period: 2 weeks (until 2024-02-01)
Support for REST API ends: 2024-02-15

Closes #123
```

### 回滚提交
```
revert: feat(auth): add OAuth2 login support

This reverts commit abc123def456.

Reason: Critical security vulnerability discovered
in OAuth2 implementation. Full fix in #125.

See: #125, #126
```

### 合并提交
```
merge branch 'feature/new-ui' into main

Conflicts resolved:
- src/components/Login.tsx
- src/pages/Dashboard.tsx

Signed-off-by: Jane Smith <jane@company.com>
```

### 多作者提交
```
feat(api): implement rate limiting

Co-authored-by: Alice Johnson <alice@company.com>
Co-authored-by: Bob Chen <bob@company.com>

Implements distributed rate limiting:
- Redis-based token bucket
- Configurable limits per endpoint
- Monitoring and alerting
```

## 检查清单

### 提交前自检
- [ ] 标题简洁明了（50字符内）？
- [ ] 使用现在时和祈使句？
- [ ] 解释了"为什么"而不只是"什么"？
- [ ] 正文换行合理（72字符/行）？
- [ ] 如果有破坏性变更，是否明确标记？
- [ ] 关联了相关Issue/PR？
- [ ] 只有一个主要主题？
- [ ] 技术细节准确？

### 团队协作检查
- [ ] 其他开发者能从提交信息理解变更？
- [ ] 变更的影响是否清楚？
- [ ] 需要迁移的话是否提供指南？
- [ ] 测试状态是否说明？
- [ ] 依赖变更是否说明？

---

**记住：** 好的提交信息是对未来的投资。几个月后回看时，你和团队成员都应该能快速理解每次变更的内容和原因。
