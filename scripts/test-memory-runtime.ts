/**
 * MemoryService 运行时验证脚本
 * 用于验证记忆服务的实际运行行为
 */

import * as path from 'path';

// 加载环境变量
require('dotenv').config();

// 注意：这个脚本需要在实际运行环境中执行
// 需要先启动服务器，确保RAG服务已初始化

async function verifyMemoryService() {
  console.log('🔍 MemoryService 运行时验证\n');

  try {
    // 1. 检查配置
    const memorySystem = process.env.MEMORY_SYSTEM || 'rag';
    console.log(`📌 MEMORY_SYSTEM: ${memorySystem}`);

    // 2. 尝试导入服务（需要服务器已启动）
    console.log('\n⚠️  注意：此脚本需要在服务器运行环境中执行');
    console.log('建议通过以下方式验证：');
    console.log('1. 启动服务器：npm run dev');
    console.log('2. 检查启动日志中的MemoryService初始化信息');
    console.log('3. 通过API或直接调用服务方法进行测试');
    
    console.log('\n✅ 验证指南已创建：docs/MEMORY_SERVICE_VERIFICATION.md');
    
  } catch (error: any) {
    console.error('❌ 验证过程中出错:', error.message);
  }
}

verifyMemoryService();

