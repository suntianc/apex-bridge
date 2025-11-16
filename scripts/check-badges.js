#!/usr/bin/env node

/**
 * 徽章链接检查工具
 * 检查 README 文件中的徽章链接是否能正常访问
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 常见的徽章域名白名单
const BADGE_DOMAINS = [
  'img.shields.io',
  'github.com',
  'codecov.io',
  'npmjs.com',
  'nodejs.org',
  'typescriptlang.org'
];

/**
 * 检查URL是否可访问
 */
async function checkUrl(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https:') ? https : http;
    const request = client.get(url, (response) => {
      resolve({
        url,
        status: response.statusCode,
        success: response.statusCode >= 200 && response.statusCode < 400,
        contentType: response.headers['content-type']
      });
    });

    request.on('error', (error) => {
      resolve({
        url,
        status: 'ERROR',
        success: false,
        error: error.message
      });
    });

    request.setTimeout(5000, () => {
      request.destroy();
      resolve({
        url,
        status: 'TIMEOUT',
        success: false,
        error: 'Request timeout'
      });
    });
  });
}

/**
 * 从README文件中提取徽章链接
 */
function extractBadgeLinks(content) {
  const badgeRegex = /\[!\[([^\]]*)\]\(([^)]+)\)\]/g;
  const links = [];
  let match;

  while ((match = badgeRegex.exec(content)) !== null) {
    links.push({
      text: match[1],
      url: match[2]
    });
  }

  return links;
}

/**
 * 检查单个README文件
 */
async function checkReadmeFile(filePath) {
  console.log(`\n📖 检查文件: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.log(`❌ 文件不存在: ${filePath}`);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const badges = extractBadgeLinks(content);

  if (badges.length === 0) {
    console.log(`ℹ️  没有发现徽章`);
    return;
  }

  console.log(`🔍 发现 ${badges.length} 个徽章，检查链接状态...`);

  const results = [];
  for (const badge of badges) {
    try {
      const result = await checkUrl(badge.url);
      results.push({ ...badge, ...result });
    } catch (error) {
      results.push({
        ...badge,
        status: 'ERROR',
        success: false,
        error: error.message
      });
    }
  }

  // 显示结果
  let successCount = 0;
  for (const result of results) {
    if (result.success) {
      console.log(`✅ ${result.text} - ${result.status}`);
      successCount++;
    } else {
      console.log(`❌ ${result.text} - ${result.status}`);
      if (result.error) {
        console.log(`   错误: ${result.error}`);
      }
    }
  }

  console.log(`\n📊 结果: ${successCount}/${results.length} 徽章正常显示`);

  return {
    file: filePath,
    total: results.length,
    success: successCount,
    failed: results.length - successCount,
    details: results
  };
}

/**
 * 主函数
 */
async function main() {
  console.log('🏠 ApexBridge 徽章检查工具');
  console.log('=' .repeat(50));

  // 要检查的README文件列表
  const readmeFiles = [
    'README.md',
    'apex-bridge/README.md',
    'vcp-intellicore-rag/README.md',
    'vcp-intellicore-sdk/README.md'
  ];

  const allResults = [];

  for (const file of readmeFiles) {
    const result = await checkReadmeFile(file);
    if (result) {
      allResults.push(result);
    }
  }

  // 生成汇总报告
  console.log('\n' + '='.repeat(50));
  console.log('📊 汇总报告');
  console.log('='.repeat(50));

  let totalBadges = 0;
  let totalSuccess = 0;
  let totalFailed = 0;

  for (const result of allResults) {
    totalBadges += result.total;
    totalSuccess += result.success;
    totalFailed += result.failed;
  }

  console.log(`📁 检查文件数: ${allResults.length}`);
  console.log(`🏷️  总徽章数: ${totalBadges}`);
  console.log(`✅ 正常显示: ${totalSuccess}`);
  console.log(`❌ 显示异常: ${totalFailed}`);

  const successRate = totalBadges > 0 ? ((totalSuccess / totalBadges) * 100).toFixed(1) : 0;
  console.log(`📈 成功率: ${successRate}%`);

  if (totalFailed > 0) {
    console.log('\n⚠️  发现问题的徽章:');
    for (const result of allResults) {
      for (const detail of result.details) {
        if (!detail.success) {
          console.log(`   - ${detail.text}: ${detail.url}`);
        }
      }
    }
    console.log('\n💡 建议修复上述徽章链接');
  } else {
    console.log('\n🎉 所有徽章都正常显示！');
  }

  // 退出码
  process.exit(totalFailed > 0 ? 1 : 0);
}

// 运行检查
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 检查过程中出现错误:', error);
    process.exit(1);
  });
}