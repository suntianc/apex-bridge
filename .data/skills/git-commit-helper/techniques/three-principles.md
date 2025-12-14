# 编写高质量提交信息的三大原则

## 原则一：简洁性（Concise）

### 核心理念
用最少的词表达最清楚的意思，避免冗余和啰嗦。

### 具体实践

#### 1. 标题控制在50字符内
```
✅ 好的标题（45字符）：
feat(auth): add OAuth2 login support

❌ 冗长标题（72字符）：
feat(auth): implement OAuth2 authentication support for user login with social media providers
```

#### 2. 使用现在时
```
✅ 现在时：
feat(api): add user endpoint
fix(ui): resolve button issue

❌ 过去时：
feat(api): added user endpoint
fixed(ui): button issue resolved
```

#### 3. 避免不必要的词汇
```
✅ 简洁：
docs: update README

❌ 冗余：
docs: update and improve the documentation

✅ 简洁：
fix: handle null pointer

❌ 冗余：
fix: fix the issue with null pointer exception
```

#### 4. 删除显而易见的词汇
```
✅ 简洁：
refactor: optimize user service

❌ 冗余：
refactor: refactor the user service code to optimize it

✅ 简洁：
test: add login tests

❌ 冗余：
test: add comprehensive unit tests for the login functionality
```

### 简洁性检查清单
- [ ] 标题不超过50字符
- [ ] 使用现在时（improve而不是improved）
- [ ] 删除"the"、"that"等不必要的冠词和代词
- [ ] 避免重复含义的词汇

---

## 原则二：一致性（Consistent）

### 核心理念
在整个项目中保持统一的格式、术语和风格。

### 具体实践

#### 1. 统一提交类型
```
✅ 一致使用约定式提交：
feat: add login
fix: resolve bug
docs: update README

❌ 混乱的提交风格：
Add login feature  # 自由格式
Fixed a bug       # 过去时且首字母大写
Document changes  # 动词原形
```

#### 2. 统一术语使用
```
✅ 一致的术语：
feat(api): add user endpoint
refactor(api): improve error handling

❌ 混乱的术语：
feat(api): add user endpoint
feat(api): implement user service
feat(api): create user functionality
```

#### 3. 统一的Scope命名
```
✅ 一致的Scope：
feat(auth): add OAuth2
feat(ui): add button
feat(api): add endpoint

❌ 混乱的Scope：
feat(authentication): add OAuth2  # full name
feat(ui): add button              # abbreviation
feat(api): add endpoint           # abbreviation
```

#### 4. 统一的描述风格
```
✅ 一致使用动词+名词结构：
add: feat(ui): add button
improve: refactor(api): improve error handling
resolve: fix(ui): resolve alignment issue

❌ 混乱的风格：
feat(ui): add button
feat(ui): button added
feat(ui): adding a new button
```

### 一致性检查清单
- [ ] 所有提交都遵循约定式提交格式
- [ ] 术语使用统一（endpoint vs service vs functionality）
- [ ] Scope命名统一（全部用简称或全称）
- [ ] 动词选择统一（add/create/implement等）

---

## 原则三：可读性（Readable）

### 核心理念
让其他开发者能够快速理解变更的内容、目的和影响。

### 具体实践

#### 1. 明确说明变更内容
```
✅ 明确：
feat(ui): add dark mode toggle button

❌ 模糊：
feat(ui): improve UI

✅ 明确：
fix(api): handle timeout in user login

❌ 模糊：
fix(api): fix login issue
```

#### 2. 突出关键信息
```
✅ 突出关键特性：
feat(auth): add biometric authentication

✅ 突出影响范围：
feat(payment): integrate Stripe checkout

❌ 信息不足：
feat(auth): add new feature
```

#### 3. 避免缩写和行话
```
✅ 清晰易懂：
feat(api): add user profile endpoint

❌ 难懂缩写：
feat(api): add UGC endpoint  # User Generated Content?

✅ 清晰：
refactor(cache): implement LRU eviction policy

❌ 难懂缩写：
refactor(cache): add LRU cache
```

#### 4. 使用描述性而非规定性的语言
```
✅ 描述性：
feat(search): add fuzzy matching for typos

❌ 规定性：
feat(search): implement search improvements

✅ 描述性：
perf(api): reduce response time by 50%

❌ 规定性：
perf(api): optimize API performance
```

### 可读性检查清单
- [ ] 从标题能明确知道变更内容
- [ ] 避免模糊词汇（improve、optimize、enhance）
- [ ] 不使用团队外部人员不熟悉的缩写
- [ ] 正文补充足够的上下文信息

---

## 三大原则的平衡

### 优先级排序
1. **可读性**（最高优先级）- 让读者理解
2. **一致性**（中等优先级）- 保持项目规范
3. **简洁性**（最低优先级）- 在保证前两者基础上精简

### 冲突处理

#### 冲突1：简洁 vs 可读
```
场景：需要详细说明但空间有限

解决方案：
- 标题保持简洁（50字符内）
- 正文补充详细信息
- 标题说明What，正文说明Why和How

示例：
feat(auth): add OAuth2 login support

支持多种OAuth提供商，包括Google、GitHub和Microsoft。
简化用户注册流程，提高转化率。
```

#### 冲突2：简洁 vs 一致
```
场景：统一格式会显得啰嗦

解决方案：
- 优先保证一致性
- 使用最简洁的方式保持一致

示例：
❌ 为了简洁破坏一致性：
feat: add login  # 缺少type
feat: add button  # 缺少type

✅ 保持一致但简洁：
feat: add login
feat: add button
```

#### 冲突3：可读 vs 简洁
```
场景：简洁的表达不够清晰

解决方案：
- 适当放宽简洁要求
- 使用更准确的动词

示例：
❌ 过份追求简洁：
fix: resolve null pointer

✅ 平衡可读性和简洁性：
fix: handle null pointer in user service
```

---

## 实战应用指南

### 1. 写提交信息前的思考
在编写提交信息前，问自己三个问题：
1. **What**：这个提交做了什么？
2. **Why**：为什么要做这个变更？
3. **Impact**：这个变更的影响是什么？

### 2. 写作流程
1. 确定变更类型（feat/fix/docs等）
2. 确定Scope（影响的模块）
3. 写简洁清晰的标题（50字符内）
4. 如需要，写正文解释Why和How
5. 添加关联的Issue/PR信息

### 3. 自检清单
每次提交前检查：
- [ ] 是否遵循了三大原则？
- [ ] 其他开发者能从这个提交信息中获得什么？
- [ ] 是否与之前的提交风格一致？
- [ ] 有没有更简洁、更清晰的表达方式？

### 4. 团队协作
- 定期进行提交信息质量回顾
- 建立提交信息检查清单
- 在代码审查中关注提交信息质量
- 为新成员提供提交信息编写指南

---

## 常见误区

### 误区1：过分追求简洁
```
❌ 过度简化：
feat: add things
fix: resolve issues

✅ 保持简洁但清晰：
feat(auth): add login button
fix(ui): resolve button alignment
```

### 误区2：为了简洁牺牲可读性
```
❌ 简洁但难懂：
refactor: optimize stuff

✅ 可读但简洁：
refactor(api): improve response time
```

### 误区3：格式一致但内容空洞
```
❌ 格式正确但信息不足：
feat: add feature
refactor: improve code

✅ 格式一致且信息丰富：
feat(auth): add two-factor authentication
refactor(api): extract validation logic
```

---

记住：好的提交信息是给未来的你和你的团队的一份礼物。三大原则帮助你编写出既有质量又有温度的提交信息。
