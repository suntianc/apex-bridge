/**
 * Vitest 测试环境配置
 * 提供 Jest 兼容模式，支持 jest.fn(), jest.mock() 等 API
 */

import { vi } from "vitest";

// 设置测试环境变量
process.env.NODE_ENV = "test";
process.env.APEX_BRIDGE_AUTOSTART = "false";
process.env.LOG_LEVEL = "error";

// Jest 兼容支持 - 将 vitest 注入为全局 jest
global.jest = vi as any;

// 全局测试超时配置
export default {
  testTimeout: 30000,
  hookTimeout: 10000,
  clearMocks: true,
  restoreMocks: true,
};
