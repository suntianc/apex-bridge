# 作用域（Scope）使用指南

## 什么是Scope

Scope是约定式提交中的可选部分，用于指明提交影响的模块或组件：

```
type(scope): description
    ↑      ↑
  类型    作用域
```

## 何时使用Scope

### 推荐使用Scope的情况

#### 1. 大型项目（多个模块）
```
feat(auth): add OAuth2 login
feat(ui): add dark mode
feat(api): add user endpoint
```

#### 2. 明确区分不同模块的变更
```
fix(auth): resolve token timeout
fix(ui): resolve button alignment
fix(api): resolve database connection
```

#### 3. 多个开发者协作
```
feat(auth, ui): add login page with validation
refactor(api, db): improve data layer performance
```

### 可以省略Scope的情况

#### 1. 小型项目（单一模块）
```
feat: add user registration
fix: resolve login bug
docs: update README
```

#### 2. 变更影响多个模块
```
feat: add complete authentication system
# 影响：auth, ui, api, db
# 使用多个scope会很冗长
```

#### 3. 全局性变更
```
chore: upgrade Node.js version
build: update webpack configuration
ci: modify pipeline workflow
```

## Scope命名规范

### 1. 使用小写字母
```
✅ 正确：
feat(ui): add button
fix(auth): resolve issue

❌ 错误：
feat(UI): add button
fix(Auth): resolve issue
```

### 2. 使用名词，而非动词
```
✅ 正确：
feat(auth): add login
refactor(api): improve code

❌ 错误：
feat(authenticate): add login
refactor(api): improve code
```

### 3. 保持简洁
```
✅ 简洁：
feat(ui): add button
feat(api): add endpoint

❌ 冗长：
feat(user_interface): add button
feat(application_programming_interface): add endpoint
```

### 4. 避免缩写混淆
```
✅ 清晰：
feat(db): add index
feat(cache): add Redis support

❌ 可能混淆：
feat(db): add feature  # db是什么？database?
```

## 常用Scope列表

### 前端相关
- `ui` - 用户界面
- `ux` - 用户体验
- `styles` - 样式文件
- `components` - 组件
- `router` - 路由
- `i18n` - 国际化

### 后端相关
- `api` - API接口
- `auth` - 认证授权
- `db` - 数据库
- `cache` - 缓存
- `queue` - 消息队列
- `email` - 邮件
- `notification` - 通知

### 通用模块
- `config` - 配置
- `docs` - 文档
- `test` - 测试
- `build` - 构建
- `deps` - 依赖

## 高级用法

### 1. 多个Scope
当一个提交影响多个模块时：

```
feat(auth, ui): add login page with OAuth2

影响：auth模块 + ui模块
```

### 2. 层级Scope
```
feat(auth/oauth): add Google provider
  └─ auth是主模块
     └─ oauth是子模块

feat(api/users): add profile endpoint
  └─ api是主模块
     └─ users是子模块
```

### 3. 动态Scope
```
feat(ui@mobile): add responsive layout for mobile
feat(ui@desktop): add sidebar for desktop
```

## Scope最佳实践

### 1. 团队约定
```
在团队规范中明确列出：
- 所有可用的Scope
- Scope的命名约定
- Scope的使用场景
- Scope的层级结构
```

### 2. 避免过度细化
```
❌ 过度细化：
feat(button/primary,button/secondary): add two button types

✅ 适度细化：
feat(ui): add primary and secondary button components
```

### 3. Scope一致性
```
✅ 一致：
feat(ui): add button
fix(ui): resolve alignment
refactor(ui): simplify code

❌ 不一致：
feat(button): add button
fix(ui): resolve alignment
refactor(components): simplify code
```

### 4. Scope与类型的关系
```
feat(ui): add dark mode
  └─ feat + ui = 添加新UI功能

fix(ui): resolve button bug
  └─ fix + ui = 修复UI问题

docs(ui): update component documentation
  └─ docs + ui = 更新UI文档
```

## 常见错误

### 错误1：Scope与描述重复
```
❌ 错误：
feat(auth): implement authentication feature

✅ 正确：
feat(auth): add OAuth2 login

解释：auth本身就是authentication，描述中不需要重复
```

### 错误2：Scope使用不一致
```
❌ 错误：
feat(auth): add login
feat(ui): add button
feat(button): add component

✅ 正确：
feat(auth): add login
feat(ui): add button
feat(ui): add button component
```

### 错误3：Scope过于宽泛
```
❌ 宽泛：
feat(core): add new functionality

✅ 明确：
feat(user): add registration
feat(payment): add checkout
```

### 错误4：Scope与实际变更不符
```
❌ 不符：
feat(auth): fix button alignment  # auth scope但实际修改的是ui

✅ 符合：
fix(ui): fix button alignment
```

## 工具支持

### 1. GitHub/GitLab
```
Scope可以在PR标题中显示，便于分类：
feat(ui): Add dark mode

标签自动生成：ui, feat
```

### 2. 自动化工具
```
# commitlint.config.js
module.exports = {
  rules: {
    'scope-enum': [2, 'always', ['ui', 'api', 'auth', 'docs']]
  }
}
```

### 3. 生成变更日志
```
conventional-changelog自动根据scope分组：
## Features

### ui
- feat(ui): add dark mode
- feat(ui): add responsive layout

### api
- feat(api): add user endpoint
- feat(api): add pagination
```

## 自检清单

使用Scope前检查：
- [ ] 项目规模是否需要Scope？
- [ ] Scope命名是否清晰一致？
- [ ] Scope与变更内容是否匹配？
- [ ] 是否遵循团队约定？
- [ ] 多个Scope时是否有必要？

---

记住：Scope是帮助读者快速理解变更范围的工具。使用得当可以让提交信息更加清晰；使用不当则会增加理解成本。
