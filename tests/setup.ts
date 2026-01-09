/**
 * Jest 测试环境配置
 */

// 设置测试环境变量
process.env.NODE_ENV = "test";
process.env.APEX_BRIDGE_AUTOSTART = "false";
process.env.LOG_LEVEL = "error";

// 全局测试超时
jest.setTimeout(30000);

// 清理函数
afterAll(async () => {
  // 等待异步操作完成
  await new Promise((resolve) => setTimeout(resolve, 100));
});
