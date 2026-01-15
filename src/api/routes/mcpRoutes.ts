/**
 * MCP API Routes
 * MCP服务器管理的REST API端点
 */

import { Router, Request, Response } from "express";
import { mcpIntegration } from "../../services/MCPIntegrationService";
import { logger } from "../../utils/logger";
import {
  ok,
  created,
  badRequest,
  notFound,
  serverError,
  serviceUnavailable,
} from "../../utils/http-response";

const router = Router();

/**
 * @route   GET /api/mcp/servers
 * @desc    获取所有注册的MCP服务器列表
 * @access  Public
 */
router.get("/servers", async (req: Request, res: Response) => {
  try {
    const servers = mcpIntegration.getServers();

    ok(res, {
      servers,
      meta: {
        total: servers.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error("[MCP API] Failed to get servers:", error);
    serverError(res, error, "Get servers");
  }
});

/**
 * @route   POST /api/mcp/servers
 * @desc    注册新的MCP服务器
 * @access  Public
 */
router.post("/servers", async (req: Request, res: Response) => {
  try {
    const config = req.body;

    // 验证必要字段
    if (!config.id || !config.type || !config.command) {
      return badRequest(res, "Missing required fields: id, type, command", {
        code: "INVALID_CONFIG",
      });
    }

    const result = await mcpIntegration.registerServer(config);

    if (!result.success) {
      return badRequest(res, result.error || "Registration failed", {
        code: "REGISTRATION_FAILED",
      });
    }

    created(res, {
      serverId: result.serverId,
      message: "Server registered successfully",
    });
  } catch (error: any) {
    logger.error("[MCP API] Failed to register server:", error);
    serverError(res, error, "Register server");
  }
});

/**
 * @route   GET /api/mcp/servers/:serverId
 * @desc    获取特定MCP服务器的详细信息
 * @access  Public
 */
router.get("/servers/:serverId", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const server = mcpIntegration.getServer(serverId);

    if (!server) {
      return notFound(res, `Server ${serverId} not found`);
    }

    ok(res, {
      server,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error("[MCP API] Failed to get server:", error);
    serverError(res, error, "Get server");
  }
});

/**
 * @route   DELETE /api/mcp/servers/:serverId
 * @desc    注销MCP服务器
 * @access  Public
 */
router.delete("/servers/:serverId", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const success = await mcpIntegration.unregisterServer(serverId);

    if (!success) {
      return notFound(res, `Server ${serverId} not found`);
    }

    ok(res, {
      serverId,
      message: "Server unregistered successfully",
    });
  } catch (error: any) {
    logger.error("[MCP API] Failed to unregister server:", error);
    serverError(res, error, "Unregister server");
  }
});

/**
 * @route   POST /api/mcp/servers/:serverId/restart
 * @desc    重启MCP服务器
 * @access  Public
 */
router.post("/servers/:serverId/restart", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const success = await mcpIntegration.restartServer(serverId);

    if (!success) {
      return notFound(res, `Server ${serverId} not found`);
    }

    ok(res, {
      serverId,
      message: "Server restarted successfully",
    });
  } catch (error: any) {
    logger.error("[MCP API] Failed to restart server:", error);
    serverError(res, error, "Restart server");
  }
});

/**
 * @route   GET /api/mcp/servers/:serverId/status
 * @desc    获取MCP服务器状态
 * @access  Public
 */
router.get("/servers/:serverId/status", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const status = mcpIntegration.getServerStatus(serverId);

    if (!status) {
      return notFound(res, `Server ${serverId} not found`);
    }

    ok(res, {
      serverId,
      status,
    });
  } catch (error: any) {
    logger.error("[MCP API] Failed to get server status:", error);
    serverError(res, error, "Get server status");
  }
});

/**
 * @route   GET /api/mcp/servers/:serverId/tools
 * @desc    获取MCP服务器的工具列表
 * @access  Public
 */
router.get("/servers/:serverId/tools", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const server = mcpIntegration.getServer(serverId);

    if (!server) {
      return notFound(res, `Server ${serverId} not found`);
    }

    ok(res, {
      serverId,
      tools: server.tools,
      count: server.tools.length,
    });
  } catch (error: any) {
    logger.error("[MCP API] Failed to get server tools:", error);
    serverError(res, error, "Get server tools");
  }
});

/**
 * Validate tool call request parameters
 * @param serverId Server ID from params
 * @param toolName Tool name from params
 * @param arguments_ Request body arguments
 * @returns Validation result with error details if invalid
 */
interface ToolCallValidationResult {
  valid: boolean;
  error?: {
    code: string;
    message: string;
    statusCode: number;
  };
}

function validateToolCallRequest(
  serverId: string | undefined,
  toolName: string | undefined,
  arguments_: any
): ToolCallValidationResult {
  // Validate serverId
  if (!serverId || typeof serverId !== "string" || serverId.trim() === "") {
    return {
      valid: false,
      error: {
        code: "INVALID_SERVER_ID",
        message: "Missing or invalid serverId parameter",
        statusCode: 400,
      },
    };
  }

  // Validate toolName
  if (!toolName || typeof toolName !== "string" || toolName.trim() === "") {
    return {
      valid: false,
      error: {
        code: "INVALID_TOOL_NAME",
        message: "Missing or invalid toolName parameter",
        statusCode: 400,
      },
    };
  }

  // Validate arguments type
  if (arguments_ !== undefined && arguments_ !== null && typeof arguments_ !== "object") {
    return {
      valid: false,
      error: {
        code: "INVALID_ARGUMENTS",
        message: "Arguments must be an object, null, or undefined",
        statusCode: 400,
      },
    };
  }

  // Validate arguments structure if provided
  if (arguments_ && typeof arguments_ === "object") {
    // Check for circular references in arguments
    try {
      JSON.stringify(arguments_);
    } catch {
      return {
        valid: false,
        error: {
          code: "INVALID_ARGUMENTS",
          message: "Arguments contain circular references or are not serializable",
          statusCode: 400,
        },
      };
    }
  }

  return { valid: true };
}

/**
 * @route   POST /api/mcp/servers/:serverId/tools/:toolName/call
 * @desc    调用MCP工具
 * @access  Public
 */
router.post("/servers/:serverId/tools/:toolName/call", async (req: Request, res: Response) => {
  try {
    const { serverId, toolName } = req.params;
    const arguments_ = req.body;

    // Validate request parameters
    const validation = validateToolCallRequest(serverId, toolName, arguments_);
    if (!validation.valid) {
      return badRequest(res, validation.error!.message, { code: validation.error!.code });
    }

    const result = await mcpIntegration.callTool({
      toolName,
      arguments: arguments_ || {},
      serverId,
    });

    ok(res, result);
  } catch (error: any) {
    logger.error("[MCP API] Failed to call tool:", error);
    serverError(res, error, "Call tool");
  }
});

/**
 * @route   POST /api/mcp/tools/call
 * @desc    调用MCP工具（自动发现）
 * @access  Public
 */
router.post("/tools/call", async (req: Request, res: Response) => {
  try {
    const { toolName, arguments: args } = req.body;

    if (!toolName) {
      return badRequest(res, "Missing toolName", { code: "MISSING_TOOL_NAME" });
    }

    const result = await mcpIntegration.callTool({
      toolName,
      arguments: args || {},
    });

    ok(res, result);
  } catch (error: any) {
    logger.error("[MCP API] Failed to call tool:", error);
    serverError(res, error, "Call tool");
  }
});

/**
 * @route   GET /api/mcp/statistics
 * @desc    获取MCP统计信息
 * @access  Public
 */
router.get("/statistics", async (req: Request, res: Response) => {
  try {
    const stats = mcpIntegration.getStatistics();

    ok(res, stats);
  } catch (error: any) {
    logger.error("[MCP API] Failed to get statistics:", error);
    serverError(res, error, "Get statistics");
  }
});

/**
 * @route   GET /api/mcp/health
 * @desc    MCP健康检查
 * @access  Public
 */
router.get("/health", async (req: Request, res: Response) => {
  try {
    const health = await mcpIntegration.healthCheck();

    const statusCode = health.healthy ? 200 : 503;

    res.status(statusCode).json({
      success: health.healthy,
      data: health,
    });
  } catch (error: any) {
    logger.error("[MCP API] Health check failed:", error);
    serviceUnavailable(
      res,
      error.message || "Health check failed",
      "server_error",
      "HEALTH_CHECK_FAILED"
    );
  }
});

export default router;
