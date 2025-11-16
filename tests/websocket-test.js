/**
 * WebSocket测试脚本 - 用于测试主动消息推送
 * 
 * 使用方法：
 * 1. 确保服务器已启动（npm run dev）
 * 2. 设置环境变量 ABP_API_KEY 或修改下面的 API_KEY（ABP-only）
 * 3. 运行：node tests/websocket-test.js
 */

const WebSocket = require('ws');

// 从环境变量或配置获取API Key
const API_KEY = process.env.ABP_API_KEY || 'your-api-key-here';
// WebSocket路径格式：推荐使用 /ABPlog/ABP_Key=xxx 或 /log/ABP_Key=xxx（ABP-only）
const WS_URL = `ws://localhost:${process.env.PORT || 3000}/ABPlog/ABP_Key=${API_KEY}`;

console.log('🔌 正在连接WebSocket...');
console.log(`📍 URL: ${WS_URL.replace(API_KEY, '***')}`);

const ws = new WebSocket(WS_URL);

let messageCount = 0;
let proactiveMessageCount = 0;

ws.on('open', () => {
  console.log('✅ WebSocket连接成功！');
  console.log('📡 等待接收主动消息...');
  console.log('💡 提示：在另一个终端使用API触发场景，或等待定时触发');
  console.log('---');
});

ws.on('message', (data) => {
  messageCount++;
  try {
    const message = JSON.parse(data.toString());
    
    if (message.type === 'proactive_message') {
      proactiveMessageCount++;
      console.log(`\n📢 [主动消息 #${proactiveMessageCount}]`);
      console.log(`   场景ID: ${message.data?.sceneId || 'N/A'}`);
      console.log(`   消息内容: ${message.data?.message || 'N/A'}`);
      console.log(`   评分: ${message.data?.score || 'N/A'}`);
      console.log(`   时间: ${new Date(message.timestamp || Date.now()).toLocaleString()}`);
      console.log('---');
    } else if (message.type === 'tool_log') {
      // 工具日志，可以忽略或显示
      if (process.env.VERBOSE === 'true') {
        console.log(`📨 [工具日志] ${message.data?.content || JSON.stringify(message)}`);
      }
    } else {
      console.log(`📨 [消息 #${messageCount}] 类型: ${message.type}`);
      if (process.env.VERBOSE === 'true') {
        console.log(`   内容: ${JSON.stringify(message, null, 2)}`);
      }
    }
  } catch (e) {
    console.log(`📨 [原始消息 #${messageCount}]: ${data.toString().substring(0, 100)}...`);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket错误:', error.message);
  if (error.message.includes('401') || error.message.includes('Unauthorized')) {
    console.error('💡 提示：请检查API Key是否正确');
    console.error(`   当前使用的Key: ${API_KEY.substring(0, 10)}...`);
  }
});

ws.on('close', (code, reason) => {
  console.log(`\n🔌 WebSocket连接关闭`);
  console.log(`   关闭代码: ${code}`);
  console.log(`   原因: ${reason || 'N/A'}`);
  console.log(`\n📊 统计信息:`);
  console.log(`   总消息数: ${messageCount}`);
  console.log(`   主动消息数: ${proactiveMessageCount}`);
  process.exit(0);
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n\n👋 正在关闭连接...');
  ws.close();
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 正在关闭连接...');
  ws.close();
});

// 定期显示状态
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    console.log(`💓 连接正常 (已接收 ${messageCount} 条消息, ${proactiveMessageCount} 条主动消息)`);
  }
}, 30000); // 每30秒显示一次状态

