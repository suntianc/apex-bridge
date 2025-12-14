# 项目特定提交示例

## Web应用项目

### React前端应用

#### 功能开发
```
feat(ui): add dark mode toggle to settings page

Implement theme switching with system preference detection:

Added:
- ThemeContext for state management
- Dark mode toggle component
- System preference detection
- Smooth transition animations

Changes:
- Update color scheme variables
- Add theme persistence (localStorage)
- Update component library styles

User can now switch between light/dark themes.
System preference is detected on first visit.

Closes #123
Reviewed-by: Alice Johnson <alice@company.com>
```

#### 组件重构
```
refactor(ui): extract Button component to shared library

Move Button component to @company/ui package:

Changes:
- Extract Button styles to CSS modules
- Add TypeScript type definitions
- Update prop interface
- Add comprehensive tests

Before: Duplicate button styles across components
After: Single source of truth, 40% less CSS

Breaking change requires migration:
npm run migrate:button-component

All tests pass, +25 new unit tests added.

Reviewed-by: Bob Chen <bob@company.com>
```

#### Bug修复
```
fix(ui): prevent modal backdrop click from closing dialog

Previously, clicking anywhere on the backdrop closed
the modal, causing accidental closures.

Fixed:
- Add click event propagation check
- Only close when clicking outside modal content
- Add visual feedback for clickable area

Before: 15% accidental closures in user testing
After: Only intentional backdrop clicks close modal

Fixes #234
```

### Vue.js应用

#### 新功能
```
feat(chat): add real-time messaging with WebSocket

Implement real-time chat functionality:

Added:
- WebSocket connection manager
- Message bubble components
- Typing indicators
- Message persistence
- Unread count badges

Features:
- Auto-reconnect on disconnect
- Message encryption
- File attachment support
- Emoji picker

Requires backend WebSocket endpoint (see #345)

Closes #234
```

#### 性能优化
```
perf(ui): optimize virtual list rendering

Improve rendering performance for large datasets:

Optimizations:
- Use Vue.js Virtual Scrolling
- Lazy load images with Intersection Observer
- Debounced scroll handler
- Memoize expensive calculations

Results:
- Rendering time: -70% (1200ms -> 360ms)
- Memory usage: -45%
- Smooth 60fps scrolling for 10k+ items

Tested with 10,000 message dataset.

Closes #345
```

---

## API后端项目

### Node.js/Express

#### 新端点
```
feat(api): add user profile management endpoints

Implement complete profile CRUD operations:

Added:
- GET /api/users/:id/profile
- PUT /api/users/:id/profile
- POST /api/users/:id/avatar
- DELETE /api/users/:id/avatar

Features:
- Image upload with validation
- Profile completeness scoring
- Privacy settings
- Activity tracking

Requires database migration (see migration/007.sql)

Rate limits: 100 req/min per user

Closes #456
```

#### 中间件开发
```
feat(middleware): add rate limiting per endpoint

Implement flexible rate limiting:

Added:
- RateLimit middleware
- Redis-backed token bucket
- Per-endpoint configuration
- Admin dashboard for limits

Configuration:
- GET /api/posts: 1000 req/hour
- POST /api/posts: 50 req/hour
- Admin endpoints: 100 req/hour

Before: No protection, occasional abuse
After: Automatic throttling, 99% reduction in abuse

Requires Redis 6.0+

Closes #567
```

#### 数据库迁移
```
feat(db): add user sessions table

Add support for persistent user sessions:

Migration: 20240115_add_user_sessions.sql

Added:
- user_sessions table
- Session index on user_id
- TTL-based cleanup job
- Session validation middleware

Features:
- Support for multiple devices
- Session revocation
- Activity logging

Rollback: down migration if issues arise

Tested on staging with 10k concurrent users.

Closes #678
```

### Python/Django

#### 模型更新
```
feat(models): add activity tracking to User model

Track user activity for analytics:

Added to User model:
- last_login_at
- login_count
- created_at
- updated_at

Migration: 0007_user_activity_tracking

Added signals:
- Track successful logins
- Update activity timestamps
- Increment login counter

Benefits:
- Identify inactive users
- Track engagement metrics
- Improve security monitoring

All tests pass, 95% coverage.

Closes #789
```

#### API视图
```
feat(views): add paginated post list API

Create efficient post listing endpoint:

Added:
- PostListView with pagination
- Filtering by category/date
- Search functionality
- Sort options (date, popularity)

Performance:
- Database query optimization
- Response caching (Redis)
- Serializer performance tuning

Before: No pagination, slow for large datasets
After: Fast loading, 100 items per page

Pagination info included in response headers.

Closes #890
```

---

## 移动应用项目

### React Native

#### 导航功能
```
feat(nav): implement tab navigation with deep linking

Add comprehensive navigation system:

Added:
- Tab bar with 5 main sections
- Deep linking support
- Navigation state persistence
- Screen transition animations

Features:
- Support for modal presentations
- Nested navigation stacks
- Hardware back button handling
- Accessibility support

Tested on iOS 14+ and Android 8+

Closes #901
```

#### 平台特定代码
```
feat(ios): add Face ID authentication

Implement biometric authentication for iOS:

Added:
- FaceID/TouchID verification
- Secure enclave integration
- Fallback to password
- Keychain storage for tokens

Security:
- Store tokens in iOS Keychain
- Automatic token rotation
- Biometric enrollment check

Requires: iOS 13+, Xcode 14+

Not supported on older devices.

Closes #123
```

### Flutter

#### 跨平台组件
```
feat(ui): create custom button component library

Build reusable button system:

Created:
- PrimaryButton widget
- SecondaryButton widget
- IconButton widget
- LoadingButton variant

Features:
- Consistent design system
- Platform-adaptive styles
- Accessibility labels
- Animation support

Before: Inconsistent buttons across screens
After: Unified design, easier maintenance

Used across 15+ screens.

Closes #234
```

---

## 基础设施项目

### Docker/容器化

#### Dockerfile优化
```
refactor(docker): multi-stage build for smaller images

Reduce Docker image size by 60%:

Changes:
- Multi-stage build process
- Use Alpine Linux base
- Copy only necessary files
- Layer caching optimization

Before: 1.2GB image size
After: 480MB image size

Build time: -40% (faster cache hits)
Deploy time: -50% (smaller image transfer)

Verified on staging environment.

Reviewed-by: DevOps Team <devops@company.com>
```

#### Kubernetes部署
```
feat(k8s): add horizontal pod autoscaling

Implement HPA for production workloads:

Added:
- HPA configuration for API deployment
- CPU/Memory based scaling
- Custom metrics integration
- Scaling policies

Configuration:
- Min replicas: 3
- Max replicas: 20
- Target CPU: 70%
- Scale up: 2 min
- Scale down: 5 min

Before: Manual scaling, frequent over-provisioning
After: Automatic scaling, 30% cost reduction

Requires metrics-server installation.

Closes #345
```

### Terraform/Infrastructure as Code

#### 云资源配置
```
feat(infra): provision S3 buckets with lifecycle policies

Configure S3 for cost optimization:

Added:
- s3-logs bucket (Glacier transition)
- s3-assets bucket (Infrequent Access)
- s3-backups bucket (Deep Archive)

Lifecycle Policies:
- Logs: Standard -> Glacier after 30 days
- Backups: IA -> Deep Archive after 90 days

Cost impact: -45% storage costs
Backup retention: 7 years compliance

Requires IAM role updates.

Closes #456
```

---

## 数据项目

### 数据仓库

#### ETL流程
```
feat(etl): add daily user analytics pipeline

Implement automated analytics data pipeline:

Added:
- Extract: API data collection
- Transform: Data cleaning and aggregation
- Load: PostgreSQL warehouse
- Scheduling: Airflow DAGs

Metrics:
- Daily active users
- Feature usage statistics
- Cohort analysis
- Revenue tracking

Pipeline runs daily at 02:00 UTC

Before: Manual reporting, 2 days delay
After: Automated pipeline, real-time analytics

Data quality: 99.9% completeness verified.

Closes #567
```

#### 数据模型
```
feat(models): add dimension tables for analytics

Create dimensional data model:

Added tables:
- dim_date (calendar dimensions)
- dim_user (user attributes)
- dim_product (product catalog)
- dim_channel (acquisition sources)

Star schema design:
- Fact table: fact_user_events
- 4 dimension tables
- Proper indexing strategy

Benefits:
- Faster analytical queries
- Better query planning
- Simplified BI tool integration

Migration tested on 10M+ records.

Closes #678
```

---

## 机器学习项目

### 模型训练

#### 模型更新
```
feat(ml): deploy recommendation model v2.1

Deploy updated recommendation algorithm:

Model changes:
- Neural network architecture update
- Feature engineering improvements
- Hyperparameter tuning
- Cross-validation results

Performance:
- Accuracy: 0.82 -> 0.87 (+5%)
- Precision: 0.79 -> 0.85 (+6%)
- Recall: 0.85 -> 0.89 (+4%)

Requires model registry update
Requires inference pipeline update

A/B test results in #789

Closes #789
```

#### 数据处理
```
feat(ml): add feature store for real-time inference

Implement feature store infrastructure:

Added:
- Feature definition schema
- Real-time feature serving
- Feature versioning
- Data quality checks

Features:
- User embeddings
- Item embeddings
- Interaction history
- Contextual signals

Latency: <50ms p99
Data freshness: <1 second

Requires Redis cluster deployment.

Closes #890
```

---

## 开源项目

### 库/框架开发

#### API设计
```
feat(api): add plugin system architecture

Design extensible plugin architecture:

Added:
- Plugin interface definition
- Plugin lifecycle hooks
- Dependency injection
- Event system

Plugin API:
- init() - plugin initialization
- execute() - main functionality
- destroy() - cleanup

Example plugins included in /examples/

Documentation: https://docs.company.com/plugins

Breaking change for plugin developers.

Closes #901
```

#### 兼容性更新
```
feat(compat): add Node.js 20 support

Update project to support Node.js 20:

Changes:
- Update engine requirements
- Fix deprecated API usage
- Update test matrix
- Update CI/CD pipelines

Compatibility:
- Node.js 18: Supported
- Node.js 19: Supported
- Node.js 20: Supported

Breaking: Dropped Node.js 16 support

Migration guide in docs/migration.md

Closes #123
```

---

## 团队协作示例

### 跨团队协作

#### API合同
```
feat(api): implement GraphQL schema v2

Create new GraphQL API version:

Schema:
- Full CRUD operations
- Real-time subscriptions
- Batch loading
- Custom scalars

Collaboration:
- Frontend team: Schema review ✓
- Backend team: Implementation ✓
- QA team: Test coverage ✓

Migration:
- v1 API: Deprecation notice
- v2 API: Full feature parity
- Sunset: 2024-06-01

Co-authored-by: Frontend Team <frontend@company.com>
Co-authored-by: Backend Team <backend@company.com>

Closes #234
```

#### 文档协作
```
docs(api): create comprehensive migration guide

Document v1 to v2 API migration:

Added:
- Breaking changes section
- Migration examples
- Code snippets (10 languages)
- Video tutorials
- Interactive playground

Contributors:
- @alice - Initial draft
- @bob - Technical review
- @charlie - Examples review
- @diana - Final review

Published at: https://docs.company.com/migration

Reviewed-by: Technical Writing Team
```

---

## 检查清单

### 项目特定检查
- [ ] 技术栈相关约定遵循？
- [ ] 项目特有的类型使用正确？
- [ ] 依赖变更已说明？
- [ ] 部署相关说明充分？
- [ ] 迁移指南已提供？

### 跨团队协作检查
- [ ] 相关团队已通知？
- [ ] 依赖关系已说明？
- [ ] 接口变更已协调？
- [ ] 测试覆盖已确认？
- [ ] 文档已更新？

---

**记住：** 不同项目有不同的约定和要求。了解项目特点，写出符合项目风格的提交信息。
