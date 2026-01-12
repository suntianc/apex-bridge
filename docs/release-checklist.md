# ApexBridge 发布检查清单

## 发布前检查

### ✅ 代码质量

- [ ] 所有测试通过: `npm test`
- [ ] 代码覆盖率 > 80%: `npm run test:coverage`
- [ ] 无安全漏洞: `npm audit`
- [ ] 无 lint 错误: `npm run lint`
- [ ] 代码格式正确: `npm run format:check`

### ✅ 文档更新

- [ ] API 文档已更新 (`docs/api-reference.md`)
- [ ] 架构文档已更新 (`docs/architecture.md`)
- [ ] 快速开始指南已更新 (`docs/getting-started.md`)
- [ ] Changelog 已生成 (`scripts/generate-changelog.ts`)
- [ ] README 版本信息已更新

### ✅ 版本管理

- [ ] 版本号已更新 (`package.json`)
- [ ] 版本号符合语义化版本规范 (semver)
- [ ] Git 标签已创建
- [ ] 发布分支已合并到主分支

---

## 测试验证

### 单元测试

```bash
npm test
```

- [ ] 所有单元测试通过
- [ ] 核心模块覆盖率 > 80%

### 集成测试

```bash
npm run test:integration
```

- [ ] API 端点测试通过
- [ ] 数据库操作测试通过
- [ ] LLM 适配器测试通过

### 性能测试

```bash
npm run test:performance
```

- [ ] 响应时间 < 500ms
- [ ] 内存使用正常
- [ ] 并发连接正常

### 手动测试

- [ ] 基础聊天功能正常
- [ ] 上下文压缩功能正常
- [ ] MCP 集成功能正常
- [ ] 工具调用功能正常

---

## 发布步骤

### 1. 准备发布

```bash
# 创建发布分支
git checkout -b release/v1.0.2

# 更新版本号
npm version patch  # patch | minor | major

# 生成 Changelog
npx ts-node scripts/generate-changelog.ts
```

### 2. 验证检查项

- [ ] 执行所有发布前检查
- [ ] 执行所有测试验证
- [ ] 更新文档版本号

### 3. 提交更改

```bash
# 添加更改
git add .

# 提交
git commit -m "chore(release): v1.0.2"

# 创建标签
git tag v1.0.2
```

### 4. 推送代码和标签

```bash
# 推送代码
git push origin release/v1.0.2

# 推送标签
git push origin v1.0.2
```

### 5. 发布 NPM 包 (如需要)

```bash
# 构建
npm run build

# 发布
npm publish
```

### 6. 创建 GitHub Release

```bash
# 使用 GitHub CLI
gh release create v1.0.2 \
  --title "ApexBridge v1.0.2" \
  --notes "$(cat CHANGELOG.md)"
```

---

## 回滚策略

### 快速回滚

```bash
# 回滚到上一版本
npx ts-node scripts/rollback.ts --quick

# 回滚到指定版本
npx ts-node scripts/rollback.ts --version v1.0.1
```

### 回滚检查项

- [ ] 服务已停止
- [ ] 代码已回滚
- [ ] 数据库已回滚 (如需要)
- [ ] 服务已重启
- [ ] 功能验证通过

### 回滚决策标准

| 严重程度  | 条件           | 决策         |
| --------- | -------------- | ------------ |
| P0 - 严重 | 服务完全不可用 | 立即回滚     |
| P1 - 高   | 核心功能损坏   | 30分钟内回滚 |
| P2 - 中   | 次要功能问题   | 评估后决定   |
| P3 - 低   | 文档/样式问题  | 不需要回滚   |

---

## 发布后验证

### 健康检查

```bash
# 检查服务状态
curl http://localhost:8088/health

# 检查 API 版本
curl http://localhost:8088/api/version
```

### 功能验证

- [ ] 聊天功能正常
- [ ] 工具调用正常
- [ ] 上下文压缩正常
- [ ] MCP 集成正常

### 监控检查

- [ ] 日志无异常错误
- [ ] 性能指标正常
- [ ] 错误率 < 0.1%

---

## 常见问题

### Q: 版本号如何选择？

- **patch**: Bug 修复 (v1.0.0 → v1.0.1)
- **minor**: 新功能 (v1.0.0 → v1.1.0)
- **major**: 破坏性变更 (v1.0.0 → v2.0.0)

### Q: 回滚后需要做什么？

1. 在问题跟踪系统中记录回滚原因
2. 创建修复任务
3. 修复后重新测试
4. 发布修复版本

### Q: 如何跳过某些检查？

```bash
# 跳过测试
npm run release -- --skip-tests

# 跳过 lint
npm run release -- --skip-lint
```

---

## 版本历史

| 版本   | 日期 | 变更类型 | 说明           |
| ------ | ---- | -------- | -------------- |
| v1.0.0 | -    | major    | 初始发布       |
| v1.0.1 | -    | patch    | Bug 修复和优化 |
| v1.0.2 | -    | -        | 当前版本       |
