/**
 * NodeController - 节点管理API控制器
 */

import { Request, Response } from 'express';
import { NodeService, NodeStatus, NodeType, NodeInfo } from '../../services/NodeService';
import { NodeManager, NodeFilter } from '../../core/NodeManager';
import { logger } from '../../utils/logger';

const nodeService = NodeService.getInstance();
let nodeManager: NodeManager | null = null;

export function setNodeManager(manager: NodeManager): void {
  nodeManager = manager;
}

function parseStatuses(value: any): NodeStatus[] | undefined {
  if (!value) {
    return undefined;
  }
  const validStatuses: NodeStatus[] = ['online', 'offline', 'busy', 'unknown'];
  const parsed = String(value)
    .split(',')
    .map(item => item.trim())
    .filter(item => validStatuses.includes(item as NodeStatus)) as NodeStatus[];
  return parsed.length > 0 ? parsed : undefined;
}

function parseTypes(value: any): NodeType[] | undefined {
  if (!value) {
    return undefined;
  }
  const validTypes: NodeType[] = ['worker', 'companion', 'custom', 'hub'];
  const parsed = String(value)
    .split(',')
    .map(item => item.trim())
    .filter(item => validTypes.includes(item as NodeType)) as NodeType[];
  return parsed.length > 0 ? parsed : undefined;
}

function respondNodeNotFound(res: Response): void {
  res.status(404).json({
    error: 'Node not found'
  });
}

function sanitizeNode(node: NodeInfo): NodeInfo {
  // 深拷贝保障调用方不可变更内部状态
  return JSON.parse(JSON.stringify(node));
}

function normalizePersonaBindingInput(
  type: NodeType,
  rawBoundPersona: any,
  rawBoundPersonas: any
): { boundPersona?: string; boundPersonas?: string[]; error?: string } {
  if (type === 'hub') {
    const personas: string[] = [];
    if (Array.isArray(rawBoundPersonas)) {
      personas.push(
        ...rawBoundPersonas
          .map((persona) => (typeof persona === 'string' ? persona.trim() : ''))
          .filter(Boolean)
      );
    }
    if (typeof rawBoundPersona === 'string') {
      const normalized = rawBoundPersona.trim();
      if (normalized) {
        personas.push(normalized);
      }
    }
    return { boundPersonas: Array.from(new Set(personas)) };
  }

  if (Array.isArray(rawBoundPersonas) && rawBoundPersonas.length > 1) {
    return { error: 'Non-hub nodes cannot bind multiple personas.' };
  }

  const candidate =
    typeof rawBoundPersona === 'string'
      ? rawBoundPersona
      : Array.isArray(rawBoundPersonas)
      ? rawBoundPersonas[0]
      : undefined;
  const normalized = candidate ? String(candidate).trim() : '';

  if (!normalized) {
    return {};
  }

  return { boundPersona: normalized };
}

/**
 * 获取节点列表
 * GET /api/admin/nodes
 */
export async function getNodes(req: Request, res: Response): Promise<void> {
  try {
    const manager = nodeManager;
    const { status, type, capability } = req.query;

    if (manager) {
      const filter: NodeFilter = {};
      const statuses = parseStatuses(status);
      const types = parseTypes(type);
      if (statuses) {
        filter.status = statuses;
      }
      if (types) {
        filter.type = types;
      }
      if (typeof capability === 'string' && capability.trim().length > 0) {
        filter.capability = capability.trim();
      }

      const nodes = manager.listNodes(Object.keys(filter).length > 0 ? filter : undefined);
      res.json({
        success: true,
        nodes,
        total: nodes.length
      });
      return;
    }

    const nodes = nodeService.getAllNodes();
    res.json({
      success: true,
      nodes: nodes,
      total: nodes.length
    });
  } catch (error: any) {
    logger.error('❌ Failed to get nodes:', error);
    res.status(500).json({
      error: 'Failed to get nodes',
      message: error.message
    });
  }
}

/**
 * 获取节点详情
 * GET /api/admin/nodes/:id
 */
export async function getNode(req: Request, res: Response): Promise<void> {
  try {
    const { nodeId } = req.params as { nodeId: string };
    const id = nodeId;
    let node: NodeInfo | null = null;

    if (nodeManager) {
      node = nodeManager.getNode(id);
    } else {
      node = nodeService.getNode(id);
    }

    if (!node) {
      respondNodeNotFound(res);
      return;
    }

    res.json({
      success: true,
      node: sanitizeNode(node)
    });
  } catch (error: any) {
    logger.error('❌ Failed to get node:', error);
    res.status(500).json({
      error: 'Failed to get node',
      message: error.message
    });
  }
}

/**
 * 注册新节点
 * POST /api/admin/nodes
 */
export async function registerNode(req: Request, res: Response): Promise<void> {
  try {
    const { name, type, capabilities, config, tools, personality, stats } = req.body;
    const { boundPersona: rawBoundPersona, boundPersonas: rawBoundPersonas } = req.body;

    // 注意：基本验证（name、type等）已由验证中间件处理
    // 这里只进行业务逻辑处理
    
    const normalizedType: NodeType = ['worker', 'companion', 'custom', 'hub'].includes(type) ? type : 'custom';

    const personaBindingInput = normalizePersonaBindingInput(normalizedType, rawBoundPersona, rawBoundPersonas);
    if (personaBindingInput.error) {
      res.status(400).json({
        error: personaBindingInput.error
      });
      return;
    }

    let node: NodeInfo;
    if (nodeManager) {
      node = await nodeManager.registerNode({
        name: String(name).trim(),
        type: normalizedType,
        capabilities: Array.isArray(capabilities) ? capabilities : undefined,
        tools: Array.isArray(tools) ? tools : undefined,
        boundPersonas: personaBindingInput.boundPersonas,
        boundPersona: personaBindingInput.boundPersona,
        config,
        personality,
        stats
      });
    } else {
      node = await nodeService.registerNode({
        name: String(name).trim(),
        type: normalizedType,
        capabilities: Array.isArray(capabilities) ? capabilities : undefined,
        tools: Array.isArray(tools) ? tools : undefined,
        boundPersonas: personaBindingInput.boundPersonas,
        boundPersona: personaBindingInput.boundPersona,
        config,
        personality,
        stats
      });
    }

    res.json({
      success: true,
      message: 'Node registered successfully',
      node: sanitizeNode(node)
    });
  } catch (error: any) {
    logger.error('❌ Failed to register node:', error);
    res.status(500).json({
      error: 'Failed to register node',
      message: error.message
    });
  }
}

/**
 * 更新节点配置
 * PUT /api/admin/nodes/:id
 */
export async function updateNode(req: Request, res: Response): Promise<void> {
  try {
    const { nodeId } = req.params as { nodeId: string };
    const id = nodeId;
    const updates: Partial<NodeInfo> = { ...req.body };

    const existingNode = nodeManager ? nodeManager.getNode(id) : nodeService.getNode(id);
    if (!existingNode) {
      respondNodeNotFound(res);
      return;
    }

    const targetType: NodeType = (updates.type as NodeType) ?? existingNode.type;
    const personaBindingInput = normalizePersonaBindingInput(
      targetType,
      updates.boundPersona,
      updates.boundPersonas
    );
    if (personaBindingInput.error) {
      res.status(400).json({
        error: personaBindingInput.error
      });
      return;
    }

    const hasPersonaUpdate =
      Object.prototype.hasOwnProperty.call(updates, 'boundPersona') ||
      Object.prototype.hasOwnProperty.call(updates, 'boundPersonas');

    if (hasPersonaUpdate) {
      if (targetType === 'hub') {
        updates.boundPersonas = personaBindingInput.boundPersonas ?? [];
        delete updates.boundPersona;
      } else {
        updates.boundPersona = personaBindingInput.boundPersona;
        delete updates.boundPersonas;
      }
    } else {
      delete updates.boundPersona;
      delete updates.boundPersonas;
    }

    // 移除不允许修改的字段
    delete updates.id;
    delete updates.registeredAt;

    let node: NodeInfo | null = null;
    if (nodeManager) {
      node = await nodeManager.updateNode(id, updates);
    } else {
      node = await nodeService.updateNode(id, updates);
    }

    if (!node) {
      respondNodeNotFound(res);
      return;
    }

    res.json({
      success: true,
      message: 'Node updated successfully',
      node: sanitizeNode(node)
    });
  } catch (error: any) {
    logger.error('❌ Failed to update node:', error);
    res.status(500).json({
      error: 'Failed to update node',
      message: error.message
    });
  }
}

/**
 * 注销节点
 * DELETE /api/admin/nodes/:id
 */
export async function deleteNode(req: Request, res: Response): Promise<void> {
  try {
    const { nodeId } = req.params as { nodeId: string };
    const id = nodeId;
    let success = false;

    if (nodeManager) {
      success = await nodeManager.unregisterNode(id);
    } else {
      success = await nodeService.unregisterNode(id);
    }

    if (!success) {
      respondNodeNotFound(res);
      return;
    }

    res.json({
      success: true,
      message: 'Node unregistered successfully'
    });
  } catch (error: any) {
    logger.error('❌ Failed to delete node:', error);
    res.status(500).json({
      error: 'Failed to delete node',
      message: error.message
    });
  }
}

/**
 * 获取节点统计信息
 * GET /api/admin/nodes/:id/stats
 */
export async function getNodeStats(req: Request, res: Response): Promise<void> {
  try {
    if (!nodeManager) {
      res.status(503).json({
        error: 'Node manager not initialized'
      });
      return;
    }

    const { nodeId } = req.params as { nodeId: string };
    const id = nodeId;
    const node = nodeManager.getNode(id);
    if (!node) {
      respondNodeNotFound(res);
      return;
    }

    const stats = nodeManager.getNodeStats(id);
    const pendingTasks = nodeManager.getPendingTasks(id);

    res.json({
      success: true,
      stats: {
        ...stats,
        status: node.status,
        lastHeartbeat: node.lastHeartbeat,
        lastSeen: node.lastSeen
      },
      pendingTasks
    });
  } catch (error: any) {
    logger.error('❌ Failed to get node stats:', error);
    res.status(500).json({
      error: 'Failed to get node stats',
      message: error.message
    });
  }
}

/**
 * 获取节点待处理任务
 * GET /api/admin/nodes/:id/tasks
 */
export async function getNodeTasks(req: Request, res: Response): Promise<void> {
  try {
    if (!nodeManager) {
      res.status(503).json({
        error: 'Node manager not initialized'
      });
      return;
    }

    const { nodeId } = req.params as { nodeId: string };
    const id = nodeId;
    const node = nodeManager.getNode(id);
    if (!node) {
      respondNodeNotFound(res);
      return;
    }

    const tasks = nodeManager.getPendingTasks(id);
    res.json({
      success: true,
      tasks
    });
  } catch (error: any) {
    logger.error('❌ Failed to get node tasks:', error);
    res.status(500).json({
      error: 'Failed to get node tasks',
      message: error.message
    });
  }
}

/**
 * 手动向节点派发任务
 * POST /api/admin/nodes/:id/tasks
 */
export async function dispatchTaskToNode(req: Request, res: Response): Promise<void> {
  if (!nodeManager) {
    res.status(503).json({
      error: 'Node manager not initialized'
    });
    return;
  }

  const { nodeId } = req.params as { nodeId: string };
  const { toolName, capability, toolArgs, timeout, metadata, taskId, waitForResult } = req.body || {};

  if (!toolName || typeof toolName !== 'string' || toolName.trim().length === 0) {
    res.status(400).json({
      error: 'toolName is required'
    });
    return;
  }

  const normalizedArgs =
    toolArgs && typeof toolArgs === 'object' && !Array.isArray(toolArgs) ? toolArgs : {};

  const shouldWait =
    waitForResult === true ||
    (typeof waitForResult === 'string' && waitForResult.toLowerCase() === 'true');

  let assignment;
  try {
    assignment = nodeManager.dispatchTaskToNode(nodeId, {
      taskId,
      toolName: toolName.trim(),
      capability: typeof capability === 'string' ? capability.trim() : undefined,
      toolArgs: normalizedArgs,
      timeout: typeof timeout === 'number' ? timeout : undefined,
      metadata: metadata && typeof metadata === 'object' ? metadata : undefined
    });
  } catch (error: any) {
    logger.error('❌ Failed to dispatch task to node:', {
      nodeId,
      toolName,
      error: error.message
    });
    res.status(400).json({
      error: 'Failed to dispatch task',
      message: error.message
    });
    return;
  }

  if (shouldWait) {
    try {
      const result = await assignment.result;
      res.json({
        success: true,
        nodeId,
        taskId: assignment.taskId,
        result
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'Task execution failed',
        taskId: assignment.taskId,
        message: error.message
      });
    }
    return;
  }

  assignment.result
    .then((result) => {
      logger.info('[ManualTask] Task completed', {
        nodeId,
        taskId: assignment.taskId,
        success: true
      });
      logger.debug('[ManualTask] Result:', {
        nodeId,
        taskId: assignment.taskId,
        result
      });
    })
    .catch((error: any) => {
      logger.error('[ManualTask] Task failed', {
        nodeId,
        taskId: assignment.taskId,
        error: error.message
      });
    });

  res.json({
    success: true,
    nodeId,
    taskId: assignment.taskId,
    message: 'Task dispatched; result will be logged asynchronously'
  });
}

