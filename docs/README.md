# 📚 ApexBridge 项目文档中心

> 项目文档已按功能分类整理到以下目录

## 📂 文档导航

### 🏠 [00-README - 项目概述](00-README/README.md)
项目的基础信息和说明文档
- **README.md** - 项目主要说明（安装、部署、使用）
- **CLAUDE.md** - Claude Code使用指南
- **AGENTS.md** - Agent配置说明

### 🏗️ [01-ARCHITECTURE - 架构设计](01-ARCHITECTURE/)
ACE架构设计和系统架构文档

#### ACE架构实现方案
- **[00-ACE架构能力实现方案.md](01-ARCHITECTURE/ACE架构实现方案/ACE架构能力实现方案.md)** - 总体架构方案
- **[01-项目技术栈分析报告.md](01-ARCHITECTURE/ACE架构实现方案/01-项目技术栈分析报告.md)** - 技术栈分析
- **[02-P0阶段详细设计-激活L5L6层.md](01-ARCHITECTURE/ACE架构实现方案/02-P0阶段详细设计-激活L5L6层.md)** - L5/L6层实现
- **[03-P1阶段详细设计-激活L4层.md](01-ARCHITECTURE/ACE架构实现方案/03-P1阶段详细设计-激活L4层.md)** - L4层实现
- **[04-P2阶段详细设计-激活L2L3层.md](01-ARCHITECTURE/ACE架构实现方案/04-P2阶段详细设计-激活L2L3层.md)** - L2/L3层实现
- **[05-P3阶段详细设计-激活L1层.md](01-ARCHITECTURE/ACE架构实现方案/05-P3阶段详细设计-激活L1层.md)** - L1层实现
- **[06-P4阶段详细设计-完全剔除外部依赖.md](01-ARCHITECTURE/ACE架构实现方案/06-P4阶段详细设计-完全剔除外部依赖.md)** - 零依赖实现
- **[07-总体实施指南与风险管理.md](01-ARCHITECTURE/ACE架构实现方案/07-总体实施指南与风险管理.md)** - 实施指南

#### 其他架构文档
- **[工具系统重构方案.md](01-ARCHITECTURE/工具系统重构方案.md)** - 工具系统重构方案

### 📊 [02-IMPLEMENTATION - 实施报告](02-IMPLEMENTATION/)
ACE架构各阶段实施成果报告

#### 按阶段分类
- **P0阶段**: [P0-IMPLEMENTATION-SUMMARY.md](02-IMPLEMENTATION/P0-IMPLEMENTATION-SUMMARY.md)
- **P2阶段**: 
  - [P2-IMPLEMENTATION-SUMMARY.md](02-IMPLEMENTATION/P2-IMPLEMENTATION-SUMMARY.md)
  - [P2-FINAL-REPORT.md](02-IMPLEMENTATION/P2-FINAL-REPORT.md)
  - [P2-FILE-MANIFEST.md](02-IMPLEMENTATION/P2-FILE-MANIFEST.md)
  - [P2-README.md](02-IMPLEMENTATION/P2-README.md)
- **P3阶段**: [P3-IMPLEMENTATION-SUMMARY.md](02-IMPLEMENTATION/P3-IMPLEMENTATION-SUMMARY.md)
- **P4阶段**: [P4-IMPLEMENTATION-REPORT.md](02-IMPLEMENTATION/P4-IMPLEMENTATION-REPORT.md)

### ⚙️ [03-CONFIGURATION - 配置指南](03-CONFIGURATION/)
系统配置和部署相关文档

#### 配置文件
- **[constitution.md](03-CONFIGURATION/config/constitution.md)** - 伦理宪法（ACE L1层）
- **system-prompt.md** - 系统提示词模板
- **system-prompt-template-en.md** - 英文提示词模板
- **system-prompt-template-zh.md** - 中文提示词模板

#### 配置文档
- **[ACE-CONFIG.md](03-CONFIGURATION/ACE-CONFIG.md)** - ACE架构配置说明
- **[ACE-CONFIG-IMPLEMENTATION-REPORT.md](03-CONFIGURATION/ACE-CONFIG-IMPLEMENTATION-REPORT.md)** - 配置实施报告

### 🧪 [04-TESTING - 测试文档](04-TESTING/)
测试指南、测试报告和验证文档

#### 测试指南
- **[TESTING-QUICKSTART.md](04-TESTING/TESTING-QUICKSTART.md)** - 5分钟快速测试指南 ⭐
- **[ACE-MANUAL-TESTING-GUIDE.md](04-TESTING/ACE-MANUAL-TESTING-GUIDE.md)** - 完整测试手册

#### 测试报告
- **[ACE-FINAL-VERIFICATION-REPORT.md](04-TESTING/ACE-FINAL-VERIFICATION-REPORT.md)** - 最终验证报告 ⭐
- **[ACE-INTEGRATION-TEST-REPORT.md](04-TESTING/ACE-INTEGRATION-TEST-REPORT.md)** - 集成测试报告

#### 示例
- **examples/ACE-Layer-Config-Example.md** - ACE层级配置示例

### 🔧 [05-TROUBLESHOOTING - 故障排查](05-TROUBLESHOOTING/)
问题修复、代码审查和故障排查指南

- **[ACE-MEMORY-LEAK-FIXES.md](05-TROUBLESHOOTING/ACE-MEMORY-LEAK-FIXES.md)** - 内存泄漏修复报告
- **[ACE-IMPLEMENTATION-REVIEW-REPORT.md](05-TROUBLESHOOTING/ACE-IMPLEMENTATION-REVIEW-REPORT.md)** - 代码审查报告
- **[ACE-LAYER-CONFIG-IMPLEMENTATION.md](05-TROUBLESHOOTING/ACE-LAYER-CONFIG-IMPLEMENTATION.md)** - 层级配置实施报告
- **[AUTO_CLEANUP_MECHANISM.md](05-TROUBLESHOOTING/AUTO_CLEANUP_MECHANISM.md)** - 自动清理机制说明

### 📖 [06-REFERENCES - 参考文档](06-REFERENCES/)
工具说明、OpenSpec规范和参考资料

- **openspec/** - OpenSpec规范文档
  - [AGENTS.md](06-REFERENCES/openspec/AGENTS.md)
  - [project.md](06-REFERENCES/openspec/project.md)
  - [specs/](06-REFERENCES/openspec/specs/) - 规范规格文档
- **[SKILLS_FIX_SUMMARY.md](06-REFERENCES/SKILLS_FIX_SUMMARY.md)** - Skills系统修复总结

---

## 🎯 快速导航

### 新开发者必读
1. **[项目README](00-README/README.md)** - 项目概述和快速开始
2. **[ACE架构总方案](01-ARCHITECTURE/ACE架构实现方案/ACE架构能力实现方案.md)** - 了解ACE架构
3. **[快速测试指南](04-TESTING/TESTING-QUICKSTART.md)** - 5分钟上手测试

### 部署和配置
1. **[ACE配置说明](03-CONFIGURATION/ACE-CONFIG.md)** - ACE架构配置
2. **[伦理宪法](03-CONFIGURATION/config/constitution.md)** - L1层道德约束

### 测试和验证
1. **[最终验证报告](04-TESTING/ACE-FINAL-VERIFICATION-REPORT.md)** - 查看实施成果
2. **[测试手册](04-TESTING/ACE-MANUAL-TESTING-GUIDE.md)** - 完整测试指南

### 问题排查
1. **[内存泄漏修复](05-TROUBLESHOOTING/ACE-MEMORY-LEAK-FIXES.md)** - 内存问题修复
2. **[代码审查报告](05-TROUBLESHOOTING/ACE-IMPLEMENTATION-REVIEW-REPORT.md)** - 代码质量审查

---

## 📋 文档贡献指南

### 添加新文档
1. 根据文档内容选择合适的目录
2. 使用清晰的文件名（使用中划线分隔）
3. 在文件开头添加简洁的描述
4. 更新本文档的导航索引

### 更新文档
1. 保持文档与代码同步
2. 更新文档最后修改时间
3. 如有破坏性变更，添加迁移说明

### 文档规范
- 使用Markdown格式
- 文件编码：UTF-8
- 标题层级：不超过4级
- 包含目录（如适用）

---

## 🔗 相关链接

- **项目主页**: https://github.com/suntianc/apex-bridge
- **API文档**: http://localhost:8088/api/docs
- **健康检查**: http://localhost:8088/health

---

**文档维护**: 项目团队  
**最后更新**: 2025-12-13  
**版本**: v1.0.1
