# 约定式提交（Conventional Commits）规范详解

## 概述

约定式提交是一种为提交信息添加明确含义的约定，它使你能够创建自动化的变更日志，并通过commit message约定来支持语义化版本控制。

## 完整格式

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### 组成元素说明

#### 1. Type（必需）
提交的类型，表示这次变更的性质。

**标准类型**：
- `feat` - 新功能
- `fix` - 修复bug
- `docs` - 文档
- `style` - 格式
- `refactor` - 重构
- `perf` - 性能
- `test` - 测试
- `build` - 构建
- `ci` - 持续集成
- `chore` - 其他
- `revert` - 回滚

#### 2. Scope（可选）
变更影响的模块或组件。

```
feat(auth): add OAuth2 login
     ↑↑↑
   类型  作用域
```

#### 3. Description（必需）
变更的简短描述，遵循以下规则：
- 不超过50个字符
- 不以句号结尾
- 使用现在时（add而不是added）

```
feat(auth): add OAuth2 login support
```

#### 4. Body（可选）
详细说明变更的内容、原因和影响。每行不超过72个字符。

```
feat(auth): add OAuth2 login support

Implement OAuth2 authentication flow supporting multiple providers:
- Google OAuth2
- GitHub OAuth2
- Microsoft OAuth2

User can now login using their existing social accounts without
creating a new password. This improves user experience and
increases registration conversion rate.
```

#### 5. Footer（可选）
用于关联Issue、Breaking Changes或其他元信息。

```
feat(auth)!: change authentication API

BREAKING CHANGE: authentication method changed from JWT to OAuth2

Closes #123
Refs #456
```

## 详细规则

### 1. Header规则
```
type(scope): description
```

- `type`和`scope`都是小写
- `description`首字母小写（除非专有名词）
- `type`和`scope`之间用`()`分隔
- `scope`和`:`之间没有空格
- `:`和`description`之间有一个空格

```
✅ 正确：
feat(auth): add login
fix(ui): resolve issue

❌ 错误：
Feat(Auth): Add Login
feat (auth): add login
feat: add login
```

### 2. Body规则
```
feat(auth): add login

添加OAuth2登录功能，支持多种社交账号登录。
```

- Header和Body之间有一个空行
- Body使用现在时描述原因和内容
- 每行不超过72个字符
- 可以分段描述不同方面

### 3. Footer规则
```
BREAKING CHANGE: authentication API changed

Closes #123
```

- Footer和Body之间有一个空行
- Breaking Change必须大写
- Issue引用使用标准格式

## 特殊标记

### Breaking Change（破坏性变更）
```
feat(auth)!: change authentication method

BREAKING CHANGE: JWT authentication removed, use OAuth2 instead
```

使用`!`标记在type后：
```
feat!: remove deprecated API
refactor!: change data structure
```

在Footer中详细说明：
```
BREAKING CHANGE: API endpoint changed from /v1/login to /v2/auth
```

### Issue关联

#### 关闭Issue
```
Closes #123
Closes #123, #456
Closes org/repo#123
```

#### 参考Issue
```
Refs #123
Refs org/repo#456
```

#### 其他Footer
```
Signed-off-by: Developer Name <email@example.com>
Co-authored-by: Name <email@example.com>
```

## 实际应用示例

### 示例1：新功能
```
feat(ui): add dark mode toggle

Implement a toggle switch in the settings page that allows users
to switch between light and dark themes. The preference is saved
to localStorage and applied immediately across all pages.

Closes #234
```

### 示例2：Bug修复
```
fix(api): handle timeout in user service

When the user service database connection times out, the request
was hanging indefinitely. Added retry logic with exponential
backoff and proper error handling.

Timeout increased from 5s to 30s to accommodate slow queries.

Fixes #189
```

### 示例3：破坏性变更
```
feat(api)!: change user authentication

BREAKING CHANGE: Authentication method changed from JWT tokens
to OAuth2. All existing API keys must be migrated.

Migration guide:
1. Register OAuth2 app with your provider
2. Update authentication flow
3. Remove JWT-related code

Closes #345
Refs #123
```

### 示例4：多模块变更
```
feat(auth, ui): add social login

Add social login functionality including:
- OAuth2 integration with Google and GitHub
- Login UI improvements
- Session management

UI changes include new login page design and improved error
messages. Auth changes include token refresh and secure
cookie handling.

Requires #456 to be merged first.

Co-authored-by: Jane Doe <jane@example.com>
```

## 自动化工具集成

### 1. commitlint
```javascript
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat', 'fix', 'docs', 'style', 'refactor',
      'perf', 'test', 'build', 'ci', 'chore', 'revert'
    ]],
    'scope-enum': [2, 'always', ['ui', 'api', 'auth', 'docs']],
    'header-max-length': [2, 'always', 50],
    'body-max-line-length': [2, 'always', 72]
  }
}
```

### 2. 生成变更日志
```bash
# 使用 conventional-changelog
npm install -g conventional-changelog-cli
conventional-changelog -p angular -i CHANGELOG.md -s
```

### 3. 语义化版本控制
基于提交类型自动决定版本号：
- `feat` → MINOR版本
- `fix` → PATCH版本
- `BREAKING CHANGE` → MAJOR版本

## 最佳实践

### 1. 编写Header
- 控制在50字符内
- 描述变更而不是做了什么
- 使用动词+名词结构

```
✅ 好：
feat(ui): add dark mode

❌ 差：
feat(ui): added dark mode functionality to the application
```

### 2. 编写Body
- 解释"为什么"而不只是"做了什么"
- 使用现在时描述原因
- 可以分成多段

```
feat(auth): add OAuth2

Why:
- Improve user experience by allowing social login
- Reduce password management overhead
- Increase registration conversion rate

How:
- Integrate with Google and GitHub OAuth2
- Add secure token handling
- Update user model to support multiple providers
```

### 3. 编写Footer
- 关联相关Issue
- 说明破坏性变更
- 包含署名信息

## 常见错误

### 错误1：格式不规范
```
❌ 错误：
feat: Add new feature
Fix: Bug fix
Added new functionality to the app

✅ 正确：
feat: add new feature
```

### 错误2：类型选择错误
```
❌ 错误：
feat: fix login bug
docs: refactor code

✅ 正确：
fix: resolve login bug
refactor: improve code structure
```

### 错误3：Scope使用混乱
```
❌ 错误：
feat(auth): update documentation

✅ 正确：
docs(auth): update README
```

### 错误4：Breaking Change未标记
```
❌ 错误：
feat: change API endpoint

✅ 正确：
feat!: change API endpoint

BREAKING CHANGE: endpoint changed from /v1 to /v2
```

---

约定式提交让版本控制和变更管理变得简单而高效。遵循这些规范，你的项目将获得更好的可追溯性和自动化能力。
