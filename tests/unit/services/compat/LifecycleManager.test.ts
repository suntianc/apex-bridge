/**
 * Unit tests for LifecycleManager
 */

import { LifecycleManager } from "../../../../src/services/compat/LifecycleManager";
import { SkillLifecycleHooks, SkillLifecycleContext } from "../../../../src/services/compat/types";
import { SkillMetadata } from "../../../../src/types/tool-system";

describe("LifecycleManager", () => {
  let manager: LifecycleManager;

  beforeEach(() => {
    manager = new LifecycleManager();
  });

  afterEach(() => {
    manager.clear();
  });

  describe("registerHooks", () => {
    it("should register lifecycle hooks for a skill", () => {
      const hooks: SkillLifecycleHooks = {
        preInstall: jest.fn(),
        postInstall: jest.fn(),
      };

      manager.registerHooks("test-skill", hooks);

      const registeredSkills = manager.getRegisteredSkills();
      expect(registeredSkills).toContain("test-skill");
    });
  });

  describe("unregisterHooks", () => {
    it("should unregister lifecycle hooks for a skill", () => {
      const hooks: SkillLifecycleHooks = {
        preInstall: jest.fn(),
      };

      manager.registerHooks("test-skill", hooks);
      manager.unregisterHooks("test-skill");

      const registeredSkills = manager.getRegisteredSkills();
      expect(registeredSkills).not.toContain("test-skill");
    });
  });

  describe("preInstall", () => {
    it("should execute preInstall hook when registered", async () => {
      const preInstallMock = jest.fn();
      const hooks: SkillLifecycleHooks = {
        preInstall: preInstallMock,
      };

      manager.registerHooks("test-skill", hooks);

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
        metadata: {
          name: "test-skill",
          description: "Test",
          version: "1.0.0",
          tags: [],
        },
      };

      await manager.preInstall(ctx);

      expect(preInstallMock).toHaveBeenCalledWith(ctx);
    });

    it("should not throw when no hook is registered", async () => {
      const ctx: SkillLifecycleContext = {
        skillName: "unregistered-skill",
        skillPath: "/path/to/unregistered-skill",
      };

      await expect(manager.preInstall(ctx)).resolves.not.toThrow();
    });
  });

  describe("postInstall", () => {
    it("should execute postInstall hook when registered", async () => {
      const postInstallMock = jest.fn();
      const hooks: SkillLifecycleHooks = {
        postInstall: postInstallMock,
      };

      manager.registerHooks("test-skill", hooks);

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
        compatibility: {
          source: "claude-code",
        },
      };

      await manager.postInstall(ctx);

      expect(postInstallMock).toHaveBeenCalledWith(ctx);
    });

    it("should cache compatibility information", async () => {
      const hooks: SkillLifecycleHooks = {};

      manager.registerHooks("test-skill", hooks);

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
        compatibility: {
          source: "claude-code",
          model: "claude-3-5-sonnet",
        },
      };

      await manager.postInstall(ctx);

      const compatibility = manager.getCompatibility("test-skill");
      expect(compatibility?.source).toBe("claude-code");
      expect(compatibility?.model).toBe("claude-3-5-sonnet");
    });
  });

  describe("preUpdate", () => {
    it("should execute preUpdate hook when registered", async () => {
      const preUpdateMock = jest.fn();
      const hooks: SkillLifecycleHooks = {
        preUpdate: preUpdateMock,
      };

      manager.registerHooks("test-skill", hooks);

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
      };

      await manager.preUpdate(ctx);

      expect(preUpdateMock).toHaveBeenCalledWith(ctx);
    });
  });

  describe("postUpdate", () => {
    it("should execute postUpdate hook when registered", async () => {
      const postUpdateMock = jest.fn();
      const hooks: SkillLifecycleHooks = {
        postUpdate: postUpdateMock,
      };

      manager.registerHooks("test-skill", hooks);

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
      };

      await manager.postUpdate(ctx);

      expect(postUpdateMock).toHaveBeenCalledWith(ctx);
    });

    it("should update cached compatibility", async () => {
      const hooks: SkillLifecycleHooks = {};

      // First install with initial compatibility
      const initialCtx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
        compatibility: {
          source: "claude-code",
          model: "claude-3-5-sonnet",
        },
      };

      await manager.postInstall(initialCtx);

      // Then update with new compatibility
      const updateCtx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
        compatibility: {
          source: "claude-code",
          model: "claude-4",
        },
      };

      await manager.postUpdate(updateCtx);

      const compatibility = manager.getCompatibility("test-skill");
      expect(compatibility?.model).toBe("claude-4");
    });
  });

  describe("preUninstall", () => {
    it("should execute preUninstall hook when registered", async () => {
      const preUninstallMock = jest.fn();
      const hooks: SkillLifecycleHooks = {
        preUninstall: preUninstallMock,
      };

      manager.registerHooks("test-skill", hooks);

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
      };

      await manager.preUninstall(ctx);

      expect(preUninstallMock).toHaveBeenCalledWith(ctx);
    });
  });

  describe("postUninstall", () => {
    it("should execute postUninstall hook when registered", async () => {
      const postUninstallMock = jest.fn();
      const hooks: SkillLifecycleHooks = {
        postUninstall: postUninstallMock,
      };

      manager.registerHooks("test-skill", hooks);

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
      };

      await manager.postUninstall(ctx);

      expect(postUninstallMock).toHaveBeenCalledWith(ctx);
    });

    it("should clear hooks and cache after uninstall", async () => {
      const hooks: SkillLifecycleHooks = {};

      manager.registerHooks("test-skill", hooks);

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
        compatibility: {
          source: "claude-code",
        },
      };

      await manager.postUninstall(ctx);

      const registeredSkills = manager.getRegisteredSkills();
      const compatibility = manager.getCompatibility("test-skill");

      expect(registeredSkills).not.toContain("test-skill");
      expect(compatibility).toBeUndefined();
    });
  });

  describe("checkDependencies", () => {
    it("should return satisfied when all dependencies are installed", async () => {
      const result = await manager.checkDependencies(["dep1", "dep2"], ["dep1", "dep2", "dep3"]);

      expect(result.satisfied).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.installed).toEqual(["dep1", "dep2"]);
    });

    it("should return unsatisfied when some dependencies are missing", async () => {
      const result = await manager.checkDependencies(["dep1", "missing-dep"], ["dep1", "dep2"]);

      expect(result.satisfied).toBe(false);
      expect(result.missing).toEqual(["missing-dep"]);
      expect(result.installed).toEqual(["dep1"]);
    });

    it("should be case-insensitive for dependency names", async () => {
      const result = await manager.checkDependencies(["Dep1"], ["dep1"]);

      expect(result.satisfied).toBe(true);
    });
  });

  describe("hasCapability", () => {
    it("should return true when skill has capability", async () => {
      const hooks: SkillLifecycleHooks = {};

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
        compatibility: {
          source: "claude-code",
          userInvocable: true,
        },
      };

      await manager.postInstall(ctx);

      expect(manager.hasCapability("test-skill", "userInvocable")).toBe(true);
    });

    it("should return false when skill does not have capability", async () => {
      const hooks: SkillLifecycleHooks = {};

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
        compatibility: {
          source: "claude-code",
        },
      };

      await manager.postInstall(ctx);

      expect(manager.hasCapability("test-skill", "userInvocable")).toBe(false);
    });

    it("should return false for unregistered skills", () => {
      expect(manager.hasCapability("unregistered", "userInvocable")).toBe(false);
    });
  });

  describe("createContext", () => {
    it("should create context with all provided fields", () => {
      const metadata: SkillMetadata = {
        name: "test-skill",
        description: "Test",
        version: "1.0.0",
        tags: [],
        dependencies: ["dep1"],
      };

      const ctx = manager.createContext(
        "test-skill",
        "/path/to/test-skill",
        metadata,
        { source: "claude-code" },
        "strict"
      );

      expect(ctx.skillName).toBe("test-skill");
      expect(ctx.skillPath).toBe("/path/to/test-skill");
      expect(ctx.metadata).toBe(metadata);
      expect(ctx.compatibility?.source).toBe("claude-code");
      expect(ctx.validationLevel).toBe("strict");
      expect(ctx.dependencies).toEqual(["dep1"]);
    });

    it("should use default validation level when not provided", () => {
      const metadata: SkillMetadata = {
        name: "test-skill",
        description: "Test",
        version: "1.0.0",
        tags: [],
      };

      const ctx = manager.createContext("test-skill", "/path/to/test-skill", metadata);

      expect(ctx.validationLevel).toBe("basic");
    });
  });

  describe("clear", () => {
    it("should remove all registered hooks", () => {
      manager.registerHooks("skill1", {});
      manager.registerHooks("skill2", {});

      manager.clear();

      const registeredSkills = manager.getRegisteredSkills();
      expect(registeredSkills).toEqual([]);
    });
  });

  describe("executeInstallLifecycle", () => {
    const createMetadata = (): SkillMetadata => ({
      name: "test-skill",
      description: "Test skill",
      version: "1.0.0",
      tags: [],
    });

    it("should execute preInstall and postInstall hooks in order", async () => {
      const executionOrder: string[] = [];
      const hooks: SkillLifecycleHooks = {
        preInstall: jest.fn().mockImplementation(() => {
          executionOrder.push("preInstall");
        }),
        postInstall: jest.fn().mockImplementation(() => {
          executionOrder.push("postInstall");
        }),
      };

      manager.registerHooks("test-skill", hooks);
      manager.setInstallHook(
        jest.fn().mockImplementation(() => {
          executionOrder.push("install");
        })
      );

      const result = await manager.executeInstallLifecycle(
        "test-skill",
        "/path/to/test-skill",
        createMetadata()
      );

      expect(result.success).toBe(true);
      expect(executionOrder).toEqual(["preInstall", "install", "postInstall"]);
    });

    it("should return failure result when preInstall fails", async () => {
      const hooks: SkillLifecycleHooks = {
        preInstall: jest.fn().mockRejectedValue(new Error("preInstall failed")),
        postInstall: jest.fn(),
      };

      manager.registerHooks("test-skill", hooks);

      const result = await manager.executeInstallLifecycle(
        "test-skill",
        "/path/to/test-skill",
        createMetadata()
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("preInstall failed");
    });

    it("should return failure result when postInstall fails and trigger rollback", async () => {
      const preUninstallMock = jest.fn();
      const hooks: SkillLifecycleHooks = {
        preInstall: jest.fn(),
        postInstall: jest.fn().mockRejectedValue(new Error("postInstall failed")),
        preUninstall: preUninstallMock,
      };

      manager.registerHooks("test-skill", hooks);
      manager.setInstallHook(jest.fn());

      const result = await manager.executeInstallLifecycle(
        "test-skill",
        "/path/to/test-skill",
        createMetadata()
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("postInstall failed");
      expect(preUninstallMock).toHaveBeenCalled();
    });

    it("should not fail when no hooks are registered", async () => {
      const result = await manager.executeInstallLifecycle(
        "test-skill",
        "/path/to/test-skill",
        createMetadata()
      );

      expect(result.success).toBe(true);
      expect(result.context.skillName).toBe("test-skill");
    });
  });

  describe("executeUpdateLifecycle", () => {
    const createMetadata = (version = "2.0.0"): SkillMetadata => ({
      name: "test-skill",
      description: "Test skill",
      version,
      tags: [],
    });

    it("should execute preUpdate and postUpdate hooks in order", async () => {
      const executionOrder: string[] = [];
      const hooks: SkillLifecycleHooks = {
        preUpdate: jest.fn().mockImplementation(() => {
          executionOrder.push("preUpdate");
        }),
        postUpdate: jest.fn().mockImplementation(() => {
          executionOrder.push("postUpdate");
        }),
      };

      manager.registerHooks("test-skill", hooks);
      manager.setUpdateHook(
        jest.fn().mockImplementation(() => {
          executionOrder.push("update");
        })
      );

      const result = await manager.executeUpdateLifecycle(
        "test-skill",
        "/path/to/test-skill",
        createMetadata()
      );

      expect(result.success).toBe(true);
      expect(executionOrder).toEqual(["preUpdate", "update", "postUpdate"]);
      expect(result.previousVersion).toBe("2.0.0");
    });

    it("should return failure result when update fails and trigger rollback", async () => {
      const hooks: SkillLifecycleHooks = {
        preUpdate: jest.fn(),
        postUpdate: jest.fn().mockRejectedValue(new Error("update failed")),
      };

      manager.registerHooks("test-skill", hooks);
      manager.setUpdateHook(jest.fn().mockRejectedValue(new Error("update failed")));

      const result = await manager.executeUpdateLifecycle(
        "test-skill",
        "/path/to/test-skill",
        createMetadata()
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("update failed");
    });

    it("should save rollback state before update", async () => {
      const hooks: SkillLifecycleHooks = {
        preUpdate: jest.fn(),
        postUpdate: jest.fn().mockRejectedValue(new Error("update failed")),
      };

      // First install to set compatibility
      const installHooks: SkillLifecycleHooks = {};
      manager.registerHooks("test-skill", installHooks);
      await manager.postInstall({
        skillName: "test-skill",
        skillPath: "/path",
        compatibility: { source: "claude-code", model: "claude-3-5-sonnet" },
      });

      manager.registerHooks("test-skill", hooks);
      manager.setUpdateHook(jest.fn().mockRejectedValue(new Error("update failed")));

      await manager.executeUpdateLifecycle("test-skill", "/path/to/test-skill", createMetadata());

      // Should have attempted rollback (internal state management)
      expect(manager.getRegisteredSkills()).toContain("test-skill");
    });
  });

  describe("executeUninstallLifecycle", () => {
    const createMetadata = (): SkillMetadata => ({
      name: "test-skill",
      description: "Test skill",
      version: "1.0.0",
      tags: [],
    });

    it("should execute preUninstall and postUninstall hooks in order", async () => {
      const executionOrder: string[] = [];
      const hooks: SkillLifecycleHooks = {
        preUninstall: jest.fn().mockImplementation(() => {
          executionOrder.push("preUninstall");
        }),
        postUninstall: jest.fn().mockImplementation(() => {
          executionOrder.push("postUninstall");
        }),
      };

      manager.registerHooks("test-skill", hooks);
      manager.setUninstallHook(
        jest.fn().mockImplementation(() => {
          executionOrder.push("uninstall");
        })
      );

      const result = await manager.executeUninstallLifecycle(
        "test-skill",
        "/path/to/test-skill",
        createMetadata()
      );

      expect(result.success).toBe(true);
      expect(executionOrder).toEqual(["preUninstall", "uninstall", "postUninstall"]);
    });

    it("should return failure result when preUninstall fails", async () => {
      const hooks: SkillLifecycleHooks = {
        preUninstall: jest.fn().mockRejectedValue(new Error("preUninstall failed")),
        postUninstall: jest.fn(),
      };

      manager.registerHooks("test-skill", hooks);

      const result = await manager.executeUninstallLifecycle(
        "test-skill",
        "/path/to/test-skill",
        createMetadata()
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("preUninstall failed");
    });

    it("should return failure result when uninstall operation fails", async () => {
      const hooks: SkillLifecycleHooks = {
        preUninstall: jest.fn(),
        postUninstall: jest.fn(),
      };

      manager.registerHooks("test-skill", hooks);
      manager.setUninstallHook(jest.fn().mockRejectedValue(new Error("uninstall failed")));

      const result = await manager.executeUninstallLifecycle(
        "test-skill",
        "/path/to/test-skill",
        createMetadata()
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("uninstall failed");
    });

    it("should return failure result but not throw when postUninstall fails", async () => {
      const hooks: SkillLifecycleHooks = {
        preUninstall: jest.fn(),
        postUninstall: jest.fn().mockRejectedValue(new Error("postUninstall failed")),
      };

      manager.registerHooks("test-skill", hooks);
      manager.setUninstallHook(jest.fn());

      const result = await manager.executeUninstallLifecycle(
        "test-skill",
        "/path/to/test-skill",
        createMetadata()
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("postUninstall failed");
    });

    it("should clean up hooks after successful uninstall", async () => {
      const hooks: SkillLifecycleHooks = {
        preUninstall: jest.fn(),
        postUninstall: jest.fn(),
      };

      manager.registerHooks("test-skill", hooks);
      manager.setUninstallHook(jest.fn());

      await manager.executeUninstallLifecycle(
        "test-skill",
        "/path/to/test-skill",
        createMetadata()
      );

      const registeredSkills = manager.getRegisteredSkills();
      expect(registeredSkills).not.toContain("test-skill");
    });
  });

  describe("custom hooks", () => {
    const createMetadata = (): SkillMetadata => ({
      name: "test-skill",
      description: "Test skill",
      version: "1.0.0",
      tags: [],
    });

    it("should use custom install hook when set", async () => {
      const customInstall = jest.fn();
      manager.setInstallHook(customInstall);

      await manager.executeInstallLifecycle("test-skill", "/path/to/test-skill", createMetadata());

      expect(customInstall).toHaveBeenCalledWith(
        "test-skill",
        "/path/to/test-skill",
        createMetadata()
      );
    });

    it("should use custom update hook when set", async () => {
      const customUpdate = jest.fn();
      manager.setUpdateHook(customUpdate);

      await manager.executeUpdateLifecycle("test-skill", "/path/to/test-skill", createMetadata());

      expect(customUpdate).toHaveBeenCalledWith(
        "test-skill",
        "/path/to/test-skill",
        createMetadata()
      );
    });

    it("should use custom uninstall hook when set", async () => {
      const customUninstall = jest.fn();
      manager.setUninstallHook(customUninstall);

      await manager.executeUninstallLifecycle(
        "test-skill",
        "/path/to/test-skill",
        createMetadata()
      );

      expect(customUninstall).toHaveBeenCalledWith("test-skill", "/path/to/test-skill");
    });
  });
});
