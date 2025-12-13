# 项目文档结构归档方案

## 📁 文档目录结构

```
docs/
├── README.md                          # 文档索引和导航
├── 00-README                          # 项目概述文档
│   ├── README.md                      # 项目主要说明
│   ├── CLAUDE.md                      # Claude使用指南
│   └── AGENTS.md                      # Agent配置说明
│
├── 01-ARCHITECTURE                    # 架构设计文档
│   ├── ACE架构实现方案/
│   │   ├── 00-ACE架构能力实现方案.md
│   │   ├── 01-项目技术栈分析报告.md
│   │   ├── 02-P0阶段详细设计-激活L5L6层.md
│   │   ├── 03-P1阶段详细设计-激活L4层.md
│   │   ├── 04-P2阶段详细设计-激活L2L3层.md
│   │   ├── 05-P3阶段详细设计-激活L1层.md
│   │   ├── 06-P4阶段详细设计-完全剔除外部依赖.md
│   │   └── 07-总体实施指南与风险管理.md
│   └── 工具系统重构方案.md
│
├── 02-IMPLEMENTATION                  # 实施报告
│   ├── P0-IMPLEMENTATION-SUMMARY.md
│   ├── P2-IMPLEMENTATION-SUMMARY.md
│   ├── P3-IMPLEMENTATION-SUMMARY.md
│   ├── P2-FINAL-REPORT.md
│   ├── P4-IMPLEMENTATION-REPORT.md
│   ├── P2-FILE-MANIFEST.md
│   └── P2-README.md
│
├── 03-CONFIGURATION                   # 配置指南
│   ├── config/
│   │   ├── constitution.md            # 伦理宪法
│   │   ├── system-prompt.md
│   │   ├── system-prompt-template-en.md
│   │   └── system-prompt-template-zh.md
│   ├── ACE-CONFIG.md                  # ACE配置说明
│   └── ACE-CONFIG-IMPLEMENTATION-REPORT.md
│
├── 04-TESTING                         # 测试文档
│   ├── TESTING-QUICKSTART.md          # 快速测试指南
│   ├── ACE-MANUAL-TESTING-GUIDE.md    # 完整测试手册
│   ├── ACE-FINAL-VERIFICATION-REPORT.md # 最终验证报告
│   ├── ACE-INTEGRATION-TEST-REPORT.md
│   └── examples/
│       └── ACE-Layer-Config-Example.md
│
├── 05-TROUBLESHOOTING                 # 故障排查和修复
│   ├── ACE-MEMORY-LEAK-FIXES.md       # 内存泄漏修复
│   ├── ACE-IMPLEMENTATION-REVIEW-REPORT.md # 代码审查报告
│   ├── ACE-LAYER-CONFIG-IMPLEMENTATION.md
│   └── AUTO_CLEANUP_MECHANISM.md      # 自动清理机制
│
└── 06-REFERENCES                      # 参考文档
    ├── openspec/
    │   ├── AGENTS.md
    │   ├── project.md
    │   └── specs/
    ├── tools/                         # 工具和脚本说明
    └── SKILLS_FIX_SUMMARY.md
```

## 📋 归档原则

### 1. 按功能分类
- **架构设计**: 所有架构相关文档
- **实施报告**: 各阶段实施成果
- **配置指南**: 配置相关文档
- **测试文档**: 测试指南和报告
- **故障排查**: 问题修复和审查报告

### 2. 按阶段组织
- **P0-P4阶段**: 按实施阶段分别归档
- **时间顺序**: 同一阶段的文档按时间排序

### 3. 按重要性分层
- **核心文档**: 架构设计、实施报告
- **辅助文档**: 配置、测试
- **参考文档**: 工具、模板

## 🔄 归档步骤

### 第一步：创建目录结构
```bash
mkdir -p docs/00-README
mkdir -p docs/01-ARCHITECTURE/ACE架构实现方案
mkdir -p docs/02-IMPLEMENTATION
mkdir -p docs/03-CONFIGURATION/config
mkdir -p docs/04-TESTING/examples
mkdir -p docs/05-TROUBLESHOOTING
mkdir -p docs/06-REFERENCES/openspec
```

### 第二步：移动文档到对应目录
```bash
# 1. 移动README和项目概述文档
mv README.md docs/00-README/
mv CLAUDE.md docs/00-README/
mv AGENTS.md docs/00-README/

# 2. 移动ACE架构实现方案
mv ACE架构实现方案/ docs/01-ARCHITECTURE/

# 3. 移动实施报告
mv P*-IMPLEMENTATION*.md docs/02-IMPLEMENTATION/
mv P*-FINAL-REPORT.md docs/02-IMPLEMENTATION/
mv P*-README.md docs/02-IMPLEMENTATION/
mv P*-FILE-MANIFEST.md docs/02-IMPLEMENTATION/

# 4. 移动配置文件
mv config/constitution.md docs/03-CONFIGURATION/config/
mv config/system-prompt*.md docs/03-CONFIGURATION/config/
mv ACE-CONFIG.md docs/03-CONFIGURATION/
mv ACE-CONFIG-IMPLEMENTATION-REPORT.md docs/03-CONFIGURATION/

# 5. 移动测试文档
mv TESTING-QUICKSTART.md docs/04-TESTING/
mv ACE-MANUAL-TESTING-GUIDE.md docs/04-TESTING/
mv ACE-FINAL-VERIFICATION-REPORT.md docs/04-TESTING/
mv ACE-INTEGRATION-TEST-REPORT.md docs/04-TESTING/
mv examples/ACE-Layer-Config-Example.md docs/04-TESTING/examples/

# 6. 移动故障排查文档
mv ACE-MEMORY-LEAK-FIXES.md docs/05-TROUBLESHOOTING/
mv ACE-IMPLEMENTATION-REVIEW-REPORT.md docs/05-TROUBLESHOOTING/
mv ACE-LAYER-CONFIG-IMPLEMENTATION.md docs/05-TROUBLESHOOTING/
mv AUTO_CLEANUP_MECHANISM.md docs/05-TROUBLESHOOTING/

# 7. 移动参考文档
mv 工具系统重构方案.md docs/01-ARCHITECTURE/
mv SKILLS_FIX_SUMMARY.md docs/06-REFERENCES/
mv openspec/ docs/06-REFERENCES/
```

### 第三步：创建文档索引
创建 `docs/README.md` 作为文档导航入口。

### 第四步：更新文档链接
检查并更新文档中的相互引用。

## 📝 注意事项

1. **保持文件完整性**: 归档过程中确保所有文档完整移动
2. **更新内部链接**: 移动后需要更新文档间的相对链接
3. **备份重要文档**: 归档前建议备份关键文档
4. **更新.gitignore**: 确保归档后的目录结构被版本控制跟踪

## ✅ 归档完成检查

- [ ] 所有文档已移动到合适目录
- [ ] 文档索引已创建
- [ ] 内部链接已更新
- [ ] 目录结构清晰合理
- [ ] 新开发者可以通过文档索引快速找到所需文档

