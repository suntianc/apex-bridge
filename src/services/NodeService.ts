/**
 * NodeService - 节点管理服务
 * 管理分布式节点的注册、状态和配置
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';
import { PathService } from './PathService';
import { PersonalityConfig } from '../types/personality';
import { withLock } from '../utils/DistributedLock';
import { RaceDetector, createOperationId, createResourceId } from '../utils/RaceDetector';

// 使用PathService管理路径
const pathService = PathService.getInstance();

export type NodeType = 'worker' | 'companion' | 'custom' | 'hub';
export type NodeStatus = 'online' | 'offline' | 'busy' | 'unknown';

export interface NodeResourceInfo {
  cpu?: number;
  memory?: number;
  disk?: number;
  gpu?: number;
}

export interface NodeStats {
  totalTasks?: number;
  completedTasks?: number;
  failedTasks?: number;
  activeTasks?: number;
  averageResponseTime?: number;
  lastTaskAt?: number;
}

export interface NodeConfig {
  endpoint?: string;
  capabilities?: string[];
  metadata?: Record<string, any>;
  maxConcurrentTasks?: number;
  resources?: NodeResourceInfo;
}

export interface NodeInfo {
  id: string;
  name: string;
  type: NodeType;
  version?: string;
  status: NodeStatus;
  registeredAt: number;
  lastSeen?: number;
  lastHeartbeat?: number;
  capabilities?: string[];
  tools?: string[];
  boundPersonas?: string[];
  boundPersona?: string | null;
  personality?: PersonalityConfig;
  config?: NodeConfig;
  stats?: NodeStats;
}

export interface RegisterNodeInput {
  id?: string;
  name: string;
  type?: NodeType;
  version?: string;
  capabilities?: string[];
  tools?: string[];
  boundPersonas?: string[];
  boundPersona?: string | null;
  personality?: PersonalityConfig;
  config?: NodeConfig;
  status?: NodeStatus;
  stats?: NodeStats;
}

export class NodeService {
  private static instance: NodeService;
  private nodes: Map<string, NodeInfo> = new Map();
  private distributedChannelRef: any = null; // 引用DistributedServerChannel（可选）
  private raceDetector: RaceDetector;

  private constructor() {
    // 确保config目录存在
    pathService.ensureDir(pathService.getConfigDir());
    
    // 加载已注册的节点
    this.loadNodes();
    
    // 初始化竞态条件检测器
    this.raceDetector = RaceDetector.getInstance();
  }

  public static getInstance(): NodeService {
    if (!NodeService.instance) {
      NodeService.instance = new NodeService();
    }
    return NodeService.instance;
  }

  /**
   * 设置分布式通道引用（用于获取实时节点状态）
   */
  public setDistributedChannel(channel: any): void {
    this.distributedChannelRef = channel;
  }

  /**
   * 加载节点列表（同步版本，用于构造函数）
   */
  private loadNodes(): void {
    const nodesFilePath = pathService.getNodesFilePath();
    
    if (!fs.existsSync(nodesFilePath)) {
      this.saveNodes();
      return;
    }

    try {
      let fileContent = fs.readFileSync(nodesFilePath, 'utf-8');
      
      // 去除 BOM（字节顺序标记）
      if (fileContent.charCodeAt(0) === 0xFEFF) {
        fileContent = fileContent.slice(1);
      }
      
      // 去除前导和尾随空白字符
      fileContent = fileContent.trim();
      
      // 如果文件为空，创建空数组
      if (!fileContent) {
        logger.warn('⚠️ Nodes file is empty, initializing with empty array');
        this.saveNodes();
        return;
      }
      
      const nodesData = JSON.parse(fileContent) as NodeInfo[];
      
      // 验证数据是数组
      if (!Array.isArray(nodesData)) {
        throw new Error('Nodes data is not an array');
      }
      
      this.nodes.clear();
      nodesData.forEach(rawNode => {
        const normalized = this.normalizeNode(rawNode);
        this.nodes.set(normalized.id, normalized);
      });
      
      logger.debug(`✅ Loaded ${this.nodes.size} nodes from file`);
    } catch (error: any) {
      logger.error(`❌ Failed to load nodes from ${nodesFilePath}:`, error);
      
      // 尝试备份损坏的文件
      try {
        const backupPath = `${nodesFilePath}.backup.${Date.now()}`;
        if (fs.existsSync(nodesFilePath)) {
          fs.copyFileSync(nodesFilePath, backupPath);
          logger.warn(`⚠️ Backed up corrupted nodes file to: ${backupPath}`);
        }
      } catch (backupError) {
        logger.warn('⚠️ Failed to backup corrupted nodes file:', backupError);
      }
      
      // 创建新的空数组文件
      try {
        this.saveNodes();
        logger.info('✅ Created new empty nodes file');
      } catch (saveError) {
        logger.error('❌ Failed to create new nodes file:', saveError);
      }
      
      this.nodes.clear();
    }
  }

  /**
   * 异步加载节点列表（推荐使用）
   */
  private async loadNodesAsync(): Promise<void> {
    const nodesFilePath = pathService.getNodesFilePath();
    
    try {
      await fsPromises.access(nodesFilePath);
    } catch {
      // 文件不存在，创建空文件
      await this.saveNodesAsync();
      return;
    }

    try {
      let fileContent = await fsPromises.readFile(nodesFilePath, 'utf-8');
      
      // 去除 BOM（字节顺序标记）
      if (fileContent.charCodeAt(0) === 0xFEFF) {
        fileContent = fileContent.slice(1);
      }
      
      // 去除前导和尾随空白字符
      fileContent = fileContent.trim();
      
      // 如果文件为空，创建空数组
      if (!fileContent) {
        logger.warn('⚠️ Nodes file is empty, initializing with empty array');
        await this.saveNodesAsync();
        return;
      }
      
      const nodesData = JSON.parse(fileContent) as NodeInfo[];
      
      // 验证数据是数组
      if (!Array.isArray(nodesData)) {
        throw new Error('Nodes data is not an array');
      }
      
      this.nodes.clear();
      nodesData.forEach(rawNode => {
        const normalized = this.normalizeNode(rawNode);
        this.nodes.set(normalized.id, normalized);
      });
      
      logger.debug(`✅ Loaded ${this.nodes.size} nodes from file`);
    } catch (error: any) {
      logger.error(`❌ Failed to load nodes from ${nodesFilePath}:`, error);
      
      // 尝试备份损坏的文件
      try {
        const backupPath = `${nodesFilePath}.backup.${Date.now()}`;
        try {
          await fsPromises.access(nodesFilePath);
          await fsPromises.copyFile(nodesFilePath, backupPath);
          logger.warn(`⚠️ Backed up corrupted nodes file to: ${backupPath}`);
        } catch {
          // 文件不存在或无法访问，跳过备份
        }
      } catch (backupError) {
        logger.warn('⚠️ Failed to backup corrupted nodes file:', backupError);
      }
      
      // 创建新的空数组文件
      try {
        await this.saveNodesAsync();
        logger.info('✅ Created new empty nodes file');
      } catch (saveError) {
        logger.error('❌ Failed to create new nodes file:', saveError);
      }
      
      this.nodes.clear();
    }
  }

  /**
   * 保存节点列表（同步版本，保持向后兼容）
   */
  private saveNodes(): void {
    try {
      const nodesFilePath = pathService.getNodesFilePath();
      const nodesArray = Array.from(this.nodes.values());
      const nodesJson = JSON.stringify(nodesArray, null, 2);
      fs.writeFileSync(nodesFilePath, nodesJson, 'utf-8');
      logger.debug('✅ Nodes saved to file');
    } catch (error: any) {
      logger.error('❌ Failed to save nodes:', error);
    }
  }

  /**
   * 异步保存节点列表（推荐使用，不阻塞事件循环）
   */
  private async saveNodesAsync(): Promise<void> {
    try {
      const nodesFilePath = pathService.getNodesFilePath();
      const nodesArray = Array.from(this.nodes.values());
      const nodesJson = JSON.stringify(nodesArray, null, 2);
      await fsPromises.writeFile(nodesFilePath, nodesJson, 'utf-8');
      logger.debug('✅ Nodes saved to file');
    } catch (error: any) {
      logger.error('❌ Failed to save nodes:', error);
      throw error;
    }
  }

  /**
   * 获取所有节点（合并实时状态）
   */
  public getAllNodes(): NodeInfo[] {
    const nodes = Array.from(this.nodes.values()).map(node => this.cloneNodeInfo(node));
    
    // 如果有分布式通道引用，更新实时状态
    if (this.distributedChannelRef) {
      try {
        const realtimeNodes = this.distributedChannelRef.getNodes?.() || new Map();
        nodes.forEach(node => {
          const realtimeNode = realtimeNodes.get(node.id);
          if (realtimeNode) {
            node.status = realtimeNode.status === 'connected' ? 'online' : 'offline';
            node.lastSeen = realtimeNode.lastHeartbeat;
          } else if (node.status === 'online') {
            // 如果之前在线但现在不在实时列表中，标记为离线
            node.status = 'offline';
          }
        });
      } catch (error: any) {
        logger.warn('⚠️ Failed to get realtime node status:', error);
      }
    }
    
    return nodes;
  }

  /**
   * 获取节点详情
   */
  public getNode(id: string): NodeInfo | null {
    const node = this.nodes.get(id);
    if (!node) {
      return null;
    }

    // 更新实时状态
    if (this.distributedChannelRef) {
      try {
        const realtimeNodes = this.distributedChannelRef.getNodes?.() || new Map();
        const realtimeNode = realtimeNodes.get(id);
        if (realtimeNode) {
          node.status = realtimeNode.status === 'connected' ? 'online' : 'offline';
          node.lastSeen = realtimeNode.lastHeartbeat;
        }
      } catch (error: any) {
        logger.warn('⚠️ Failed to get realtime node status:', error);
      }
    }

    return this.cloneNodeInfo(node);
  }

  /**
   * 注册新节点（线程安全，使用分布式锁）
   */
  public async registerNode(nodeInfo: RegisterNodeInput): Promise<NodeInfo> {
    // 使用临时 ID 作为锁键（如果提供了 ID，使用它；否则生成一个）
    const tempId = nodeInfo.id?.trim() || `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const lockKey = `node:register:${tempId}`;
    const resourceId = createResourceId('node', tempId);
    const operationId = createOperationId('node-register');

    try {
      return await this.raceDetector.withOperation(resourceId, operationId, async () => {
        return await withLock(lockKey, async () => {
          const now = Date.now();
          let id = nodeInfo.id?.trim();
          let existing: NodeInfo | undefined;

          if (id) {
            existing = this.nodes.get(id);
          }

          if (!id) {
            // Node did not provide an ID; generate a new one that doesn't collide.
            do {
              id = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            } while (this.nodes.has(id));
          }

          const normalized = this.normalizeNode({
            id,
            name: nodeInfo.name,
            type: nodeInfo.type || existing?.type || 'custom',
            version: nodeInfo.version ?? existing?.version,
            status: nodeInfo.status || 'unknown',
            registeredAt: existing?.registeredAt ?? now,
            lastSeen: now,
            lastHeartbeat: now,
            capabilities: nodeInfo.capabilities ?? existing?.capabilities,
            tools: nodeInfo.tools ?? existing?.tools,
            boundPersonas: nodeInfo.boundPersonas ?? existing?.boundPersonas,
            boundPersona: nodeInfo.boundPersona ?? existing?.boundPersona,
            personality: nodeInfo.personality ?? existing?.personality,
            config: this.mergeConfig(existing?.config, nodeInfo.config),
            stats: nodeInfo.stats ?? existing?.stats
          });

          this.nodes.set(id, normalized);
          // 异步保存，不阻塞当前操作
          this.saveNodesAsync().catch(err => {
            logger.warn('⚠️ Failed to save nodes asynchronously:', err);
            // 如果异步保存失败，回退到同步保存
            this.saveNodes();
          });

          if (existing) {
            logger.info(`✅ Node re-registered with existing id: ${id} (${normalized.name})`);
          } else {
            logger.info(`✅ Node registered: ${id} (${normalized.name})`);
          }
          return this.cloneNodeInfo(normalized);
        }, {
          timeout: 5000,
          ttl: 10000
        });
      });
    } catch (error: any) {
      logger.error(`❌ Failed to register node ${nodeInfo.name}:`, error);
      throw error;
    }
  }

  /**
   * 更新节点信息（线程安全，使用分布式锁）
   */
  public async updateNode(id: string, updates: Partial<NodeInfo>): Promise<NodeInfo | null> {
    const lockKey = `node:update:${id}`;
    const resourceId = createResourceId('node', id);
    const operationId = createOperationId('node-update');

    try {
      return await this.raceDetector.withOperation(resourceId, operationId, async () => {
        return await withLock(lockKey, async () => {
        const node = this.nodes.get(id);
        if (!node) {
          return null;
        }

        const mergedConfig = this.mergeConfig(node.config, updates.config);
        const mergedStats = this.mergeStats(node.stats, updates.stats);

        const updatedNode: NodeInfo = {
          ...node,
          ...updates,
          config: mergedConfig,
          stats: mergedStats,
          id: node.id, // 不允许修改ID
          registeredAt: node.registeredAt // 不允许修改注册时间
        };

        const personaBinding = this.normalizePersonaBinding(
          updatedNode.type,
          updates.boundPersona ?? updatedNode.boundPersona,
          updates.boundPersonas ?? updatedNode.boundPersonas
        );

        if (updatedNode.type === 'hub') {
          updatedNode.boundPersonas = personaBinding.boundPersonas ?? [];
          delete updatedNode.boundPersona;
        } else {
          const persona = personaBinding.boundPersona ?? null;
          updatedNode.boundPersona = persona || undefined;
          delete updatedNode.boundPersonas;
        }

        this.nodes.set(id, updatedNode);
        // 异步保存，不阻塞当前操作
        this.saveNodesAsync().catch(err => {
          logger.warn('⚠️ Failed to save nodes asynchronously:', err);
          // 如果异步保存失败，回退到同步保存
          this.saveNodes();
        });
        
        logger.info(`✅ Node updated: ${id}`);
        return this.cloneNodeInfo(updatedNode);
      }, {
        timeout: 5000,
        ttl: 10000
      });
    });
    } catch (error: any) {
      logger.error(`❌ Failed to update node ${id}:`, error);
      throw error;
    }
  }

  /**
   * 注销节点（线程安全，使用分布式锁）
   */
  public async unregisterNode(id: string): Promise<boolean> {
    const lockKey = `node:unregister:${id}`;
    const resourceId = createResourceId('node', id);
    const operationId = createOperationId('node-unregister');

    try {
      return await this.raceDetector.withOperation(resourceId, operationId, async () => {
        return await withLock(lockKey, async () => {
          if (!this.nodes.has(id)) {
            return false;
          }

          this.nodes.delete(id);
          // 异步保存，不阻塞当前操作
          this.saveNodesAsync().catch(err => {
            logger.warn('⚠️ Failed to save nodes asynchronously:', err);
            // 如果异步保存失败，回退到同步保存
            this.saveNodes();
          });
          
          logger.info(`✅ Node unregistered: ${id}`);
          return true;
        }, {
          timeout: 5000,
          ttl: 10000
        });
      });
    } catch (error: any) {
      logger.error(`❌ Failed to unregister node ${id}:`, error);
      throw error;
    }
  }

  /**
   * 更新节点运行时信息（不触发持久化）
   */
  public updateNodeRuntime(id: string, updates: Partial<NodeInfo>): NodeInfo | null {
    const node = this.nodes.get(id);
    if (!node) {
      return null;
    }

    const mergedConfig = this.mergeConfig(node.config, updates.config);
    const mergedStats = this.mergeStats(node.stats, updates.stats);

    const updatedNode: NodeInfo = {
      ...node,
      ...updates,
      config: mergedConfig,
      stats: mergedStats,
      id: node.id,
      registeredAt: node.registeredAt
    };

    this.nodes.set(id, updatedNode);
    return this.cloneNodeInfo(updatedNode);
  }

  private mergeConfig(base?: NodeConfig, updates?: NodeConfig): NodeConfig | undefined {
    if (!base && !updates) {
      return undefined;
    }

    const resources = this.mergeResources(base?.resources, updates?.resources);
    const metadata = base?.metadata || updates?.metadata
      ? { ...(base?.metadata || {}), ...(updates?.metadata || {}) }
      : undefined;

    return {
      endpoint: updates?.endpoint ?? base?.endpoint,
      capabilities: updates?.capabilities ?? base?.capabilities,
      metadata,
      maxConcurrentTasks: updates?.maxConcurrentTasks ?? base?.maxConcurrentTasks,
      resources
    };
  }

  private mergeResources(base?: NodeResourceInfo, updates?: NodeResourceInfo): NodeResourceInfo | undefined {
    if (!base && !updates) {
      return undefined;
    }

    return {
      cpu: updates?.cpu ?? base?.cpu,
      memory: updates?.memory ?? base?.memory,
      disk: updates?.disk ?? base?.disk,
      gpu: updates?.gpu ?? base?.gpu
    };
  }

  private mergeStats(base?: NodeStats, updates?: NodeStats): NodeStats | undefined {
    if (!base && !updates) {
      return undefined;
    }

    const merged = {
      ...this.ensureStats(base),
      ...updates
    };

    return this.ensureStats(merged);
  }

  private ensureStats(stats?: NodeStats): NodeStats {
    return {
      totalTasks: stats?.totalTasks ?? 0,
      completedTasks: stats?.completedTasks ?? 0,
      failedTasks: stats?.failedTasks ?? 0,
      activeTasks: stats?.activeTasks ?? 0,
      averageResponseTime: stats?.averageResponseTime ?? 0,
      lastTaskAt: stats?.lastTaskAt
    };
  }

  private normalizePersonaBinding(
    type: NodeType,
    boundPersona?: string | null,
    boundPersonas?: string[]
  ): { boundPersona?: string | null; boundPersonas?: string[] } {
    if (type === 'hub') {
      const collected = [
        ...(boundPersonas ?? []),
        ...(boundPersona ? [boundPersona] : [])
      ]
        .map((persona) => (typeof persona === 'string' ? persona.trim() : ''))
        .filter((persona) => persona.length > 0);
      const unique = Array.from(new Set(collected));
      return unique.length > 0 ? { boundPersonas: unique } : { boundPersonas: [] };
    }

    const persona = (boundPersona ?? boundPersonas?.[0] ?? '')
      .toString()
      .trim();
    return persona.length > 0 ? { boundPersona: persona } : {};
  }

  private cloneNodeInfo(node: NodeInfo): NodeInfo {
    return {
      ...node,
      capabilities: node.capabilities ? [...node.capabilities] : undefined,
      tools: node.tools ? [...node.tools] : undefined,
      boundPersonas: node.boundPersonas ? [...node.boundPersonas] : node.boundPersonas,
      boundPersona: node.boundPersona ?? undefined,
      config: node.config
        ? {
            ...node.config,
            capabilities: node.config.capabilities ? [...node.config.capabilities] : undefined,
            metadata: node.config.metadata ? { ...node.config.metadata } : undefined,
            resources: node.config.resources ? { ...node.config.resources } : undefined
          }
        : undefined,
      stats: node.stats ? { ...node.stats } : undefined,
      personality: node.personality ? { ...node.personality } : undefined
    };
  }

  private normalizeNode(rawNode: Partial<NodeInfo>): NodeInfo {
    const id = rawNode.id || `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const name = rawNode.name || `Node-${id.substring(0, 6)}`;
    const type = rawNode.type || 'custom';
    const status = rawNode.status || 'unknown';
    const registeredAt = rawNode.registeredAt || Date.now();
    const config = this.mergeConfig(undefined, rawNode.config);
    const stats = this.ensureStats(rawNode.stats);
    const personaBinding = this.normalizePersonaBinding(type, rawNode.boundPersona, rawNode.boundPersonas);

    const capabilities = rawNode.capabilities ?? config?.capabilities;

    return {
      id,
      name,
      type,
      version: rawNode.version,
      status,
      registeredAt,
      lastSeen: rawNode.lastSeen,
      lastHeartbeat: rawNode.lastHeartbeat,
      capabilities,
      tools: rawNode.tools,
      boundPersonas: personaBinding.boundPersonas,
      boundPersona: personaBinding.boundPersona,
      personality: rawNode.personality,
      config,
      stats
    };
  }
}

