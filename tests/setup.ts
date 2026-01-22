/**
 * Vitest 测试环境配置
 * 提供 Jest 兼容模式，支持 jest.fn(), jest.mock() 等 API
 */

import { vi } from "vitest";

// 设置测试环境变量
process.env.NODE_ENV = "test";
process.env.APEX_BRIDGE_AUTOSTART = "false";
process.env.LOG_LEVEL = "error";

// 注入全局 jest (any 类型绕过类型检查)
(global as any).jest = vi;

// 为 mock 函数添加缺失的方法
const originalMock = (vi as any).fn;
if (originalMock) {
  const createOnceProxy = (method: string) => {
    return function (...args: any[]) {
      const mock = vi.fn();
      return mock[method](...args);
    };
  };

  (originalMock as any).mockResolvedValueOnce = createOnceProxy("mockResolvedValueOnce");
  (originalMock as any).mockImplementationOnce = createOnceProxy("mockImplementationOnce");
  (originalMock as any).mockRejectedValueOnce = createOnceProxy("mockRejectedValueOnce");
  (originalMock as any).mockReturnValueOnce = createOnceProxy("mockReturnValueOnce");
}

// 全局测试超时配置
export default {
  testTimeout: 30000,
  hookTimeout: 10000,
  clearMocks: true,
  restoreMocks: true,
};
