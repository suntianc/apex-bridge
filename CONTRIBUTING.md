# 贡献指南

感谢您对 ApexBridge 项目的关注！我们欢迎所有形式的贡献。🎉

## 📋 目录

- [开发环境设置](#-开发环境设置)
- [贡献类型](#-贡献类型)
- [开发流程](#-开发流程)
- [代码规范](#-代码规范)
- [提交规范](#-提交规范)
- [Pull Request 流程](#-pull-request-流程)
- [问题报告](#-问题报告)
- [社区准则](#-社区准则)

## 🚀 开发环境设置

### 📋 前置要求

- **Node.js** >= 16.0.0
- **npm** >= 8.0.0 或 **yarn** >= 1.22.0
- **Git**

### ⚡ 快速开始

```bash
# 1. Fork 项目到你的 GitHub 账户
# 2. 克隆你的 fork
git clone https://github.com/your-username/apex-bridge.git
cd apex-bridge

# 3. 添加原始仓库为 upstream
git remote add upstream https://github.com/suntianc/apex-bridge.git

# 4. 安装依赖
npm run install:all

# 5. 开发模式
npm run dev

# 6. 运行测试
npm test
```

### 📦 安装所有依赖

项目包含多个子模块，使用以下脚本一次性安装所有依赖：

```bash
# 安装所有模块的依赖
npm run install:all

# 或者逐个安装
cd apex-bridge && npm install
cd ../vcp-intellicore-rag && npm install
cd ../vcp-intellicore-sdk && npm install
```

## 🎯 贡献类型

我们欢迎以下类型的贡献：

### 🐛 Bug 报告
- 发现并报告程序错误
- 提供详细的复现步骤
- 提供修复建议

### ✨ 新功能
- 提出新功能建议
- 实现有价值的新功能
- 改进现有功能

### 📚 文档改进
- 改进 README 和其他文档
- 添加代码注释
- 创建教程和示例

### 🧪 测试
- 编写单元测试
- 添加集成测试
- 提高测试覆盖率

### 🛠️ 工具和流程
- 改进构建工具
- 优化开发流程
- 自动化手动任务

## 🔄 开发流程

### 1. 创建分支

```bash
# 从 main 分支创建新分支
git checkout main
git pull upstream main
git checkout -b feature/your-feature-name

# 或者修复 bug
git checkout -b fix/issue-description
```

### 2. 开发和测试

```bash
# 开发模式运行项目
npm run dev

# 运行所有测试
npm test

# 检查代码格式
npm run format:check

# 代码检查
npm run lint
```

### 3. 提交更改

```bash
# 添加更改
git add .

# 提交 (遵循 Conventional Commits)
git commit -m "feat: add new authentication feature"

# 推送到你的 fork
git push origin feature/your-feature-name
```

## 📝 代码规范

### 🎨 代码风格

我们使用以下工具确保代码质量：

- **ESLint** - 代码检查
- **Prettier** - 代码格式化
- **TypeScript** - 类型检查

#### 安装开发工具

```bash
# 编辑器推荐扩展
- ESLint
- Prettier
- TypeScript
- Auto Rename Tag
- Bracket Pair Colorizer
```

#### 代码格式化

```json
// .prettierrc.js 配置
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5"
}
```

### 📋 TypeScript 规范

```typescript
// 使用明确的类型
interface UserConfig {
  id: string;
  name: string;
  email?: string;
}

// 使用泛型
function createService<T>(config: T): Service<T> {
  return new Service<T>(config);
}

// 避免使用 any
const processData = (data: unknown): Result => {
  // 类型检查和处理
};
```

### 🧪 测试规范

```typescript
// 测试文件命名
// UserService.test.ts

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
  });

  describe('createUser', () => {
    it('should create a user with valid data', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com'
      };

      const user = await userService.createUser(userData);

      expect(user.id).toBeDefined();
      expect(user.name).toBe(userData.name);
    });
  });
});
```

## 📝 提交规范

我们遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

### 📋 提交格式

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### 🏷️ 提交类型

- `feat` - 新功能
- `fix` - 修复 bug
- `docs` - 文档更新
- `style` - 代码格式化
- `refactor` - 代码重构
- `test` - 测试相关
- `chore` - 构建工具或辅助工具的变动

### 💡 示例

```bash
feat(auth): add OAuth2 authentication support

Implement OAuth2 authentication flow with support for
GitHub and Google providers.

Closes #123
```

## 🔄 Pull Request 流程

### 1. 创建 Pull Request

```bash
# 推送分支
git push origin feature/your-feature-name

# 在 GitHub 上创建 PR
# 填写 PR 模板
```

### 2. PR 模板

```markdown
## 变更类型
- [ ] Bug 修复
- [ ] 新功能
- [ ] 文档更新
- [ ] 代码重构

## 变更描述
<!-- 描述你的变更内容 -->

## 测试
- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] 手动测试通过

## 检查清单
- [ ] 代码遵循项目规范
- [ ] 自我审查了代码
- [ ] 添加了必要的注释
- [ ] 更新了相关文档

## 相关 Issue
Closes #(issue number)
```

### 3. 代码审查

- 所有 PR 需要至少一个维护者审查
- 自动化检查必须通过
- 解决所有审查意见

### 4. 合并 PR

- 维护者会审查并合并 PR
- 使用 Squash and merge 保持提交历史清洁
- 删除功能分支

## 🐛 问题报告

### Bug 报告模板

```markdown
**Bug 描述**
简要描述 bug

**复现步骤**
1. 执行操作 A
2. 点击按钮 B
3. 观察到错误 C

**期望行为**
描述你期望发生的情况

**实际行为**
描述实际发生的情况

**环境信息**
- OS: [e.g. macOS 13.0]
- Node.js: [e.g. 18.0.0]
- Browser: [e.g. Chrome 108]

**附加信息**
- 截图
- 错误日志
- 相关配置
```

### 功能请求模板

```markdown
**功能描述**
清晰简洁地描述你想要的功能

**问题背景**
描述这个功能要解决的问题

**解决方案**
描述你希望如何实现这个功能

**替代方案**
描述你考虑过的其他解决方案

**附加信息**
- 相关的 issue
- 参考链接
```

## 🤝 社区准则

### 📋 行为准则

我们致力于为每个人提供友好、安全和欢迎的环境，无论：

- 性别、性别认同和表达
- 性取向
- 残疾
- 外貌
- 身体大小
- 种族
- 年龄
- 宗教

### ✅ 期望行为

- 使用友好和包容的语言
- 尊重不同的观点和经验
- 优雅地接受建设性批评
- 关注对社区最有利的事情
- 对其他社区成员表示同理心

### ❌ 不当行为

- 使用性化的语言或图像
- 人身攻击或政治攻击
- 公开或私下骚扰
- 未经明确许可发布他人的私人信息
- 其他在专业环境中可能被认为不当的行为

## 🏆 贡献者认可

我们感谢所有贡献者！贡献者会被添加到：

- [README.md](./README.md) 中的贡献者列表
- [CHANGELOG.md](./CHANGELOG.md) 中记录的贡献
- 项目发布说明中的感谢

### 📊 贡献统计

使用以下命令查看贡献统计：

```bash
# 项目贡献统计
git shortlog -sn

# 个人贡献统计
git log --author="Your Name" --oneline --graph
```

## 📞 获取帮助

如果您需要帮助或有任何问题：

- 💬 [GitHub Discussions](https://github.com/suntianc/apex-bridge/discussions)
- 🐛 [GitHub Issues](https://github.com/suntianc/apex-bridge/issues)
- 📧 [邮件联系](mailto:contact@apexbridge.dev)

## 📚 相关资源

- [项目文档](./docs/)
- [API 参考](./docs/API.md)
- [架构设计](./docs/ARCHITECTURE.md)
- [开发指南](./docs/DEVELOPMENT.md)

---

感谢您的贡献！🎉 您的参与让 ApexBridge 变得更好。