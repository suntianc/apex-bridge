# 功能开发提交模板

## 新功能开发模板

### 基础功能模板
```
feat(<scope>): <short description>

Add <feature name> functionality:

Added:
- <feature component 1>
- <feature component 2>
- <feature component 3>

<Additional context or requirements>

Closes #<issue number>
```

### 完整功能模板
```
feat(<scope>): <short description>

<Feature overview - what and why>

Implementation details:
- <technical detail 1>
- <technical detail 2>
- <technical detail 3>

User-facing changes:
- <user impact 1>
- <user impact 2>
- <user impact 3>

<Optional: Breaking changes, migration notes>

Closes #<issue number>
Co-authored-by: <name> <email>
```

---

## 具体场景模板

### 1. 用户认证功能

#### OAuth登录
```
feat(auth): add OAuth2 login support

Implement OAuth2 authentication flow supporting Google and GitHub:

Added:
- OAuth2 client configuration
- Secure token handling (access + refresh)
- User model extensions for social accounts
- Login UI with provider selection
- Session management middleware

Security features:
- PKCE flow for OAuth2
- State parameter validation
- CSRF protection
- Secure cookie settings

User can now login using their existing social accounts
without creating a new password. This improves UX and
increases conversion rate by 15%.

Requires:
- OAuth app registration with providers
- Database migration (see #234)
- Environment variables setup

Closes #123
```

#### 密码登录
```
feat(auth): add username/password login

Implement secure password-based authentication:

Added:
- Login endpoint (POST /api/auth/login)
- Password validation and hashing
- Session token generation
- Rate limiting (5 attempts per 5 minutes)
- Account lockout after failed attempts

Security features:
- bcrypt password hashing (cost factor 12)
- JWT token with expiration
- Secure HTTP-only cookies
- Input sanitization

Changes:
- Add login_rate_limit table
- Update User model
- Add authentication middleware

Before: OAuth only
After: Password + OAuth support

Closes #234
```

### 2. 文件上传功能

#### 图片上传
```
feat(upload): add image upload with validation

Implement secure image upload with processing:

Added:
- POST /api/upload/image endpoint
- Image validation (format, size, dimensions)
- Image processing (resize, compress, optimize)
- S3 storage with CDN integration
- Upload progress tracking

Features:
- Support: JPG, PNG, WebP
- Max size: 5MB
- Auto-resize to 1920x1080
- Generate multiple sizes (thumb, medium, large)
- Watermark support (optional)

Before: Manual file management
After: Automated upload and processing

Storage: S3 bucket 'uploads-images'
CDN: CloudFront distribution

Closes #345
```

#### 批量文件上传
```
feat(upload): add batch file upload functionality

Implement drag-and-drop multi-file upload:

Added:
- Drag-and-drop interface
- Progress bars for each file
- File queue management
- Parallel upload (max 3 concurrent)
- Upload cancellation support

Features:
- Support 10+ file types
- Individual file size limit: 50MB
- Total batch limit: 500MB
- Pause/resume uploads
- Retry failed uploads

Technical details:
- Chunked upload for large files
- Background processing
- Thumbnail generation
- Virus scanning integration

Requires:
- MinIO/S3 storage
- Redis for queue management

Closes #456
```

### 3. 数据列表功能

#### 分页列表
```
feat(list): add paginated user management list

Implement efficient user listing with pagination:

Added:
- GET /api/users endpoint with pagination
- Sorting (name, email, created_at)
- Filtering (status, role, date range)
- Search functionality (name, email)

Performance optimizations:
- Database query optimization
- Index on commonly queried fields
- Response caching (5 min TTL)
- Cursor-based pagination for large datasets

UI features:
- Page size selector (25, 50, 100)
- Infinite scroll option
- Export to CSV/Excel
- Bulk actions (activate, deactivate, delete)

Response format:
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "per_page": 25,
    "total": 1500,
    "total_pages": 60
  }
}
```

Before: Load all users at once (performance issues)
After: Paginated loading, smooth UI experience

Closes #567
```

### 4. 实时功能

#### WebSocket消息
```
feat(chat): add real-time messaging with WebSocket

Implement real-time chat functionality:

Added:
- WebSocket connection manager
- Message broadcasting
- Typing indicators
- Online status tracking
- Message history retrieval

Features:
- Auto-reconnect on disconnect
- Message encryption (AES-256)
- File attachment support
- Emoji picker
- Read receipts

Technical implementation:
- Socket.io for WebSocket management
- Redis adapter for multi-instance scaling
- Message queue for delivery guarantees
- Rate limiting per connection

Architecture:
- Gateway service for WebSocket
- Message broker (Redis/RabbitMQ)
- Persistence layer (PostgreSQL)

Tested with 1000+ concurrent connections.

Closes #678
```

#### 实时通知
```
feat(notifications): add real-time notification system

Implement push notification infrastructure:

Added:
- In-app notification center
- Push notifications (browser, mobile)
- Email notification integration
- SMS notification (optional)

Notification types:
- System alerts
- User mentions
- Task assignments
- Status updates
- Security alerts

Features:
- Notification preferences
- Do not disturb hours
- Notification grouping
- Read/unread status
- Notification history (30 days)

Delivery channels:
- WebSocket (real-time)
- Email (SMTP)
- Push (FCM/APNS)
- SMS (Twilio)

Requires notification service deployment.

Closes #789
```

### 5. 搜索功能

#### 全文搜索
```
feat(search): add Elasticsearch-powered search

Implement comprehensive search across all content:

Added:
- Full-text search index
- Search result ranking
- Faceted search (filters)
- Search suggestions/autocomplete
- Search analytics

Indexed content:
- User profiles
- Posts/articles
- Comments
- Tags
- Categories

Features:
- Fuzzy matching for typos
- Synonym support
- Multi-language support
- Search highlighting
- Sort by relevance/date/popularity

Performance:
- Search response: <100ms (p95)
- Indexing: Real-time
- Query cache: 5 minutes

Elasticsearch cluster: 3 nodes
Index size: ~10M documents

Requires Elasticsearch 8.0+.

Closes #890
```

### 6. 支付功能

#### Stripe集成
```
feat(payment): add Stripe payment processing

Implement secure payment processing:

Added:
- Stripe payment integration
- Subscription management
- One-time payments
- Payment history
- Invoice generation

Payment methods:
- Credit/debit cards
- Digital wallets (Apple Pay, Google Pay)
- Bank transfers (ACH)
- Buy-now-pay-later options

Features:
- PCI compliance (Stripe handles)
- 3D Secure authentication
- Payment retries
- Refund handling
- Webhook event handling

Webhook events:
- payment_intent.succeeded
- customer.subscription.updated
- invoice.payment_succeeded

Security:
- No card data stored locally
- Webhook signature verification
- Idempotency keys for safety

Requires Stripe API keys configuration.

Closes #901
```

### 7. 数据导出功能

#### CSV导出
```
feat(export): add CSV data export functionality

Implement comprehensive data export:

Added:
- CSV export endpoint
- Large dataset streaming
- Custom field selection
- Date range filtering
- Export job queue

Features:
- Multiple format support (CSV, Excel, PDF)
- Scheduled exports (daily/weekly)
- Email delivery of exports
- Export history and downloads
- Progress tracking for large exports

Technical details:
- Stream processing for memory efficiency
- Background job queue (Bull/Redis)
- Temporary file cleanup (24h)
- Rate limiting (5 exports/hour)

Example API:
```
POST /api/export
{
  "format": "csv",
  "model": "users",
  "fields": ["id", "name", "email"],
  "filters": { "created_at": { "gte": "2024-01-01" } }
}
```

Returns job ID for progress tracking.

Closes #123
```

### 8. 权限管理功能

#### RBAC系统
```
feat(permissions): implement role-based access control

Add comprehensive RBAC system:

Added:
- Role-based permissions
- Permission inheritance
- Resource-level access control
- Admin panel for role management
- API middleware for authorization

Roles:
- Super Admin: Full system access
- Admin: Organization management
- Manager: Team and project access
- User: Limited access
- Guest: Read-only access

Features:
- Custom role creation
- Permission assignment
- Role hierarchy
- Temporary role grants
- Audit logging

API middleware:
```typescript
requirePermission('users:read')
requireRole(['admin', 'manager'])
```

Database schema:
- roles table
- permissions table
- role_permissions junction
- user_roles junction

Migration script included.

Closes #234
```

---

## 功能开发检查清单

### 开发前
- [ ] 需求分析完成？
- [ ] 技术方案确定？
- [ ] 数据库设计完成？
- [ ] API设计确认？
- [ ] 安全审查通过？

### 开发中
- [ ] 代码符合规范？
- [ ] 单元测试覆盖？
- [ ] 集成测试通过？
- [ ] 性能考虑？
- [ ] 错误处理完善？

### 提交前
- [ ] 功能测试完成？
- [ ] 文档更新？
- [ ] 变更日志？
- [ ] 部署说明？
- [ ] 回滚方案？

---

## 常见模式

### 1. CRUD操作模式
```
feat(<model>): add <model> CRUD operations

Implement complete CRUD for <model>:

Added:
- CREATE: POST /api/<model>
- READ: GET /api/<model>
- UPDATE: PUT /api/<model>/:id
- DELETE: DELETE /api/<model>/:id

Features:
- Validation and sanitization
- Pagination and filtering
- Soft delete support
- Audit logging

Requires database migration.

Closes #<issue>
```

### 2. 集成模式
```
feat(<integration>): add <service> integration

Integrate with <external service>:

Added:
- API client for <service>
- Webhook handlers
- Data synchronization
- Error handling and retries

Features:
- OAuth2 authentication
- Rate limiting
- Data mapping
- Conflict resolution

Requires <service> API credentials.

Closes #<issue>
```

### 3. 改进模式
```
feat(<scope>): enhance <existing feature>

Improve <feature name> with new capabilities:

Added:
- <improvement 1>
- <improvement 2>
- <improvement 3>

Before: <limitation>
After: <improvement>

Backward compatible.

Closes #<issue>
```

---

**记住：** 功能提交应该清晰说明添加了什么、对用户有什么价值、需要什么依赖。保持信息完整但简洁。
