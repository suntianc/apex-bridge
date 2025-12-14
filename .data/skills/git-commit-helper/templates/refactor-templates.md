# 重构提交模板

## 重构基础模板

### 标准重构
```
refactor(<scope>): <short description>

Extract/Improve <what> to <benefits>:

Changes:
- <change 1>
- <change 2>
- <change 3>

No functional changes, only code organization.
This sets up for future features without breaking changes.

All tests pass, +<number> new unit tests added.
```

### 详细重构
```
refactor(<scope>): <short description>

<Motivation - why this refactoring>

<Description of changes>

Improvements:
- <improvement 1>
- <improvement 2>
- <improvement 3>

Metrics:
- <metric>: <before> → <after>

No functional changes, only code organization.
This prepares for <future feature> without breaking changes.

All tests pass, +<number> new tests added.
<Additional context>
```

---

## 具体场景模板

### 1. 代码提取

#### 提取函数/方法
```
refactor(auth): extract validation logic to service

Extract user input validation from controller to
separate UserValidationService for better reusability
and testability:

Changes:
- Create UserValidationService class
- Move validation methods from controller
- Add comprehensive input sanitization
- Implement consistent error messages
- Update controller to use service

Before: Validation logic scattered across controller
After: Centralized validation with clear interface

Benefits:
- Reusability: Can be used in other controllers
- Testability: Easy to unit test validation rules
- Maintainability: Single source of truth

No functional changes, only code organization.

All tests pass, +25 new unit tests added.
Co-authored-by: Jane Smith <jane@company.com>
```

#### 提取组件
```
refactor(ui): extract Button component to shared library

Extract Button component from multiple pages to
shared @company/ui package:

Changes:
- Create Button component in UI library
- Standardize button styles and variants
- Update all 15+ pages using custom buttons
- Add TypeScript type definitions
- Add comprehensive prop validation

Before: Duplicate button code across 15 files
After: Single component, consistent behavior

Benefits:
- Consistency: Identical behavior everywhere
- Maintainability: Fix once, update everywhere
- Reusability: Easy to use in new components
- Testing: Single source to test

Code reduction: -800 lines duplicated code

All tests pass, component tested across 15 pages.
```

### 2. 架构改进

#### 依赖倒置
```
refactor(api): implement dependency injection

Refactor service layer to use dependency injection
for better testability and flexibility:

Changes:
- Add DI container (InversifyJS)
- Convert services to injectable
- Update controllers to use DI
- Remove direct instantiation
- Add interface-based programming

Before:
```typescript
class UserService {
  constructor() {
    this.db = new Database()
    this.logger = new Logger()
  }
}
```

After:
```typescript
@injectable()
class UserService {
  constructor(
    @inject(TYPES.Database) private db: Database,
    @inject(TYPES.Logger) private logger: Logger
  ) {}
}
```

Benefits:
- Testability: Easy to mock dependencies
- Flexibility: Swap implementations easily
- Decoupling: Clear dependency boundaries
- Maintainability: Explicit dependencies

No functional changes.

All tests pass with new DI setup.
```

#### 分层架构
```
refactor(core): separate business logic from controllers

Refactor from thick controllers to proper
layered architecture:

Layers:
- Controllers: HTTP handling only
- Services: Business logic
- Repositories: Data access
- Models: Data structures

Before:
```typescript
// Controller contains business logic
app.post('/users', async (req, res) => {
  const user = await db.query('INSERT...')
  await email.send('Welcome...')
  await logActivity(user.id)
})
```

After:
```typescript
// Controller: HTTP only
app.post('/users', async (req, res) => {
  const user = await userService.create(req.body)
  res.json(user)
})

// Service: Business logic
class UserService {
  async create(data) {
    const user = await this.repo.create(data)
    await this.emailService.sendWelcome(user)
    await this.activityLogger.log(user.id)
    return user
  }
}
```

Benefits:
- Separation of concerns
- Easier testing (test services without HTTP)
- Better code organization
- Reusability across different interfaces (HTTP, CLI, etc.)

No functional changes.

All tests pass, +50 new unit tests.
```

### 3. 命名改进

#### 重命名类/变量
```
refactor(models): rename UserAccount to UserProfile

Rename UserAccount class to UserProfile for clarity:

Changes:
- Rename class UserAccount → UserProfile
- Update all references across codebase
- Update database table name
- Update API endpoints
- Update TypeScript interfaces

Before: UserAccount.findById()
After: UserProfile.findById()

Reasoning:
- "Profile" more accurately describes user data
- Matches domain language used by stakeholders
- Distinguishes from authentication concepts

Migration:
- Database migration included
- Old class name marked deprecated
- Support for both names (with deprecation warning)

Breaking change for external API consumers.

Migration guide: docs/migration/user-profile.md

All tests pass with renamed references.
```

#### 改进方法名
```
refactor(auth): rename methods for clarity

Rename authentication methods to follow active voice
and be more descriptive:

Changes:
- validateUser() → validateCredentials()
- checkToken() → verifyToken()
- isLoggedIn() → hasValidSession()
- makeToken() → generateToken()
- killSession() → invalidateSession()

Before: if (auth.isLoggedIn()) { ... }
After: if (auth.hasValidSession()) { ... }

Reasoning:
- Active voice is clearer
- Consistent naming convention
- Better IDE auto-completion
- Easier to understand at call sites

No functional changes.

All 200+ references updated.
IDE search-and-replace with manual verification.
```

### 4. 条件简化

#### 简化复杂条件
```
refactor(validation): simplify nested if statements

Refactor deeply nested validation logic to
use guard clauses and early returns:

Before:
```typescript
if (user) {
  if (user.email) {
    if (user.email.valid) {
      if (user.email.verified) {
        // Actual logic here
      } else {
        return error('Email not verified')
      }
    } else {
      return error('Email invalid')
    }
  } else {
    return error('No email')
  }
} else {
  return error('No user')
}
```

After:
```typescript
if (!user) return error('No user')
if (!user.email) return error('No email')
if (!user.email.valid) return error('Email invalid')
if (!user.email.verified) return error('Email not verified')

// Actual logic here
```

Benefits:
- Reduced cognitive load
- Easier to read and understand
- Less indentation
- Clearer control flow

No functional changes.

All tests pass.
Code complexity reduced: 12 → 6
```

#### 策略模式替换条件
```
refactor(pricing): replace conditionals with strategy pattern

Refactor pricing logic from switch/if-else to
strategy pattern for better extensibility:

Before:
```typescript
function calculatePrice(userType, basePrice) {
  if (userType === 'premium') {
    return basePrice * 0.8
  } else if (userType === 'student') {
    return basePrice * 0.5
  } else if (userType === 'enterprise') {
    return basePrice * 0.7
  } else {
    return basePrice
  }
}
```

After:
```typescript
interface PricingStrategy {
  calculate(price: number): number
}

class PremiumPricing implements PricingStrategy {
  calculate(price: number) { return price * 0.8 }
}

class StudentPricing implements PricingStrategy {
  calculate(price: number) { return price * 0.5 }
}

class EnterprisePricing implements PricingStrategy {
  calculate(price: number) { return price * 0.7 }
}

function calculatePrice(strategy: PricingStrategy, basePrice) {
  return strategy.calculate(basePrice)
}
```

Benefits:
- Easy to add new user types
- Open/Closed principle
- Better testability
- Clear separation of concerns

No functional changes.

All tests pass.
New user types can be added without modifying existing code.
```

### 5. 循环优化

#### 移除嵌套循环
```
refactor(data): optimize nested loops with lookup table

Refactor O(n²) nested loops to O(n) with
hash map lookup:

Before:
```typescript
for (const user of users) {
  for (const post of posts) {
    if (post.userId === user.id) {
      user.posts.push(post)
    }
  }
}
```

After:
```typescript
const postsByUserId = new Map()
for (const post of posts) {
  if (!postsByUserId.has(post.userId)) {
    postsByUserId.set(post.userId, [])
  }
  postsByUserId.get(post.userId).push(post)
}

for (const user of users) {
  user.posts = postsByUserId.get(user.id) || []
}
```

Performance:
- Time: O(n²) → O(n)
- 1000 users, 1000 posts: 1,000,000 → 2,000 iterations

No functional changes.

All tests pass.
Performance test: 8.5s → 0.2s (97% improvement)
```

### 6. 数据结构优化

#### 替换对象为Map
```
refactor(cache): use Map instead of plain objects

Refactor cache implementation from plain objects
to Map for better performance and type safety:

Before:
```typescript
const cache = {}
function get(key) {
  return cache[key]
}
function set(key, value) {
  cache[key] = { value, expires: Date.now() + ttl }
}
```

After:
```typescript
const cache = new Map<string, CacheEntry>()
function get(key: string): T | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expires) {
    cache.delete(key)
    return undefined
  }
  return entry.value
}
```

Benefits:
- Type safety with TypeScript
- Better performance (built-in optimizations)
- Cleaner API
- Automatic memory management

No functional changes.

All tests pass.
Memory usage: -15%
Cache hit performance: +40%
```

### 7. 异步代码改进

#### Promise链转async/await
```
refactor(api): convert Promise chains to async/await

Refactor authentication flow from Promise chains
to modern async/await syntax:

Before:
```typescript
function login(credentials) {
  return validateUser(credentials)
    .then(user => checkPassword(user, credentials.password))
    .then(user => generateToken(user))
    .then(token => {
      return updateLastLogin(user.id)
        .then(() => ({ user, token }))
    })
    .catch(error => {
      logFailedLogin(credentials.email)
      throw error
    })
}
```

After:
```typescript
async function login(credentials) {
  try {
    const user = await validateUser(credentials)
    await checkPassword(user, credentials.password)
    const token = await generateToken(user)
    await updateLastLogin(user.id)
    return { user, token }
  } catch (error) {
    await logFailedLogin(credentials.email)
    throw error
  }
}
```

Benefits:
- More readable code
- Easier error handling
- Better stack traces
- Standard JavaScript pattern

No functional changes.

All tests pass.
Code readability: Significantly improved
```

### 8. 类重构

#### 单一职责原则
```
refactor(models): split God class into focused classes

Refactor monolithic User class that handled
authentication, profile, settings, and activity:

Split into:
- UserIdentity: Authentication, credentials
- UserProfile: Name, bio, avatar
- UserSettings: Preferences, notifications
- UserActivity: Last login, activity history

Before:
```typescript
class User {
  id: string
  email: string
  password: string
  name: string
  bio: string
  avatar: string
  emailNotifications: boolean
  theme: string
  lastLogin: Date
  loginCount: number

  // 50+ methods handling everything
}
```

After:
```typescript
class UserIdentity {
  id: string
  email: string
  password: string
  // Auth-related methods
}

class UserProfile {
  userId: string
  name: string
  bio: string
  avatar: string
  // Profile-related methods
}

class UserSettings {
  userId: string
  emailNotifications: boolean
  theme: string
  // Settings-related methods
}

class UserActivity {
  userId: string
  lastLogin: Date
  loginCount: number
  // Activity-related methods
}
```

Benefits:
- Single Responsibility Principle
- Easier to test individual concerns
- Better code organization
- Easier to extend specific aspects

No functional changes.

All tests pass, refactored to test smaller units.
```

---

## 重构检查清单

### 重构前
- [ ] 有充分的测试覆盖？
- [ ] 重构目标明确？
- [ ] 性能问题已识别？
- [ ] 不影响功能？
- [ ] 获得团队同意？

### 重构中
- [ ] 小步提交？
- [ ] 保持测试绿？
- [ ] 记录改进指标？
- [ ] 不引入技术债务？
- [ ] 遵循团队约定？

### 重构后
- [ ] 所有测试通过？
- [ ] 性能改进验证？
- [ ] 代码可读性提升？
- [ ] 维护性改善？
- [ ] 文档更新？

---

## 重构质量标准

### ✅ 好的重构
- 功能完全不变
- 代码更清晰
- 性能提升或不变
- 测试覆盖充分
- 为未来改进铺路

### ❌ 差的"重构"
- 改变功能行为
- 性能下降
- 代码更复杂
- 测试失败
- 没有明确收益

---

## 重构类型模式

### 1. 提取模式
```
refactor(<scope>): extract <what>

Extract <what> to improve <benefits>

No functional changes.
All tests pass.
```

### 2. 简化模式
```
refactor(<scope>): simplify <what>

Refactor <what> for better clarity

Improvements:
- <improvement>

No functional changes.
```

### 3. 重命名模式
```
refactor(<scope>): rename <what>

Rename <what> for clarity

Breaking change for external consumers.
Migration guide: <link>
```

### 4. 性能模式
```
refactor(<scope>): optimize <what>

Optimize <what> from O(n²) to O(n)

Performance:
- <metric>: <before> → <after>

No functional changes.
```

---

**记住：** 重构是为了改善代码质量，不是为了改变功能。确保每一步都是可逆的，并持续验证功能正确性。
