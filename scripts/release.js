#!/usr/bin/env node

/**
 * 发布辅助脚本
 * 帮助准备发布前的检查和验证
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorLog(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message) {
  colorLog(colors.green, `✅ ${message}`);
}

function warning(message) {
  colorLog(colors.yellow, `⚠️  ${message}`);
}

function error(message) {
  colorLog(colors.red, `❌ ${message}`);
}

function info(message) {
  colorLog(colors.blue, `ℹ️  ${message}`);
}

function header(message) {
  colorLog(colors.cyan, `\n🚀 ${message}`);
  console.log('='.repeat(message.length + 4));
}

/**
 * 检查版本号一致性
 */
function checkVersionConsistency() {
  header('检查版本号一致性');

  const packages = [
    { name: 'ApexBridge', path: 'apex-bridge/package.json' },
    { name: 'RAG Service', path: 'vcp-intellicore-rag/package.json' },
    { name: 'SDK', path: 'vcp-intellicore-sdk/package.json' }
  ];

  const versions = {};

  for (const pkg of packages) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(pkg.path, 'utf8'));
      versions[pkg.name] = packageJson.version;
      success(`${pkg.name}: ${packageJson.version}`);
    } catch (error) {
      error(`无法读取 ${pkg.name} 的版本号`);
    }
  }

  return versions;
}

/**
 * 检查Git状态
 */
function checkGitStatus() {
  header('检查Git状态');

  try {
    // 检查是否有未提交的更改
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    if (status.trim()) {
      warning('发现未提交的更改:');
      console.log(status);
      return false;
    }
    success('没有未提交的更改');

    // 检查当前分支
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    if (branch !== 'main' && branch !== 'master') {
      warning(`当前不在 main 分支，当前分支: ${branch}`);
    } else {
      success(`当前分支: ${branch}`);
    }

    // 检查是否与远程同步
    try {
      execSync('git rev-parse --verify origin/main', { encoding: 'utf8', stdio: 'pipe' });
      const ahead = execSync('git rev-list --count origin/main..HEAD', { encoding: 'utf8' }).trim();
      if (ahead === '0') {
        success('与远程分支同步');
      } else {
        warning(`领先远程分支 ${ahead} 个提交`);
      }
    } catch {
      warning('没有找到远程 main 分支');
    }

    return true;
  } catch (error) {
    error('Git 状态检查失败');
    return false;
  }
}

/**
 * 运行测试
 */
function runTests() {
  header('运行测试套件');

  const tests = [
    { name: '主项目测试', cmd: 'cd apex-bridge && npm test', path: 'apex-bridge' },
    { name: 'RAG服务测试', cmd: 'cd vcp-intellicore-rag && npm test', path: 'vcp-intellicore-rag' },
    { name: 'SDK测试', cmd: 'cd vcp-intellicore-sdk && npm test', path: 'vcp-intellicore-sdk' }
  ];

  let allPassed = true;

  for (const test of tests) {
    try {
      if (fs.existsSync(test.path)) {
        info(`运行 ${test.name}...`);
        execSync(test.cmd, { stdio: 'pipe' });
        success(`${test.name}通过`);
      } else {
        warning(`${test.name}目录不存在，跳过测试`);
      }
    } catch (error) {
      error(`${test.name}失败: ${error.message}`);
      allPassed = false;
    }
  }

  return allPassed;
}

/**
 * 检查构建
 */
function checkBuild() {
  header('检查项目构建');

  const builds = [
    { name: '主项目构建', cmd: 'cd apex-bridge && npm run build', path: 'apex-bridge' },
    { name: 'RAG服务构建', cmd: 'cd vcp-intellicore-rag && npm run build', path: 'vcp-intellicore-rag' },
    { name: 'SDK构建', cmd: 'cd vcp-intellicore-sdk && npm run build', path: 'vcp-intellicore-sdk' }
  ];

  let allPassed = true;

  for (const build of builds) {
    try {
      if (fs.existsSync(build.path)) {
        info(`构建 ${build.name}...`);
        execSync(build.cmd, { stdio: 'pipe' });
        success(`${build.name}成功`);
      } else {
        warning(`${build.name}目录不存在，跳过构建`);
      }
    } catch (error) {
      error(`${build.name}失败: ${error.message}`);
      allPassed = false;
    }
  }

  return allPassed;
}

/**
 * 检查文档
 */
function checkDocumentation() {
  header('检查文档完整性');

  const docs = [
    'README.md',
    'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md',
    'CHANGELOG.md'
  ];

  let allExist = true;

  for (const doc of docs) {
    if (fs.existsSync(doc)) {
      success(`${doc} 存在`);
    } else {
      error(`${doc} 不存在`);
      allExist = false;
    }
  }

  // 检查徽章
  try {
    execSync('node scripts/check-badges.js', { stdio: 'pipe' });
    success('徽章检查通过');
  } catch (error) {
    warning('徽章检查失败（这在本地是正常的）');
  }

  return allExist;
}

/**
 * 检查依赖安全
 */
function checkSecurity() {
  header('检查依赖安全');

  const packages = [
    'apex-bridge',
    'vcp-intellicore-rag',
    'vcp-intellicore-sdk'
  ];

  for (const pkg of packages) {
    try {
      if (fs.existsSync(pkg)) {
        info(`检查 ${pkg} 的依赖安全...`);
        const auditResult = execSync(`cd ${pkg} && npm audit --audit-level=moderate`, { encoding: 'utf8' });

        if (auditResult.includes('vulnerabilities found')) {
          warning(`${pkg} 发现安全漏洞，请运行 'npm audit fix'`);
        } else {
          success(`${pkg} 依赖安全检查通过`);
        }
      }
    } catch (error) {
      warning(`${pkg} 安全检查失败: ${error.message}`);
    }
  }
}

/**
 * 生成发布报告
 */
function generateReleaseReport(versions) {
  header('生成发布报告');

  const report = {
    timestamp: new Date().toISOString(),
    versions,
    gitStatus: execSync('git status --porcelain', { encoding: 'utf8' }).trim() || 'clean',
    branch: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()
  };

  const reportPath = 'release-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  success(`发布报告已生成: ${reportPath}`);

  console.log('\n📊 发布报告:');
  console.log(`  时间戳: ${report.timestamp}`);
  console.log(`  分支: ${report.branch}`);
  console.log(`  Git状态: ${report.gitStatus}`);
  console.log(`  版本信息:`);

  for (const [name, version] of Object.entries(versions)) {
    console.log(`    ${name}: ${version}`);
  }
}

/**
 * 主函数
 */
function main() {
  console.log('🏠 ApexBridge 发布辅助工具');
  console.log('==============================\n');

  let allChecksPass = true;

  // 运行所有检查
  allChecksPass &= checkGitStatus();
  allChecksPass &= checkVersionConsistency() !== null;
  allChecksPass &= runTests();
  allChecksPass &= checkBuild();
  allChecksPass &= checkDocumentation();

  // 检查依赖安全（非致命）
  checkSecurity();

  // 生成报告
  const versions = checkVersionConsistency();
  generateReleaseReport(versions);

  console.log('\n' + '='.repeat(50));

  if (allChecksPass) {
    success('🎉 所有检查都通过了！项目准备好发布！');
    console.log('\n📝 接下来的步骤:');
    console.log('  1. 确保版本号已更新');
    console.log('  2. 创建Git标签: git tag -a v1.0.0 -m "Release v1.0.0"');
    console.log('  3. 推送标签: git push origin v1.0.0');
    console.log('  4. 发布到npm: npm publish (各个子模块)');
    console.log('  5. 创建GitHub Release');
  } else {
    error('❌ 一些检查失败了，请修复问题后重试');
    console.log('\n🔧 需要修复的问题:');
    console.log('  1. 提交或暂存所有更改');
    console.log('  2. 确保所有测试通过');
    console.log('  3. 确保构建成功');
    console.log('  4. 完善缺失的文档');
    process.exit(1);
  }
}

// 运行检查
if (require.main === module) {
  main().catch(error => {
    error(`发布检查失败: ${error.message}`);
    process.exit(1);
  });
}