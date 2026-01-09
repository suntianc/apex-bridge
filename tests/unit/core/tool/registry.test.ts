/**
 * ToolRegistry 单元测试
 *
 * 测试工具注册表的注册、注销、查询和状态管理功能
 */

import { ToolRegistry, ToolType, ToolStatus } from "@/core/tool/registry";
import { Tool } from "@/core/tool/tool";

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  // 创建模拟工具的辅助函数
  const createMockTool = (id: string): Tool.Info => ({
    id,
    init: jest.fn().mockResolvedValue({
      description: `Description for ${id}`,
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Input parameter" },
        },
        required: ["input"],
      },
      execute: jest.fn().mockResolvedValue({
        title: "Result",
        content: `Result from ${id}`,
      }),
    }),
  });

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  afterEach(async () => {
    await registry.clear();
  });

  // ==================== register 测试 ====================

  describe("register", () => {
    it("应该正确注册工具", async () => {
      const tool = createMockTool("test-tool");
      await registry.register(tool, ToolType.BUILTIN);

      const result = await registry.get("test-tool");
      expect(result).toBeDefined();
      expect(result?.id).toBe("test-tool");
    });

    it("应该保留已注册工具的状态和时间戳", async () => {
      const tool = createMockTool("test-tool");
      await registry.register(tool, ToolType.BUILTIN);

      // 更新状态
      await registry.updateStatus("test-tool", ToolStatus.HEALTHY);

      // 重新注册（模拟热更新）
      await registry.register(tool, ToolType.SKILL);

      const result = await registry.get("test-tool");
      expect(result).toBeDefined();
      // 状态应该保留
      const isHealthy = await registry.isHealthy("test-tool");
      expect(isHealthy).toBe(true);
    });

    it("应该支持注册不同类型的工具", async () => {
      const builtinTool = createMockTool("builtin-tool");
      const skillTool = createMockTool("skill-tool");
      const mcpTool = createMockTool("mcp-tool");

      await registry.register(builtinTool, ToolType.BUILTIN);
      await registry.register(skillTool, ToolType.SKILL);
      await registry.register(mcpTool, ToolType.MCP);

      expect(await registry.getType("builtin-tool")).toBe(ToolType.BUILTIN);
      expect(await registry.getType("skill-tool")).toBe(ToolType.SKILL);
      expect(await registry.getType("mcp-tool")).toBe(ToolType.MCP);
    });
  });

  // ==================== updateStatus 测试 ====================

  describe("updateStatus", () => {
    it("应该更新工具状态", async () => {
      const tool = createMockTool("test-tool");
      await registry.register(tool, ToolType.BUILTIN);

      const result = await registry.updateStatus("test-tool", ToolStatus.UNHEALTHY, "Test error");
      expect(result).toBe(true);

      const isHealthy = await registry.isHealthy("test-tool");
      expect(isHealthy).toBe(false);
    });

    it("应该返回 false 当工具不存在", async () => {
      const result = await registry.updateStatus("non-existent", ToolStatus.UNHEALTHY);
      expect(result).toBe(false);
    });

    it("应该清除错误信息当状态为 healthy", async () => {
      const tool = createMockTool("test-tool");
      await registry.register(tool, ToolType.BUILTIN);
      await registry.updateStatus("test-tool", ToolStatus.UNHEALTHY, "Some error");

      // 恢复健康状态
      await registry.updateStatus("test-tool", ToolStatus.HEALTHY);

      const updatedTool = await registry.get("test-tool");
      // 工具应该可以正常获取（healthy 工具不会被过滤）
      expect(updatedTool).toBeDefined();
    });
  });

  // ==================== isHealthy 测试 ====================

  describe("isHealthy", () => {
    it("应该返回 true 对于健康的工具", async () => {
      const tool = createMockTool("test-tool");
      await registry.register(tool, ToolType.BUILTIN);
      await registry.updateStatus("test-tool", ToolStatus.HEALTHY);

      expect(await registry.isHealthy("test-tool")).toBe(true);
    });

    it("应该返回 false 对于不健康的工具", async () => {
      const tool = createMockTool("test-tool");
      await registry.register(tool, ToolType.BUILTIN);
      await registry.updateStatus("test-tool", ToolStatus.UNHEALTHY);

      expect(await registry.isHealthy("test-tool")).toBe(false);
    });

    it("应该返回 false 对于不存在的工具", async () => {
      expect(await registry.isHealthy("non-existent")).toBe(false);
    });

    it("应该返回 false 对于状态为 unknown 的工具", async () => {
      const tool = createMockTool("test-tool");
      await registry.register(tool, ToolType.BUILTIN);
      // 不更新状态，默认是 UNKNOWN

      expect(await registry.isHealthy("test-tool")).toBe(false);
    });
  });

  // ==================== getUnhealthyTools 测试 ====================

  describe("getUnhealthyTools", () => {
    it("应该返回所有不健康的工具", async () => {
      const tool1 = createMockTool("tool-1");
      const tool2 = createMockTool("tool-2");
      const tool3 = createMockTool("tool-3");

      await registry.register(tool1, ToolType.BUILTIN);
      await registry.register(tool2, ToolType.BUILTIN);
      await registry.register(tool3, ToolType.BUILTIN);

      await registry.updateStatus("tool-1", ToolStatus.HEALTHY);
      await registry.updateStatus("tool-2", ToolStatus.UNHEALTHY, "Error 1");
      await registry.updateStatus("tool-3", ToolStatus.UNHEALTHY, "Error 2");

      const unhealthyTools = await registry.getUnhealthyTools();
      expect(unhealthyTools).toHaveLength(2);
      expect(unhealthyTools.map((t) => t.id)).toContain("tool-2");
      expect(unhealthyTools.map((t) => t.id)).toContain("tool-3");
    });

    it("应该返回空数组当没有不健康的工具", async () => {
      const tool1 = createMockTool("tool-1");
      const tool2 = createMockTool("tool-2");

      await registry.register(tool1, ToolType.BUILTIN);
      await registry.register(tool2, ToolType.BUILTIN);
      await registry.updateStatus("tool-1", ToolStatus.HEALTHY);
      await registry.updateStatus("tool-2", ToolStatus.HEALTHY);

      const unhealthyTools = await registry.getUnhealthyTools();
      expect(unhealthyTools).toHaveLength(0);
    });
  });

  // ==================== unregister 测试 ====================

  describe("unregister", () => {
    it("应该成功注销工具", async () => {
      const tool = createMockTool("test-tool");
      await registry.register(tool, ToolType.BUILTIN);

      const result = await registry.unregister("test-tool");
      expect(result).toBe(true);

      const hasTool = await registry.has("test-tool");
      expect(hasTool).toBe(false);
    });

    it("应该返回 false 当工具不存在", async () => {
      const result = await registry.unregister("non-existent");
      expect(result).toBe(false);
    });
  });

  // ==================== get 测试 ====================

  describe("get", () => {
    it("应该返回已注册的的工具", async () => {
      const tool = createMockTool("test-tool");
      await registry.register(tool, ToolType.BUILTIN);

      const result = await registry.get("test-tool");
      expect(result).toBeDefined();
      expect(result?.id).toBe("test-tool");
    });

    it("应该返回 undefined 对于不健康的工具", async () => {
      const tool = createMockTool("test-tool");
      await registry.register(tool, ToolType.BUILTIN);
      await registry.updateStatus("test-tool", ToolStatus.UNHEALTHY);

      const result = await registry.get("test-tool");
      expect(result).toBeUndefined();
    });

    it("应该返回 undefined 对于不存在的工具", async () => {
      const result = await registry.get("non-existent");
      expect(result).toBeUndefined();
    });
  });

  // ==================== list 测试 ====================

  describe("list", () => {
    it("应该返回所有已注册的的工具", async () => {
      const tool1 = createMockTool("tool-1");
      const tool2 = createMockTool("tool-2");
      const tool3 = createMockTool("tool-3");

      await registry.register(tool1, ToolType.BUILTIN);
      await registry.register(tool2, ToolType.SKILL);
      await registry.register(tool3, ToolType.MCP);

      const tools = await registry.list();
      expect(tools).toHaveLength(3);
    });

    it("应该返回空数组当没有注册任何工具", async () => {
      const tools = await registry.list();
      expect(tools).toHaveLength(0);
    });
  });

  // ==================== listByType 测试 ====================

  describe("listByType", () => {
    it("应该只返回指定类型的工具", async () => {
      const builtin1 = createMockTool("builtin-1");
      const builtin2 = createMockTool("builtin-2");
      const skill1 = createMockTool("skill-1");

      await registry.register(builtin1, ToolType.BUILTIN);
      await registry.register(builtin2, ToolType.BUILTIN);
      await registry.register(skill1, ToolType.SKILL);

      const builtinTools = await registry.listByType(ToolType.BUILTIN);
      expect(builtinTools).toHaveLength(2);
      expect(builtinTools.every((t) => t.id.startsWith("builtin"))).toBe(true);
    });

    it("应该返回空数组当指定类型没有工具", async () => {
      const tool = createMockTool("tool");
      await registry.register(tool, ToolType.BUILTIN);

      const mcpTools = await registry.listByType(ToolType.MCP);
      expect(mcpTools).toHaveLength(0);
    });
  });

  // ==================== has 测试 ====================

  describe("has", () => {
    it("应该返回 true 对于已注册的的工具", async () => {
      const tool = createMockTool("test-tool");
      await registry.register(tool, ToolType.BUILTIN);

      expect(await registry.has("test-tool")).toBe(true);
    });

    it("应该返回 false 对于未注册的的工具", async () => {
      expect(await registry.has("non-existent")).toBe(false);
    });
  });

  // ==================== size 测试 ====================

  describe("size", () => {
    it("应该返回正确的工具数量", async () => {
      expect(await registry.size()).toBe(0);

      await registry.register(createMockTool("tool-1"), ToolType.BUILTIN);
      expect(await registry.size()).toBe(1);

      await registry.register(createMockTool("tool-2"), ToolType.BUILTIN);
      expect(await registry.size()).toBe(2);

      await registry.unregister("tool-1");
      expect(await registry.size()).toBe(1);
    });
  });

  // ==================== ids 测试 ====================

  describe("ids", () => {
    it("应该返回所有工具的 ID", async () => {
      await registry.register(createMockTool("tool-a"), ToolType.BUILTIN);
      await registry.register(createMockTool("tool-b"), ToolType.SKILL);
      await registry.register(createMockTool("tool-c"), ToolType.MCP);

      const ids = await registry.ids();
      expect(ids).toContain("tool-a");
      expect(ids).toContain("tool-b");
      expect(ids).toContain("tool-c");
      expect(ids).toHaveLength(3);
    });

    it("应该返回空数组当没有工具", async () => {
      const ids = await registry.ids();
      expect(ids).toHaveLength(0);
    });
  });

  // ==================== clear 测试 ====================

  describe("clear", () => {
    it("应该清空所有工具", async () => {
      await registry.register(createMockTool("tool-1"), ToolType.BUILTIN);
      await registry.register(createMockTool("tool-2"), ToolType.BUILTIN);
      await registry.register(createMockTool("tool-3"), ToolType.BUILTIN);

      await registry.clear();

      expect(await registry.size()).toBe(0);
      expect(await registry.list()).toHaveLength(0);
    });
  });

  // ==================== simple tools 测试 ====================

  describe("simple tools", () => {
    it("应该正确注册和获取简单工具", async () => {
      const simpleTool = {
        id: "simple-tool",
        description: "A simple tool",
        parameters: {
          type: "object" as const,
          properties: {
            input: { type: "string" },
          },
        },
        execute: jest.fn().mockResolvedValue({
          output: "Simple result",
        }),
      };

      await registry.registerSimple(simpleTool);
      const result = await registry.getSimple("simple-tool");

      expect(result).toBeDefined();
      expect(result?.id).toBe("simple-tool");
      expect(result?.description).toBe("A simple tool");
    });

    it("注销时应该同时清理 simpleTools", async () => {
      const simpleTool = {
        id: "simple-tool",
        description: "A simple tool",
        execute: jest.fn().mockResolvedValue({ output: "result" }),
      };

      await registry.registerSimple(simpleTool);
      await registry.unregister("simple-tool");

      const result = await registry.getSimple("simple-tool");
      expect(result).toBeUndefined();
    });
  });
});
