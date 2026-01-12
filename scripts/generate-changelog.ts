#!/usr/bin/env ts-node
/**
 * ApexBridge 变更日志生成脚本
 *
 * 功能：
 * 1. 从 git commits 生成 changelog
 * 2. 按类型分类 (feat, fix, perf, etc.)
 * 3. 支持自定义版本范围
 * 4. 生成 Markdown 格式
 *
 * 使用方法：
 *   npx ts-node scripts/generate-changelog.ts
 *   npx ts-node scripts/generate-changelog.ts --from v1.0.0 --to v1.1.0
 *   npx ts-node scripts/generate-changelog.ts --output CHANGELOG.md
 *   npx ts-node scripts/generate-changelog.ts --stdout
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const PROJECT_ROOT = path.join(__dirname, "..");
const CHANGELOG_PATH = path.join(PROJECT_ROOT, "CHANGELOG.md");

interface CommitInfo {
  hash: string;
  type: string;
  scope: string;
  subject: string;
  body: string;
  breaking: boolean;
  author: string;
  date: string;
}

interface ChangelogOptions {
  from?: string;
  to?: string;
  output?: string;
  stdout: boolean;
  dryRun: boolean;
}

interface VersionEntry {
  version: string;
  date: string;
  commits: CommitInfo[];
  breaking: boolean;
}

/**
 * commit 类型到中文映射
 */
const TYPE_MAPPING: Record<string, { section: string; emoji: string }> = {
  feat: { section: "✨ 新功能", emoji: "✨" },
  fix: { section: "🐛 Bug 修复", emoji: "🐛" },
  perf: { section: "⚡ 性能优化", emoji: "⚡" },
  refactor: { section: "♻️ 重构", emoji: "♻️" },
  docs: { section: "📚 文档", emoji: "📚" },
  style: { section: "💄 代码格式", emoji: "💄" },
  test: { section: "✅ 测试", emoji: "✅" },
  build: { section: "👷 构建", emoji: "👷" },
  ci: { section: "🔧 CI/CD", emoji: "🔧" },
  chore: { section: "🔩 其他杂项", emoji: "🔩" },
  revert: { section: "⏪ 回滚", emoji: "⏪" },
};

/**
 * 解析 commit 消息
 */
function parseCommit(commitLine: string): CommitInfo | null {
  // Conventional commit 格式: <type>(<scope>): <subject>
  const pattern = /^(\w+)(?:\(([^)]+)\))?: (.+)$/;
  const match = commitLine.match(pattern);

  if (!match) {
    return null;
  }

  const [_, type, scope, subject] = match;

  return {
    hash: "",
    type,
    scope: scope || "",
    subject,
    body: "",
    breaking: subject.toLowerCase().includes("breaking change") || subject.startsWith("!"),
    author: "",
    date: "",
  };
}

/**
 * 获取 commit 详情
 */
function getCommitDetails(hash: string): Partial<CommitInfo> {
  try {
    const output = execSync(`git log -1 --format="%H|%an|%ad|%s|%b" --date=short "${hash}"`, {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
    }).trim();

    const [commitHash, author, date, subject, body] = output.split("|");

    return {
      hash: commitHash,
      author,
      date,
      subject,
      body: body || "",
      breaking: subject.toLowerCase().includes("breaking change") || subject.startsWith("!"),
    };
  } catch {
    return {};
  }
}

/**
 * 获取版本范围内的 commits
 */
function getCommits(from?: string, to?: string): string[] {
  try {
    let range = "";

    if (from && to) {
      range = `${from}..${to}`;
    } else if (from) {
      range = `${from}..HEAD`;
    } else if (to) {
      range = `HEAD~100..${to}`;
    } else {
      range = "HEAD~100";
    }

    const output = execSync(`git log --oneline ${range}`, {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
    }).trim();

    return output
      .split("\n")
      .filter(
        (line) =>
          line.trim() && !line.includes("Merge pull request") && !line.includes("Merge branch")
      );
  } catch {
    return [];
  }
}

/**
 * 按类型分组 commits
 */
function groupCommitsByType(commits: CommitInfo[]): Record<string, CommitInfo[]> {
  const groups: Record<string, CommitInfo[]> = {};

  commits.forEach((commit) => {
    const type = commit.type.toLowerCase();

    if (!groups[type]) {
      groups[type] = [];
    }

    groups[type].push(commit);
  });

  return groups;
}

/**
 * 生成单个版本的 changelog
 */
function generateVersionChangelog(version: string, commits: CommitInfo[]): string {
  const groups = groupCommitsByType(commits);
  let output = `## ${version}\n\n`;

  // 收集所有日期
  const dates = new Set<string>();
  commits.forEach((c) => dates.add(c.date));
  const dateStr =
    dates.size > 0 ? Array.from(dates).sort().pop() : new Date().toISOString().split("T")[0];

  output += `*发布日期: ${dateStr}*\n\n`;

  // 按优先级输出
  const priority = [
    "feat",
    "fix",
    "perf",
    "refactor",
    "revert",
    "docs",
    "style",
    "test",
    "build",
    "ci",
    "chore",
  ];

  priority.forEach((type) => {
    if (groups[type]) {
      const typeInfo = TYPE_MAPPING[type] || { section: type, emoji: "📦" };
      output += `### ${typeInfo.section}\n\n`;

      groups[type].forEach((commit) => {
        const scope = commit.scope ? `**${commit.scope}**: ` : "";
        const breakingMark = commit.breaking ? " 🔥" : "";
        output += `- ${scope}${commit.subject}${breakingMark}\n`;
      });

      output += "\n";
    }
  });

  return output;
}

/**
 * 从 git 标签提取版本信息
 */
function extractVersionInfo(tag: string): VersionEntry | null {
  try {
    const commitHash = execSync(`git rev-parse "${tag}^{commit}"`, {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
    }).trim();

    const dateOutput = execSync(`git log -1 --format="%ad" --date=short ${commitHash}`, {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
    }).trim();

    // 查找该版本的所有 commits
    const commits = getCommits(tag, `v${parseFloat(tag.replace("v", "")) + 0.1}`);

    return {
      version: tag,
      date: dateOutput,
      commits: [],
      breaking: false,
    };
  } catch {
    return null;
  }
}

/**
 * 获取所有版本标签
 */
function getVersionTags(): string[] {
  try {
    const output = execSync('git tag --list "v*" --sort=-v:refname', {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
    });

    return output
      .trim()
      .split("\n")
      .filter((tag) => tag.match(/^v\d+\.\d+\.\d+$/));
  } catch {
    return [];
  }
}

/**
 * 生成完整的 changelog
 */
function generateFullChangelog(): string {
  let output = `# Changelog\n\n`;
  output += `*ApexBridge 变更日志自动生成*\n\n`;
  output += `生成时间: ${new Date().toISOString().split("T")[0]}\n\n`;
  output += `---\n\n`;

  const tags = getVersionTags();
  const previousTags = ["v0.0.0", ...tags];

  for (let i = 0; i < previousTags.length - 1; i++) {
    const from = previousTags[i + 1];
    const to = previousTags[i];

    const commits = getCommits(from, to);

    if (commits.length === 0) {
      continue;
    }

    const parsedCommits: CommitInfo[] = [];

    commits.forEach((line) => {
      const commitInfo = parseCommit(line);

      if (commitInfo) {
        const hash = line.split(" ")[0];
        const details = getCommitDetails(hash);

        parsedCommits.push({
          ...commitInfo,
          hash,
          ...details,
        });
      }
    });

    if (parsedCommits.length > 0) {
      output += generateVersionChangelog(from, parsedCommits);
      output += `---\n\n`;
    }
  }

  return output;
}

/**
 * 生成指定范围的 changelog
 */
function generateRangeChangelog(from: string, to: string): string {
  let output = `# Changelog (${from} → ${to})\n\n`;
  output += `生成时间: ${new Date().toISOString().split("T")[0]}\n\n`;
  output += `---\n\n`;

  const commits = getCommits(from, to);

  if (commits.length === 0) {
    output += "*此范围内没有提交*\n";
    return output;
  }

  const parsedCommits: CommitInfo[] = [];

  commits.forEach((line) => {
    const commitInfo = parseCommit(line);

    if (commitInfo) {
      const hash = line.split(" ")[0];
      const details = getCommitDetails(hash);

      parsedCommits.push({
        ...commitInfo,
        hash,
        ...details,
      });
    }
  });

  output += generateVersionChangelog(to, parsedCommits);

  return output;
}

/**
 * 保存 changelog
 */
function saveChangelog(content: string, outputPath: string): void {
  // 如果文件存在，合并新旧内容
  if (fs.existsSync(outputPath)) {
    const existingContent = fs.readFileSync(outputPath, "utf-8");

    // 提取现有内容（去除头部）
    const existingBody = existingContent.includes("---")
      ? existingContent.split("---").slice(1).join("---").trim()
      : existingContent;

    // 合并
    const newContent = content + "\n---\n\n" + existingBody;
    fs.writeFileSync(outputPath, newContent);
  } else {
    fs.writeFileSync(outputPath, content);
  }
}

/**
 * 解析命令行参数
 */
function parseArgs(): ChangelogOptions {
  const args = process.argv.slice(2);

  const options: ChangelogOptions = {
    stdout: false,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--from":
        options.from = args[++i];
        break;
      case "--to":
        options.to = args[++i];
        break;
      case "-o":
      case "--output":
        options.output = args[++i];
        break;
      case "--stdout":
        options.stdout = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "-h":
      case "--help":
        showHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

/**
 * 显示帮助信息
 */
function showHelp(): void {
  console.log(`
ApexBridge 变更日志生成脚本

用法:
  npx ts-node scripts/generate-changelog.ts [选项]

选项:
  --from <版本>      从指定版本开始 (例如: v1.0.0)
  --to <版本>        到指定版本结束 (例如: v1.1.0)
  -o, --output <文件>  输出到文件 (默认: CHANGELOG.md)
  --stdout           输出到标准输出
  --dry-run          演练模式，不写入文件
  -h, --help         显示帮助信息

示例:
  # 生成完整 changelog
  npx ts-node scripts/generate-changelog.ts

  # 生成指定范围的 changelog
  npx ts-node scripts/generate-changelog.ts --from v1.0.0 --to v1.1.0

  # 输出到标准输出
  npx ts-node scripts/generate-changelog.ts --stdout

  # 指定输出文件
  npx ts-node scripts/generate-changelog.ts --output CHANGELOG_NEW.md
`);
}

/**
 * 主入口
 */
function main(): void {
  const options = parseArgs();

  console.log("");
  console.log("=".repeat(70));
  console.log("  ApexBridge 变更日志生成器");
  console.log("=".repeat(70));
  console.log("");

  // 生成 changelog 内容
  let changelogContent: string;

  if (options.from && options.to) {
    console.log(`📝 生成范围变更日志: ${options.from} → ${options.to}`);
    changelogContent = generateRangeChangelog(options.from, options.to);
  } else {
    console.log("📝 生成完整变更日志");
    changelogContent = generateFullChangelog();
  }

  // 输出或保存
  if (options.stdout || options.dryRun) {
    console.log("");
    console.log(changelogContent);
  }

  if (!options.dryRun) {
    const outputPath = options.output || CHANGELOG_PATH;
    console.log(`💾 保存到: ${outputPath}`);

    try {
      saveChangelog(changelogContent, outputPath);
      console.log("✅ 变更日志已更新");
    } catch (error) {
      console.error("❌ 保存失败:", error);
      process.exit(1);
    }
  }

  console.log("");
  console.log("=".repeat(70));
}

// 执行主函数
main();
