#!/usr/bin/env node
/**
 * 配置验证脚本
 * 验证 .env 和 admin-config.json 的配置是否正确
 *
 * 使用方法:
 *   node scripts/validate-config.js
 */

const fs = require('fs');
const path = require('path');

console.log('='.repeat(70));
console.log('  ApexBridge 配置验证');
console.log('='.repeat(70));
console.log('');

let allValid = true;

// 检查 .env 文件
console.log('1. 检查 .env 文件...');
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.log('   ❌ .env 文件不存在');
  console.log('   💡 请复制 .env.template 为 .env 并配置相关环境变量');
  allValid = false;
} else {
  console.log('   ✅ .env 文件存在');

  try {
    const envContent = fs.readFileSync(envPath, 'utf8');

    // 验证关键环境变量
    const requiredEnvVars = [
      { name: 'ABP_API_KEY', desc: 'ABP API 密钥' },
      { name: 'JWT_SECRET', desc: 'JWT 密钥' },
      { name: 'PORT', desc: '服务器端口' }
    ];

    const missingVars = requiredEnvVars.filter(varName => {
      const pattern = new RegExp(`^${varName.name}=`, 'm');
      return !pattern.test(envContent);
    });

    if (missingVars.length > 0) {
      console.log(`   ⚠️  缺少必需的环境变量:`);
      missingVars.forEach(item => {
        console.log(`      - ${item.name} (${item.desc})`);
      });
      allValid = false;
    } else {
      console.log('   ✅ 所有必需的环境变量已配置');
    }

    // LLM 配置存储在 SurrealDB
    console.log('   💡 LLM 配置存储在 SurrealDB 中，请确保 SurrealDB 可访问');
  } catch (error) {
    console.log(`   ❌ 读取 .env 文件失败: ${error.message}`);
    allValid = false;
  }
}

console.log('');

// 检查 admin-config.json
console.log('2. 检查 admin-config.json...');
const configPath = path.join(__dirname, '..', 'config', 'admin-config.json');
if (!fs.existsSync(configPath)) {
  console.log('   ❌ admin-config.json 文件不存在');
  allValid = false;
} else {
  console.log('   ✅ admin-config.json 文件存在');

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // 检查是否包含已迁移的配置
    const removedConfigs = [];
    if (config.api?.port) removedConfigs.push('api.port');
    if (config.auth?.apiKey) removedConfigs.push('auth.apiKey');
    if (config.auth?.jwtSecret) removedConfigs.push('auth.jwtSecret');
    if (config.performance?.maxRequestSize) removedConfigs.push('performance.maxRequestSize');
    if (config.ace?.layers?.l1?.constitutionPath) removedConfigs.push('ace.layers.l1.constitutionPath');

    if (removedConfigs.length > 0) {
      console.log(`   ⚠️  包含已迁移的配置项（应从 env 读取）:`);
      removedConfigs.forEach(config => {
        console.log(`      - ${config}`);
      });
      allValid = false;
    } else {
      console.log('   ✅ 配置结构正确（已移除系统级配置）');
    }

    // 检查应用级配置
    const appConfigs = [
      { path: 'ace.enabled', desc: 'ACE 架构启用状态' },
      { path: 'auth.enabled', desc: '认证启用状态' },
      { path: 'security.rateLimit.enabled', desc: '限流启用状态' }
    ];

    console.log('   📋 应用级配置检查:');
    appConfigs.forEach(configCheck => {
      const value = configCheck.path.split('.').reduce((obj, key) => obj?.[key], config);
      console.log(`      - ${configCheck.desc}: ${value !== undefined ? value : '未配置'}`);
    });
  } catch (error) {
    console.log(`   ❌ JSON 解析错误: ${error.message}`);
    allValid = false;
  }
}

console.log('');
console.log('='.repeat(70));

if (allValid) {
  console.log('✅ 配置验证通过！所有关键配置项已正确设置。');
  console.log('');
  console.log('💡 提示:');
  console.log('   - 系统级配置（API密钥、端口、路径）在 .env 文件中');
  console.log('   - 应用级配置（功能开关、策略参数）在 admin-config.json 中');
  console.log('   - 可以使用 npm run dev 启动服务器');
} else {
  console.log('❌ 配置验证失败！请检查上述错误并修复。');
  console.log('');
  console.log('💡 修复建议:');
  console.log('   1. 确保 .env 文件存在并包含所有必需的环境变量');
  console.log('   2. 确保 admin-config.json 不包含已迁移的配置项');
  console.log('   3. 重新运行此脚本验证修复结果');
}

console.log('='.repeat(70));
console.log('');

// 退出码
process.exit(allValid ? 0 : 1);
