#!/usr/bin/env ts-node
/**
 * ApexBridge 回滚脚本
 *
 * 功能：
 * 1. 回滚到指定版本
 * 2. 快速回滚到上一版本
 * 3. 数据库回滚支持
 * 4. 服务重启
 *
 * 使用方法：
 *   npx ts-node scripts/rollback.ts --version v1.0.1
 *   npx ts-node scripts/rollback.ts --quick
 *   npx ts-node scripts/rollback.ts --help
 *
 * 选项：
 *   -v, --version <版本>  回滚到指定版本
 *   -q, --quick          快速回滚到上一版本
 *   --dry-run            演练模式，不实际执行
 *   --skip-db            跳过数据库回滚
 *   --skip-restart       跳过服务重启
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

const PROJECT_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, ".data");
const PID_FILE = path.join(PROJECT_ROOT, ".apex-bridge.pid");

interface RollbackOptions {
  version?: string;
  quick: boolean;
  dryRun: boolean;
  skipDb: boolean;
  skipRestart: boolean;
}

interface VersionInfo {
  tag: string;
  commit: string;
  date: string;
  message: string;
}

class RollbackManager {
  private currentVersion: string;
  private isDryRun: boolean;

  constructor(dryRun: boolean = false) {
    this.isDryRun = dryRun;
    this.currentVersion = this.getCurrentVersion();
  }

  /**
   * 获取当前版本
   */
  private getCurrentVersion(): string {
    try {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf-8")
      );
      return packageJson.version;
    } catch {
      return "unknown";
    }
  }

  /**
   * 获取所有版本标签
   */
  getAvailableVersions(): VersionInfo[] {
    try {
      const output = execSync('git tag --list --sort=-v:refname 2>/dev/null || echo ""', {
        cwd: PROJECT_ROOT,
        encoding: "utf-8",
      });

      const tags = output
        .trim()
        .split("\n")
        .filter((tag) => tag.match(/^v\d+\.\d+\.\d+/));

      if (tags.length === 0) {
        return [];
      }

      return tags.map((tag) => {
        try {
          const commitOutput = execSync(`git rev-parse "${tag}" 2>/dev/null || echo ""`, {
            cwd: PROJECT_ROOT,
            encoding: "utf-8",
          }).trim();

          if (!commitOutput) {
            return {
              tag,
              commit: "unknown",
              date: "unknown",
              message: "unknown",
            };
          }

          const messageOutput = execSync(
            `git log -1 --format="%ci %s" ${commitOutput} 2>/dev/null || echo "unknown"`,
            { cwd: PROJECT_ROOT, encoding: "utf-8" }
          ).trim();

          const [date, ...messageParts] = messageOutput.split(" ");
          const message = messageParts.join(" ");

          return {
            tag,
            commit: commitOutput,
            date: date || "unknown",
            message: message || "unknown",
          };
        } catch {
          return {
            tag,
            commit: "unknown",
            date: "unknown",
            message: "unknown",
          };
        }
      });
    } catch {
      return [];
    }
  }

  getPreviousVersion(): string | null {
    const versions = this.getAvailableVersions();
    const currentIndex = versions.findIndex((v) => v.tag === `v${this.currentVersion}`);

    if (currentIndex === -1 || currentIndex === versions.length - 1) {
      return null;
    }

    return versions[currentIndex + 1].tag.replace("v", "");
  }

  /**
   * 停止服务
   */
  async stopService(): Promise<boolean> {
    console.log("🛑 停止服务...");

    // 检查 PID 文件
    if (fs.existsSync(PID_FILE)) {
      try {
        const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8"), 10);
        process.kill(pid, "SIGTERM");
        console.log(`   ✅ 进程 ${pid} 已停止`);

        // 等待进程完全停止
        await this.sleep(2000);
        return true;
      } catch (error) {
        console.log("   ⚠️  PID 文件存在但进程已不存在");
      }
    }

    // 查找并停止运行中的进程
    try {
      execSync('pkill -f "apex-bridge"', { encoding: "utf-8" });
      console.log("   ✅ 服务已停止");
      return true;
    } catch {
      console.log("   ℹ️  没有运行中的服务");
      return true;
    }
  }

  /**
   * 回滚代码
   */
  rollbackCode(targetVersion: string): void {
    console.log(`🔄 回滚代码到 v${targetVersion}...`);

    const tag = `v${targetVersion}`;

    if (this.isDryRun) {
      console.log(`   [演练] git checkout ${tag}`);
      return;
    }

    try {
      // 检出指定版本
      execSync(`git checkout ${tag}`, {
        cwd: PROJECT_ROOT,
        encoding: "utf-8",
      });

      // 重置硬到该提交
      execSync(`git reset --hard ${tag}`, {
        cwd: PROJECT_ROOT,
        encoding: "utf-8",
      });

      console.log(`   ✅ 代码已回滚到 v${targetVersion}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      throw new Error(`代码回滚失败: ${errorMessage}`);
    }
  }

  /**
   * 回滚数据库
   */
  async rollbackDatabase(targetVersion: string): Promise<void> {
    console.log("🗄️  检查数据库回滚...");

    if (this.isDryRun) {
      console.log("   [演练] 数据库回滚检查");
      return;
    }

    try {
      // 运行数据库回滚
      console.log(`   执行数据库回滚到 v${targetVersion}...`);

      // 检查是否有迁移文件需要回滚
      const migrationStatus = execSync("npm run migrations:status", {
        cwd: PROJECT_ROOT,
        encoding: "utf-8",
      });

      if (migrationStatus.includes("Pending")) {
        console.log("   ℹ️  有待执行的迁移，无需回滚");
        return;
      }

      // 如果需要回滚迁移
      execSync("npm run migrations:rollback", {
        cwd: PROJECT_ROOT,
        encoding: "utf-8",
      });

      console.log("   ✅ 数据库已回滚");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      console.log(`   ⚠️  数据库回滚警告: ${errorMessage}`);
      console.log("   ℹ️  可能不需要数据库回滚，继续执行...");
    }
  }

  /**
   * 重启服务
   */
  async restartService(): Promise<void> {
    console.log("🚀 重启服务...");

    if (this.isDryRun) {
      console.log("   [演练] 服务重启");
      return;
    }

    try {
      // 构建项目
      console.log("   构建项目...");
      execSync("npm run build", {
        cwd: PROJECT_ROOT,
        encoding: "utf-8",
      });

      // 启动服务
      console.log("   启动服务...");
      const { spawn } = require("child_process");
      const child = spawn("npm", ["start"], {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: "ignore",
      });

      child.unref();

      // 保存 PID
      const pid = process.pid;
      fs.writeFileSync(PID_FILE, pid.toString());

      // 等待服务启动
      await this.sleep(3000);

      // 检查服务健康
      const healthCheck = this.checkHealth();

      if (healthCheck) {
        console.log("   ✅ 服务已启动并健康");
      } else {
        console.log("   ⚠️  服务已启动但健康检查失败");
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      throw new Error(`服务启动失败: ${errorMessage}`);
    }
  }

  /**
   * 检查服务健康
   */
  private checkHealth(): boolean {
    try {
      const response = execSync('curl -s http://localhost:8088/health || echo "unhealthy"', {
        encoding: "utf-8",
        timeout: 5000,
      });
      return response.includes("ok") || response.includes("healthy");
    } catch {
      return false;
    }
  }

  /**
   * 验证回滚
   */
  async verifyRollback(targetVersion: string): Promise<boolean> {
    console.log("✅ 验证回滚...");

    // 检查版本
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf-8")
    );

    if (packageJson.version !== targetVersion) {
      console.log(`   ❌ 版本不匹配: 期望 ${targetVersion}, 实际 ${packageJson.version}`);
      return false;
    }

    console.log(`   ✅ 版本正确: ${packageJson.version}`);

    // 检查服务健康
    if (!this.checkHealth()) {
      console.log("   ⚠️  服务健康检查失败");
      return false;
    }

    console.log("   ✅ 服务健康");
    return true;
  }

  /**
   * 辅助函数：睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 主回滚方法
   */
  async rollback(options: RollbackOptions): Promise<boolean> {
    const { version, quick, dryRun, skipDb, skipRestart } = options;

    console.log("");
    console.log("=".repeat(70));
    console.log("  ApexBridge 回滚管理器");
    console.log("=".repeat(70));
    console.log("");
    console.log(`📦 当前版本: v${this.currentVersion}`);

    // 确定目标版本
    let targetVersion: string;

    if (quick) {
      const prevVersion = this.getPreviousVersion();
      if (!prevVersion) {
        console.log("❌ 无法确定上一版本");
        return false;
      }
      targetVersion = prevVersion;
    } else if (version) {
      targetVersion = version;
    } else {
      console.log("❌ 请指定回滚版本或使用 --quick 选项");
      return false;
    }

    console.log(`🎯 目标版本: v${targetVersion}`);
    console.log("");

    if (dryRun) {
      console.log("🔍 [演练模式] 以下操作将被执行:");
      console.log("   1. 停止服务");
      console.log(`   2. 回滚代码到 v${targetVersion}`);
      if (!skipDb) console.log("   3. 回滚数据库");
      if (!skipRestart) console.log("   4. 重启服务");
      console.log("   5. 验证回滚");
      return true;
    }

    try {
      // 1. 停止服务
      await this.stopService();

      // 2. 回滚代码
      this.rollbackCode(targetVersion);

      // 3. 回滚数据库
      if (!skipDb) {
        await this.rollbackDatabase(targetVersion);
      }

      // 4. 重启服务
      if (!skipRestart) {
        await this.restartService();
      }

      // 5. 验证回滚
      const success = await this.verifyRollback(targetVersion);

      console.log("");
      console.log("=".repeat(70));

      if (success) {
        console.log(`✅ 回滚成功！当前版本: v${targetVersion}`);
        return true;
      } else {
        console.log(`⚠️  回滚完成但验证失败。当前版本: v${targetVersion}`);
        return false;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      console.log(`❌ 回滚失败: ${errorMessage}`);
      return false;
    }
  }

  /**
   * 显示版本列表
   */
  listVersions(): void {
    console.log("");
    console.log("📋 可用版本:");
    console.log("-".repeat(70));

    const versions = this.getAvailableVersions();

    versions.forEach((v, index) => {
      const isCurrent = v.tag === `v${this.currentVersion}`;
      const prefix = isCurrent ? "👉 " : "  ";
      const currentMark = isCurrent ? "(当前)" : "";
      console.log(`${prefix}${v.tag} ${currentMark}`);
      console.log(`   ${v.date} - ${v.message.substring(0, 50)}`);
    });

    console.log("-".repeat(70));
  }
}

/**
 * 解析命令行参数
 */
function parseArgs(): RollbackOptions {
  const args = process.argv.slice(2);

  const options: RollbackOptions = {
    quick: false,
    dryRun: false,
    skipDb: false,
    skipRestart: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "-v":
      case "--version":
        options.version = args[++i];
        break;
      case "-q":
      case "--quick":
        options.quick = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--skip-db":
        options.skipDb = true;
        break;
      case "--skip-restart":
        options.skipRestart = true;
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
ApexBridge 回滚脚本

用法:
  npx ts-node scripts/rollback.ts [选项]

选项:
  -v, --version <版本>  回滚到指定版本 (例如: 1.0.1)
  -q, --quick          快速回滚到上一版本
  --dry-run            演练模式，不实际执行
  --skip-db            跳过数据库回滚
  --skip-restart       跳过服务重启
  -h, --help           显示帮助信息

示例:
  # 回滚到指定版本
  npx ts-node scripts/rollback.ts --version 1.0.1

  # 快速回滚到上一版本
  npx ts-node scripts/rollback.ts --quick

  # 演练模式
  npx ts-node scripts/rollback.ts --version 1.0.1 --dry-run

注意事项:
  - 回滚前请确保没有正在进行的任务
  - 回滚会停止当前服务
  - 回滚后需要验证功能正常
`);
}

/**
 * 主入口
 */
async function main(): Promise<void> {
  const options = parseArgs();

  // 如果没有指定版本且不是快速回滚，显示帮助
  if (!options.version && !options.quick) {
    const rollbackManager = new RollbackManager(options.dryRun);
    rollbackManager.listVersions();
    console.log("");
    showHelp();
    process.exit(1);
  }

  const rollbackManager = new RollbackManager(options.dryRun);
  const success = await rollbackManager.rollback(options);

  process.exit(success ? 0 : 1);
}

// 执行主函数
main().catch((error) => {
  console.error("回滚失败:", error);
  process.exit(1);
});
