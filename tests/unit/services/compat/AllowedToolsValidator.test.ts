/**
 * AllowedToolsValidator 单元测试
 */

import {
  AllowedToolsValidator,
  ValidationResult,
  BatchValidationResult,
  PermissionDeniedError,
  getAllowedToolsValidator,
  resetAllowedToolsValidator,
} from "../../../../src/services/compat/AllowedToolsValidator";

// Mock logger
jest.mock("../../../../src/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { logger } from "../../../../src/utils/logger";

describe("AllowedToolsValidator", () => {
  let validator: AllowedToolsValidator;

  beforeEach(() => {
    jest.clearAllMocks();

    validator = new AllowedToolsValidator({
      strictMode: true,
      defaultAllowed: [],
      allowedPrefixes: [],
      caseSensitive: true,
      logDetails: true,
    });
  });

  afterEach(() => {
    resetAllowedToolsValidator();
  });

  describe("构造函数和配置", () => {
    it("应该使用默认配置创建验证器", () => {
      const defaultValidator = new AllowedToolsValidator();
      const config = defaultValidator.getConfig();

      expect(config.strictMode).toBe(true);
      expect(config.defaultAllowed).toEqual([]);
      expect(config.allowedPrefixes).toEqual([]);
      expect(config.caseSensitive).toBe(true);
      expect(config.logDetails).toBe(true);
    });

    it("应该支持自定义配置", () => {
      const customValidator = new AllowedToolsValidator({
        strictMode: false,
        defaultAllowed: ["read-file"],
        allowedPrefixes: ["file:"],
        caseSensitive: false,
        logDetails: false,
      });

      const config = customValidator.getConfig();

      expect(config.strictMode).toBe(false);
      expect(config.defaultAllowed).toEqual(["read-file"]);
      expect(config.allowedPrefixes).toEqual(["file:"]);
      expect(config.caseSensitive).toBe(false);
      expect(config.logDetails).toBe(false);
    });

    it("应该支持更新配置", () => {
      validator.updateConfig({ strictMode: false, caseSensitive: false });
      const config = validator.getConfig();

      expect(config.strictMode).toBe(false);
      expect(config.caseSensitive).toBe(false);
      expect(config.defaultAllowed).toEqual([]);
    });
  });

  describe("validate - 单工具验证", () => {
    it("应该允许工具在 allowedTools 列表中", () => {
      const result = validator.validate("read-file", ["read-file", "write-file"]);

      expect(result.allowed).toBe(true);
      expect(result.toolName).toBe("read-file");
      expect(result.reason).toBe("Tool found in allowedTools list");
    });

    it("应该拒绝工具不在 allowedTools 列表中", () => {
      const result = validator.validate("dangerous-tool", ["read-file"]);

      expect(result.allowed).toBe(false);
      expect(result.toolName).toBe("dangerous-tool");
      expect(result.reason).toContain("not in the allowed tools list");
    });

    it("应该支持尾部通配符模式", () => {
      const result = validator.validate("file-read", ["file:*"]);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe("Tool matched wildcard pattern");
    });

    it("应该支持头部通配符模式", () => {
      const result = validator.validate("custom-read", ["*-read"]);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe("Tool matched wildcard pattern");
    });

    it("应该支持中间通配符模式", () => {
      const result = validator.validate("file-abc-operation", ["file-*-operation"]);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe("Tool matched wildcard pattern");
    });

    it("应该处理空 allowedTools 列表在严格模式", () => {
      const result = validator.validate("any-tool", []);

      expect(result.allowed).toBe(false);
    });

    it("应该允许所有工具在非严格模式且无 allowedTools", () => {
      const nonStrictValidator = new AllowedToolsValidator({ strictMode: false });
      const result = nonStrictValidator.validate("any-tool", []);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe("No allowedTools configured and not in strict mode");
    });

    it("应该处理无效的工具名称", () => {
      const result1 = validator.validate("", ["read-file"]);
      const result2 = validator.validate("   ", ["read-file"]);
      const result3 = validator.validate(null as any, ["read-file"]);

      expect(result1.allowed).toBe(false);
      expect(result2.allowed).toBe(false);
      expect(result3.allowed).toBe(false);
    });

    it("应该区分大小写默认", () => {
      const result = validator.validate("Read-File", ["read-file"]);

      expect(result.allowed).toBe(false);
    });

    it("应该不区分大小写当 caseSensitive 为 false", () => {
      const caseInsensitiveValidator = new AllowedToolsValidator({ caseSensitive: false });
      const result = caseInsensitiveValidator.validate("Read-File", ["read-file"]);

      expect(result.allowed).toBe(true);
    });
  });

  describe("validateAll - 批量验证", () => {
    it("应该允许所有工具在列表中", () => {
      const result = validator.validateAll(
        ["read-file", "write-file"],
        ["read-file", "write-file", "list-files"]
      );

      expect(result.allowed).toBe(true);
      expect(result.deniedTools).toHaveLength(0);
      expect(result.missingPermissions).toHaveLength(0);
      expect(result.validatedTools).toHaveLength(2);
    });

    it("应该拒绝部分不在列表中的工具", () => {
      const result = validator.validateAll(
        ["read-file", "dangerous-tool"],
        ["read-file", "write-file"]
      );

      expect(result.allowed).toBe(false);
      expect(result.deniedTools).toEqual(["dangerous-tool"]);
      expect(result.missingPermissions).toEqual(["dangerous-tool"]);
    });

    it("应该拒绝所有不在列表中的工具", () => {
      const result = validator.validateAll(["tool1", "tool2"], ["tool3", "tool4"]);

      expect(result.allowed).toBe(false);
      expect(result.deniedTools).toEqual(["tool1", "tool2"]);
      expect(result.missingPermissions).toEqual(["tool1", "tool2"]);
    });

    it("应该处理通配符匹配在批量验证中", () => {
      const result = validator.validateAll(
        ["file-read", "file-write", "custom-tool"],
        ["file:*", "list:*"]
      );

      expect(result.allowed).toBe(false);
      expect(result.deniedTools).toEqual(["custom-tool"]);
    });

    it("应该处理空工具列表", () => {
      const result = validator.validateAll([], ["read-file"]);

      expect(result.allowed).toBe(true);
      expect(result.deniedTools).toHaveLength(0);
    });

    it("应该记录批量验证日志当有拒绝时", () => {
      validator.validateAll(["tool1"], ["tool2"]);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining("Batch validation found denied tools"),
        expect.any(Object)
      );
    });
  });

  describe("getMissingPermissions", () => {
    it("应该返回缺失的权限列表", () => {
      const missing = validator.getMissingPermissions(
        ["read-file", "dangerous-tool"],
        ["read-file", "write-file"]
      );

      expect(missing).toEqual(["dangerous-tool"]);
    });

    it("应该返回空数组当所有工具都允许", () => {
      const missing = validator.getMissingPermissions(
        ["read-file", "write-file"],
        ["read-file", "write-file"]
      );

      expect(missing).toEqual([]);
    });

    it("应该支持通配符模式", () => {
      const missing = validator.getMissingPermissions(["file-read", "custom-tool"], ["file:*"]);

      expect(missing).toEqual(["custom-tool"]);
    });
  });

  describe("validateOrThrow", () => {
    it("应该通过不抛出异常当工具允许", () => {
      expect(() => {
        validator.validateOrThrow("read-file", ["read-file", "write-file"]);
      }).not.toThrow();
    });

    it("应该抛出 PermissionDeniedError 当工具不允许", () => {
      expect(() => {
        validator.validateOrThrow("dangerous-tool", ["read-file"]);
      }).toThrow(PermissionDeniedError);
    });

    it("应该记录拒绝日志当抛出异常", () => {
      try {
        validator.validateOrThrow("dangerous-tool", ["read-file"]);
      } catch {
        // 预期会抛出异常
      }

      expect(logger.warn).toHaveBeenCalledWith(
        "Permission denied for tool",
        expect.objectContaining({
          toolName: "dangerous-tool",
          allowedTools: ["read-file"],
        })
      );
    });

    it("应该正确设置错误属性", () => {
      try {
        validator.validateOrThrow("dangerous-tool", ["read-file", "write-file"]);
      } catch (error: any) {
        expect(error.toolName).toBe("dangerous-tool");
        expect(error.allowedTools).toEqual(["read-file", "write-file"]);
        expect(error.missingPermissions).toEqual(["dangerous-tool"]);
      }
    });
  });

  describe("默认允许工具", () => {
    it("应该允许默认工具", () => {
      const validatorWithDefaults = new AllowedToolsValidator({
        defaultAllowed: ["read-file", "list-files"],
      });

      const result = validatorWithDefaults.validate("read-file", []);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe("Tool is in default allowed list");
    });

    it("应该拒绝非默认工具", () => {
      const validatorWithDefaults = new AllowedToolsValidator({
        defaultAllowed: ["read-file"],
      });

      const result = validatorWithDefaults.validate("dangerous-tool", []);

      expect(result.allowed).toBe(false);
    });

    it("应该支持不区分大小写的默认工具", () => {
      const validatorWithDefaults = new AllowedToolsValidator({
        defaultAllowed: ["read-file"],
        caseSensitive: false,
      });

      const result = validatorWithDefaults.validate("Read-File", []);

      expect(result.allowed).toBe(true);
    });
  });

  describe("前缀白名单", () => {
    it("应该允许匹配前缀的工具", () => {
      const validatorWithPrefixes = new AllowedToolsValidator({
        allowedPrefixes: ["file:", "http:"],
      });

      const result = validatorWithPrefixes.validate("file-read", ["file:*"]);

      expect(result.allowed).toBe(true);
    });

    it("应该拒绝不匹配前缀的工具", () => {
      const validatorWithPrefixes = new AllowedToolsValidator({
        allowedPrefixes: ["file:"],
      });

      const result = validatorWithPrefixes.validate("custom-tool", ["file:*"]);

      expect(result.allowed).toBe(false);
    });
  });
});

describe("AllowedToolsValidator 模块函数", () => {
  beforeEach(() => {
    jest.resetModules();
    resetAllowedToolsValidator();
  });

  afterEach(() => {
    resetAllowedToolsValidator();
  });

  it("应该返回单例默认验证器", () => {
    const {
      getAllowedToolsValidator: getValidator1,
    } = require("../../../../src/services/compat/AllowedToolsValidator");
    const {
      getAllowedToolsValidator: getValidator2,
    } = require("../../../../src/services/compat/AllowedToolsValidator");

    const validator1 = getValidator1();
    const validator2 = getValidator2();

    expect(validator1).toBe(validator2);
  });

  it("应该在提供配置时更新默认验证器", () => {
    const {
      getAllowedToolsValidator,
    } = require("../../../../src/services/compat/AllowedToolsValidator");

    const validator1 = getAllowedToolsValidator();
    const validator2 = getAllowedToolsValidator({ strictMode: false });

    expect(validator1).toBe(validator2);
    expect(validator1.getConfig().strictMode).toBe(false);
  });

  it("应该重置默认验证器", () => {
    const {
      getAllowedToolsValidator,
      resetAllowedToolsValidator: reset,
    } = require("../../../../src/services/compat/AllowedToolsValidator");

    const validator1 = getAllowedToolsValidator();
    reset();

    // 重置后需要重新导入才能获取新实例
    jest.resetModules();
    const {
      getAllowedToolsValidator: getValidator2,
    } = require("../../../../src/services/compat/AllowedToolsValidator");
    const validator2 = getValidator2();

    expect(validator1).not.toBe(validator2);
  });
});

describe("PermissionDeniedError", () => {
  it("应该正确设置错误属性", () => {
    const error = new PermissionDeniedError(
      "dangerous-tool",
      ["read-file", "write-file"],
      ["dangerous-tool"]
    );

    expect(error.toolName).toBe("dangerous-tool");
    expect(error.allowedTools).toEqual(["read-file", "write-file"]);
    expect(error.missingPermissions).toEqual(["dangerous-tool"]);
    expect(error.message).toContain("Permission denied");
    expect(error.name).toBe("PermissionDeniedError");
  });

  it("应该支持自定义错误消息", () => {
    const customMessage = "Custom error message";
    const error = new PermissionDeniedError(
      "dangerous-tool",
      ["read-file"],
      ["dangerous-tool"],
      customMessage
    );

    expect(error.message).toBe(customMessage);
  });
});
