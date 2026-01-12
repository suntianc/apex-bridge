/**
 * MCP API Routes
 * MCP服务器管理的REST API端点
 */

import { Router, Request, Response } from "express";
import { mcpIntegration } from "../../services/MCPIntegrationService";
import { logger } from "../../utils/logger";

const router = Router();

/**
 * @route   GET /api/mcp/servers
 * @desc    获取所有注册的MCP服务器列表
 * @access  Public
 */
router.get("/servers", async (req: Request, res: Response) => {
  try {
    const servers = mcpIntegration.getServers();

    res.json({
      success: true,
      data: servers,
      meta: {
        total: servers.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error("[MCP API] Failed to get servers:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "GET_SERVERS_FAILED",
        message: error.message || "Failed to get servers",
      },
    });
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
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_CONFIG",
          message: "Missing required fields: id, type, command",
        },
      });
    }

    const result = await mcpIntegration.registerServer(config);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "REGISTRATION_FAILED",
          message: result.error || "Registration failed",
        },
      });
    }

    res.status(201).json({
      success: true,
      data: {
        serverId: result.serverId,
        message: "Server registered successfully",
      },
    });
  } catch (error: any) {
    logger.error("[MCP API] Failed to register server:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "REGISTRATION_ERROR",
        message: error.message || "Registration error",
      },
    });
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
      return res.status(404).json({
        success: false,
        error: {
          code: "SERVER_NOT_FOUND",
          message: `Server ${serverId} not found`,
        },
      });
    }

    res.json({
      success: true,
      data: server,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error("[MCP API] Failed to get server:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "GET_SERVER_FAILED",
        message: error.message || "Failed to get server",
      },
    });
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
      return res.status(404).json({
        success: false,
        error: {
          code: "SERVER_NOT_FOUND",
          message: `Server ${serverId} not found`,
        },
      });
    }

    res.json({
      success: true,
      data: {
        serverId,
        message: "Server unregistered successfully",
      },
    });
  } catch (error: any) {
    logger.error("[MCP API] Failed to unregister server:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "UNREGISTRATION_ERROR",
        message: error.message || "Unregistration error",
      },
    });
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
      return res.status(404).json({
        success: false,
        error: {
          code: "SERVER_NOT_FOUND",
          message: `Server ${serverId} not found`,
        },
      });
    }

    res.json({
      success: true,
      data: {
        serverId,
        message: "Server restarted successfully",
      },
    });
  } catch (error: any) {
    logger.error("[MCP API] Failed to restart server:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "RESTART_ERROR",
        message: error.message || "Restart error",
      },
    });
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
      return res.status(404).json({
        success: false,
        error: {
          code: "SERVER_NOT_FOUND",
          message: `Server ${serverId} not found`,
        },
      });
    }

    res.json({
      success: true,
      data: {
        serverId,
        status,
      },
    });
  } catch (error: any) {
    logger.error("[MCP API] Failed to get server status:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "GET_STATUS_FAILED",
        message: error.message || "Failed to get server status",
      },
    });
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
      return res.status(404).json({
        success: false,
        error: {
          code: "SERVER_NOT_FOUND",
          message: `Server ${serverId} not found`,
        },
      });
    }

    res.json({
      success: true,
      data: {
        serverId,
        tools: server.tools,
        count: server.tools.length,
      },
    });
  } catch (error: any) {
    logger.error("[MCP API] Failed to get server tools:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "GET_TOOLS_FAILED",
        message: error.message || "Failed to get server tools",
      },
    });
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
      return res.status(validation.error!.statusCode).json({
        success: false,
        error: {
          code: validation.error!.code,
          message: validation.error!.message,
        },
      });
    }

    const result = await mcpIntegration.callTool({
      toolName,
      arguments: arguments_ || {},
      serverId,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error("[MCP API] Failed to call tool:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "TOOL_CALL_ERROR",
        message: error.message || "Tool call error",
      },
    });
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
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_TOOL_NAME",
          message: "Missing toolName",
        },
      });
    }

    const result = await mcpIntegration.callTool({
      toolName,
      arguments: args || {},
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error("[MCP API] Failed to call tool:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "TOOL_CALL_ERROR",
        message: error.message || "Tool call error",
      },
    });
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

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    logger.error("[MCP API] Failed to get statistics:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "GET_STATISTICS_FAILED",
        message: error.message || "Failed to get statistics",
      },
    });
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
    res.status(503).json({
      success: false,
      error: {
        code: "HEALTH_CHECK_FAILED",
        message: error.message || "Health check failed",
      },
    });
  }
});

export default router;
