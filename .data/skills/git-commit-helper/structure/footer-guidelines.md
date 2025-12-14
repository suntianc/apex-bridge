# 提交Footer编写指南

## Footer的作用

Footer用于提供补充信息，包括：
- 关联的Issue和PR
- 破坏性变更说明
- 署名信息
- 其他重要说明

## 标准Footer格式

### 1. 关联Issue/PR

#### 语法
```
Closes #123
Fixes #456
Resolves #789
Refs #101
See #202
```

#### 含义区别

**Closes / Fixes / Resolves**
- ✅ 表示这个提交**完全解决了**Issue
- ✅ GitHub会自动关闭对应的Issue
- ✅ 用于Bug修复、功能完成

**Refs**
- ✅ 表示这个提交**相关**但不完全解决
- ✅ GitHub会创建引用关系
- ✅ 用于相关讨论、准备工作

**See**
- ✅ 表示这个提交**参考**了某个信息
- ✅ 提供额外上下文
- ✅ 用于文档更新、讨论参考

#### 多Issue示例
```
feat(users): add profile management

Implement user profile CRUD operations

Closes #123, #124
Refs #98, #100
```

#### 外部链接
```
docs(api): update authentication guide

Closes #https://github.com/company/docs/issues/45
See also: https://wiki.company.com/auth-flow
```

### 2. 破坏性变更（BREAKING CHANGE）

#### 语法
```
BREAKING CHANGE: 详细说明破坏性变更的内容

- 具体的破坏性变更1
- 具体的破坏性变更2
- 迁移指南或替代方案
```

#### 位置
- **推荐位置：** 正文末尾
- **备选位置：** Footer开始

#### 示例

**在正文末尾：**
```
feat(api)!: migrate to REST API

Migrate from GraphQL back to REST for simplicity:

- Add REST endpoints for all resources
- Remove GraphQL schema
- Update client SDK

BREAKING CHANGE: GraphQL API removed, use REST instead.
Migration guide: https://docs.company.com/migration
```

**在Footer：**
```
feat(api)!: migrate to REST API

BREAKING CHANGE: GraphQL API removed, use REST instead.
Migration guide: https://docs.company.com/migration

Closes #123
```

### 3. 署名（Signed-off）

#### 语法
```
Signed-off-by: Name <email@example.com>
```

#### 含义
- 表示签署者同意DCO（Developer Certificate of Origin）
- 确认代码有合法来源
- 适用于开源项目

#### 示例
```
fix(auth): handle null pointer exception

Signed-off-by: Jane Smith <jane@company.com>
```

#### 自动添加
```bash
git commit -s  # 自动添加 Signed-off-by
```

### 4. 多作者（Co-authored-by）

#### 语法
```
Co-authored-by: Name <email@example.com>
```

#### 适用场景
- 多人合作完成的功能
- 代码审查者贡献代码
- 结对编程

#### 示例
```
feat(ui): implement dark mode toggle

Co-authored-by: Alice Johnson <alice@company.com>
Co-authored-by: Bob Chen <bob@company.com>
```

#### 注意事项
- 最多列几个主要贡献者
- 不要列所有参与讨论的人
- GitHub会自动显示所有提交者

### 5. 提交类型标记

#### 语法
```
Type: feat
Type: fix
Type: docs
```

#### 用途
- 帮助自动化工具分类
- 生成变更日志
- 统计提交类型

#### 示例
```
Type: feat
Type: fix
Type: perf
Type: refactor
```

### 6. 版本标记

#### 语法
```
Release: v2.1.0
Version: 2.1.0
Tag: v2.1.0
```

#### 用途
- 标记包含该提交的发布版本
- 便于回溯查找
- 生成发布说明

#### 示例
```
feat(auth): add 2FA support

Release: v2.5.0
Closes #345
```

### 7. 依赖变更

#### 语法
```
Depends-on: #123
Requires: #456
Blocked-by: #789
```

#### 含义

**Depends-on / Requires**
- ✅ 表示这个提交依赖另一个提交
- ✅ 建立提交间的依赖关系

**Blocked-by**
- ✅ 表示这个提交被某个Issue阻塞
- ✅ 需要先解决阻塞问题

#### 示例
```
feat(api): implement webhooks

Depends-on: #234 (database schema update)
Requires: #567 (queue system)

Blocked-by: #890 (security audit)
```

### 8. 测试状态

#### 语法
```
Tested-by: Name <email@example.com>
Reviewed-by: Name <email@example.com>
Approved-by: Name <email@example.com>
```

#### 用途
- 记录测试和审查过程
- 满足合规要求
- 提供责任追溯

#### 示例
```
fix(db): handle connection timeout

Tested-by: QA Team <qa@company.com>
Reviewed-by: John Doe <john@company.com>
Approved-by: Jane Smith <jane@company.com>
```

### 9. 安全相关

#### 语法
```
Security: CVE-2024-1234
Security: CVSS-7.5
Security: Fixed in v2.1.0
```

#### 用途
- 记录安全修复
- 关联CVE编号
- 便于安全审计

#### 示例
```
fix(auth): patch authentication bypass vulnerability

Security: CVE-2024-5678
CVSS: 9.8 (Critical)
Fixed in: v2.1.3

See: https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2024-5678
```

### 10. 性能数据

#### 语法
```
Performance: -60% CPU usage
Performance: +300% throughput
Performance: -40ms response time
```

#### 用途
- 记录性能优化结果
- 提供量化数据
- 便于对比验证

#### 示例
```
perf(db): optimize user search query

Performance:
- Query time: 1200ms -> 45ms (-96%)
- CPU usage: -60%
- Throughput: +300% (50 -> 200 req/s)

Closes #123
```

## Footer最佳实践

### ✅ 推荐做法

1. **使用标准格式**
   ```
   Closes #123
   Signed-off-by: Jane Smith <jane@company.com>
   ```

2. **只添加必要信息**
   - 不要每个提交都加Footer
   - 只有在需要时才添加

3. **保持一致**
   - 团队约定Footer格式
   - 持续使用相同模式

4. **放在单独行**
   - 每行一个Footer条目
   - 空行分隔正文和Footer

### ❌ 避免做法

1. **不要混在正文中**
   ```
   Bad:
   This commit fixes bug #123 and Closes #456

   Good:
   This commit fixes the authentication bug.

   Closes #123, #456
   ```

2. **不要使用非标准格式**
   ```
   Bad:
   Bugfix: #123
   Issue: #456

   Good:
   Closes #123
   Fixes #456
   ```

3. **不要添加无意义信息**
   ```
   Bad:
   Author: John Doe
   Date: 2024-01-15

   Good:
   Signed-off-by: John Doe <john@company.com>
   ```

4. **不要忘记空行分隔**
   ```
   Bad:
   This is the commit message.
   Closes #123

   Good:
   This is the commit message.

   Closes #123
   ```

## 完整示例

### 示例1：功能提交
```
feat(auth): add OAuth2 authentication

Implement OAuth2 login support for Google and GitHub:

Added:
- OAuth2 client configuration
- Secure token handling
- User model extensions
- Login UI with provider selection

Requires:
- OAuth app registration
- Database migration (see #234)

Co-authored-by: Alice Johnson <alice@company.com>
Closes #123
```

### 示例2：Bug修复
```
fix(api): handle timeout in user service

When database connection times out, requests were hanging
indefinitely due to missing error handling.

Fixed:
- Retry logic with exponential backoff (3 retries)
- Connection timeout increased from 5s to 30s
- Proper error logging and monitoring
- Circuit breaker pattern for database calls

Before: 5+ memory leaks per hour
After: Zero memory leaks in 48h testing

Fixes #189
Signed-off-by: Bob Chen <bob@company.com>
```

### 示例3：破坏性变更
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

Closes #178
Refs #145, #167
```

## 检查清单

### Footer内容检查
- [ ] 关联的Issue格式正确？
- [ ] 破坏性变更已明确标记？
- [ ] 需要的署名信息已添加？
- [ ] 多作者信息已包含？
- [ ] 空行分隔了正文和Footer？

### 格式检查
- [ ] 每行Footer占单独一行？
- [ ] 使用标准关键词（Closes, Fixes等）？
- [ ] 格式保持一致？
- [ ] 没有多余信息？

---

**记住：** Footer提供额外上下文信息，但不是必需的。只有在需要时才添加，保持简洁清晰。
