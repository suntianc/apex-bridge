# Bug修复提交模板

## 基础Bug修复模板

### 标准修复
```
fix(<scope>): <short description>

<Problem description>

Root cause: <explanation of why it happened>

Fixed:
- <fix 1>
- <fix 2>
- <fix 3>

Before: <what was wrong>
After: <what is fixed>

Fixes #<issue number>
```

### 详细修复
```
fix(<scope>): <short description>

<Detailed problem description>

Impact:
- <who is affected>
- <how often it occurs>
- <severity level>

Root cause:
<explanation of the underlying issue>

Solution:
<how the issue is fixed>

Testing:
- <test case 1>
- <test case 2>
- <test case 3>

Before: <specific wrong behavior>
After: <specific correct behavior>

Fixes #<issue number>
```

---

## 具体场景模板

### 1. 空指针异常

#### 基础空指针
```
fix(auth): handle null user in session validation

NullPointerException when validating user session
for deleted user accounts.

Root cause: User record deleted without clearing
active sessions.

Fixed:
- Add null check for user lookup
- Clear expired sessions on login
- Add defensive null checks throughout
- Add session cleanup job

Before: Server crash with NPE
After: Graceful handling, redirect to login

Fixes #123
Tested-by: QA Team <qa@company.com>
```

#### 深层空指针
```
fix(api): prevent NPE in nested object traversal

NullPointerException when accessing nested properties
on optional API response fields.

Root cause: Missing null checks for optional nested
objects from external API.

Fixed:
- Add optional chaining (?. operator)
- Implement null-safe accessors
- Add validation layer for API responses
- Update type definitions

Code change:
```typescript
// Before (crash prone)
const name = user.profile.contact.email.name

// After (null safe)
const name = user?.profile?.contact?.email?.name
```

Before: 5+ crashes per hour
After: Zero crashes in 48h testing

Fixes #234
```

### 2. 边界条件

#### 数组越界
```
fix(list): handle empty array in pagination

IndexOutOfBoundsException when paginating empty result sets.

Root cause: Page calculation assumed at least one item.

Fixed:
- Add guard clause for empty arrays
- Return empty result with valid pagination metadata
- Add validation for invalid page numbers
- Add edge case tests

Before: Exception on empty lists
After: Valid empty state with metadata

Edge cases tested:
- Empty list (0 items)
- Single item (1 item)
- Last page
- Invalid page numbers

Fixes #345
```

#### 数值溢出
```
fix(calc): prevent integer overflow in calculation

Calculation overflow causing incorrect results for large numbers.

Root cause: Using 32-bit integer for large aggregations.

Fixed:
- Change to BigInt for large calculations
- Add overflow validation
- Add range checking before calculations
- Update type definitions

Before: Incorrect totals for large datasets
After: Accurate calculations for any size

Tested with:
- Maximum safe integer (2^53-1)
- Larger numbers with BigInt
- Negative number edge cases

Fixes #456
```

### 3. 竞态条件

#### 并发访问
```
fix(cache): resolve race condition in cache update

Stale data in cache due to concurrent write operations.

Root cause: Read-modify-write not atomic,
allowing concurrent modifications.

Fixed:
- Implement optimistic locking
- Use atomic operations (Redis INCRBY)
- Add version field for conflict detection
- Implement retry logic for conflicts

Timeline:
1. Thread A reads: value = 10
2. Thread B reads: value = 10
3. Thread A writes: value = 15
4. Thread B writes: value = 20 (overwrites A's change)

Solution: Atomic increment, version checking

Before: Lost updates in concurrent scenarios
After: Consistent cache state

Fixes #567
```

#### 数据库竞态
```
fix(db): prevent double booking in reservations

Double booking occurs with concurrent reservation requests.

Root cause: Non-atomic check-and-set operations.

Fixed:
- Add database transaction isolation level SERIALIZABLE
- Use SELECT FOR UPDATE to lock rows
- Implement unique constraint on (resource_id, time_slot)
- Add retry logic for conflicts

SQL changes:
```sql
-- Before
INSERT INTO reservations (user_id, resource_id, time_slot)
VALUES (?, ?, ?)

-- After
BEGIN;
SELECT * FROM resources WHERE id = ? FOR UPDATE;
INSERT INTO reservations ...
COMMIT;
```

Before: 15+ double bookings per week
After: Zero double bookings in 2 weeks

Fixes #678
```

### 4. 性能问题

#### 内存泄漏
```
fix(api): fix memory leak in WebSocket connections

Server memory usage grows unbounded, reaching 100% after 48h.

Root cause: WebSocket connections not properly closed,
event listeners not removed.

Fixed:
- Properly close WebSocket on disconnect
- Remove event listeners on cleanup
- Implement connection timeout (30 min)
- Add memory monitoring and alerts

Code change:
```typescript
// Cleanup on disconnect
ws.on('close', () => {
  ws.removeAllListeners()
  clearTimeout(heartbeat)
})

// Heartbeat to detect dead connections
const heartbeat = setInterval(() => {
  if (ws.ping()) return
  ws.terminate()
}, 30000)
```

Before: Server restart required every 2 days
After: Stable memory usage (500MB baseline)

Fixes #789
```

#### 查询性能
```
fix(db): optimize N+1 query in user posts

User profile page loads extremely slow (8+ seconds).

Root cause: N+1 query problem - fetching user then
fetching each post separately.

Fixed:
- Add eager loading with JOIN query
- Add database indexes on foreign keys
- Implement query result caching
- Optimize ORM configuration

Before: 1 + N queries (1 user + N posts)
After: 1 query with JOIN

Query comparison:
```sql
-- Before (N+1)
SELECT * FROM users WHERE id = ?
SELECT * FROM posts WHERE user_id = ?

-- After (single query)
SELECT u.*, p.*
FROM users u
LEFT JOIN posts p ON u.id = p.user_id
WHERE u.id = ?
```

Before: 8.5s for 100 posts
After: 0.3s for 100 posts

Fixes #890
```

### 5. 网络相关

#### 超时处理
```
fix(api): handle network timeout gracefully

Requests hang indefinitely when upstream API is slow.

Root cause: No timeout configured for HTTP requests.

Fixed:
- Add request timeout (30s default, configurable)
- Implement exponential backoff for retries
- Add circuit breaker pattern
- Return meaningful error messages

Configuration:
```typescript
{
  timeout: 30000,
  retries: 3,
  backoff: 'exponential',
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 60000
  }
}
```

Before: Requests hang indefinitely
After: Clear timeout error after 30s

Fixes #901
```

#### 连接池耗尽
```
fix(db): fix connection pool exhaustion

Database connection errors under high load.

Root cause: Connections not properly returned to pool.

Fixed:
- Add try-finally to ensure connection release
- Implement connection timeout
- Increase pool size from 10 to 50
- Add connection pool monitoring

Code change:
```typescript
// Before (connection leak)
const result = await pool.query('SELECT * FROM users')
// Missing: pool.release()

// After (proper cleanup)
const client = await pool.connect()
try {
  const result = await client.query('SELECT * FROM users')
} finally {
  client.release()
}
```

Before: 50+ connection errors per hour under load
After: Zero errors at 500 req/s

Fixes #123
```

### 6. 数据一致性

#### 软删除冲突
```
fix(db): resolve soft delete foreign key issue

Cannot delete parent records due to foreign key constraints
with soft-deleted children.

Root cause: Foreign keys don't account for soft deletes.

Fixed:
- Update foreign key constraints to IGNORE soft deletes
- Add proper cascade delete for soft deletes
- Update queries to exclude soft-deleted records
- Add database migration for constraint updates

Migration:
```sql
-- Update foreign key
ALTER TABLE child_table
DROP CONSTRAINT fk_parent;

ALTER TABLE child_table
ADD CONSTRAINT fk_parent
FOREIGN KEY (parent_id)
REFERENCES parent_table(id)
ON DELETE SET NULL;
```

Before: Cannot delete users with deleted posts
After: Clean deletion with proper handling

Fixes #234
```

### 7. 配置错误

#### 环境变量缺失
```
fix(config): handle missing environment variables

Application crashes on startup when environment
variables are not set.

Root cause: No default values or validation for config.

Fixed:
- Add default values for all config
- Add startup validation script
- Add error messages with解决方案
- Update documentation with required env vars

Required env vars:
- DATABASE_URL (required)
- REDIS_URL (optional, defaults to localhost)
- API_KEY (required)

Before: Silent failures or crashes
After: Clear error messages with setup instructions

Fixes #345
```

### 8. 安全漏洞

#### SQL注入
```
fix(auth): prevent SQL injection in login query

Security vulnerability: SQL injection possible through
username field.

Root cause: String concatenation instead of parameterized queries.

Fixed:
- Replace string concatenation with prepared statements
- Add input sanitization
- Add SQL injection tests
- Update all queries to use parameters

Code change:
```typescript
// Before (vulnerable)
const query = `SELECT * FROM users WHERE username = '${username}'`

// After (safe)
const query = 'SELECT * FROM users WHERE username = $1'
const result = await db.query(query, [username])
```

Security audit completed.
No SQL injection vectors found.

Fixes #456
Reviewed-by: Security Team <security@company.com>
```

#### XSS漏洞
```
fix(ui): prevent XSS in comment rendering

Cross-site scripting vulnerability in comment display.

Root cause: User input not properly escaped before rendering.

Fixed:
- Add HTML escaping for all user input
- Implement Content Security Policy
- Add XSS prevention tests
- Update sanitization library

Code change:
```typescript
// Before (vulnerable)
<div>{comment.content}</div>

// After (safe)
<div>{escapeHtml(comment.content)}</div>
```

Security impact: Critical → Resolved
Penetration testing passed.

Fixes #567
Reviewed-by: Security Team <security@company.com>
```

---

## Bug修复检查清单

### 问题识别
- [ ] 问题可重现？
- [ ] 影响范围明确？
- [ ] 根本原因找到？
- [ ] 相关日志分析？
- [ ] 监控数据检查？

### 修复实施
- [ ] 最小化变更？
- [ ] 不引入新问题？
- [ ] 考虑边缘情况？
- [ ] 性能影响评估？
- [ ] 向后兼容性？

### 测试验证
- [ ] 单元测试覆盖？
- [ ] 集成测试通过？
- [ ] 手动测试完成？
- [ ] 回归测试执行？
- [ ] 性能测试通过？

### 部署准备
- [ ] 变更日志更新？
- [ ] 文档更新？
- [ ] 监控告警更新？
- [ ] 回滚方案准备？
- [ ] 通知相关团队？

---

## 常见Bug类型模式

### 1. 空值处理模式
```
fix(<scope>): handle null/undefined <entity>

<Problem description>

Fixed:
- Add null checks for <entity>
- Add default values where appropriate
- Update validation to reject null

Fixes #<issue>
```

### 2. 边界条件模式
```
fix(<scope>): handle edge case <scenario>

<Problem description>

Edge case: <specific scenario>

Fixed:
- Add validation for edge case
- Add test coverage
- Update documentation

Fixes #<issue>
```

### 3. 性能问题模式
```
fix(<scope>): optimize <operation>

<Performance issue description>

Root cause: <explanation>

Optimizations:
- <optimization 1>
- <optimization 2>

Before: <performance metric>
After: <performance metric>

Fixes #<issue>
```

### 4. 安全问题模式
```
fix(<scope>): fix <vulnerability type> vulnerability

<vulnerability description>

Security impact: <severity>

Fixed:
- <fix 1>
- <fix 2>
- Security tests added

Fixes #<issue>
Reviewed-by: Security Team <security@company.com>
```

---

## 修复质量标准

### ✅ 好的修复
- 清晰说明问题
- 解释根本原因
- 最小化变更
- 包含测试
- 验证修复效果

### ❌ 差的修复
- 只修复表面症状
- 没有解释原因
- 过度工程
- 缺少测试
- 引入新问题

---

**记住：** Bug修复不仅要解决问题，还要理解为什么发生，确保不会再次发生，并从中学习改进。
