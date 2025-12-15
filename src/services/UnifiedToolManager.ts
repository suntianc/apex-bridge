/**
 * Unified Tool Manager
 * 统一工具管理器
 * 整合 Skills 和 MCP 工具，提供统一的工具发现和调用接口
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import type { SkillTool } from '../types/tool-system';
import type { MCPTool } from '../types/mcp';
import type { VectorToolResult, VectorSearchResult } from '../types/vector';

export interface UnifiedTool {
  id: string;
  name: string;
  type: 'skill' | 'mcp';
  source: string; // skill name or mcp server id
  description: string;
  category?: string;
  tags?: string[];
  parameters?: any;
  embedding?: number[];
  metadata?: {
    version?: string;
    author?: string;
    [key: string]: any;
  };
}

export interface UnifiedToolResult {
  success: boolean;
  content: Array<{
    type: 'text' | 'image' | 'resource' | 'image_data';
    text?: string;
    mimeType?: string;
    data?: string | number[];
    [key: string]: any;
  }>;
  duration: number;
  error?: {
    code: string;
    message: string;
  };
  metadata?: {
    toolType: 'skill' | 'mcp';
    source: string;
    toolName: string;
  };
}

export interface ToolSearchOptions {
  query?: string;
  type?: 'skill' | 'mcp' | 'all';
  category?: string;
  tags?: string[];
  limit?: number;
  minScore?: number;
}

export interface ToolSearchResult extends VectorSearchResult {
  tool: UnifiedTool;
  score: number;
  reason?: string;
}

export class UnifiedToolManager extends EventEmitter {
  private skillManager: any; // SkillManager 实例
  private mcpIntegration: any; // MCPIntegrationService 实例
  private vectorDBService: any; // VectorDBService 实例
  private toolCache: Map<string, UnifiedTool> = new Map();
  private cacheTimestamp: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

  constructor(
    skillManager: any,
    mcpIntegration: any,
    vectorDBService: any
  ) {
    super();
    this.skillManager = skillManager;
    this.mcpIntegration = mcpIntegration;
    this.vectorDBService = vectorDBService;

    // 监听事件
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // 监听 Skill 变化
    this.skillManager?.on('skill-installed', (skill: SkillTool) => {
      this.addSkillToCache(skill);
      this.refreshToolIndex();
    });

    this.skillManager?.on('skill-uninstalled', (skillName: string) => {
      this.removeSkillFromCache(skillName);
      this.refreshToolIndex();
    });

    // 监听 MCP 工具变化
    this.mcpIntegration?.on('tools-changed', (data: { serverId: string; tools: MCPTool[] }) => {
      this.addMCPToolsToCache(data.serverId, data.tools);
      this.refreshToolIndex();
    });

    // 监听 MCP 服务器状态变化
    this.mcpIntegration?.on('server-status-changed', (data: { serverId: string; status: any }) => {
      if (data.status.phase !== 'running') {
        this.removeMCPServerFromCache(data.serverId);
        this.refreshToolIndex();
      }
    });
  }

  /**
   * 初始化统一工具管理器
   */
  async initialize(): Promise<void> {
    try {
      logger.info('[UnifiedTool] Initializing...');

      // 加载所有工具到缓存
      await this.loadAllTools();

      // 刷新向量索引
      await this.refreshToolIndex();

      logger.info(`[UnifiedTool] Initialized with ${this.toolCache.size} tools`);
    } catch (error: any) {
      logger.error('[UnifiedTool] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * 加载所有工具到缓存
   */
  private async loadAllTools(): Promise<void> {
    // 加载 Skills
    try {
      const skills = this.skillManager?.getSkills?.() || [];
      logger.debug(`[UnifiedTool] Loading ${skills.length} skills`);

      for (const skill of skills) {
        this.addSkillToCache(skill);
      }
    } catch (error) {
      logger.error('[UnifiedTool] Failed to load skills:', error);
    }

    // 加载 MCP 工具
    try {
      const mcpToolsList = this.mcpIntegration?.getAllTools?.() || [];
      logger.debug(`[UnifiedTool] Loading MCP tools from ${mcpToolsList.length} servers`);

      for (const { serverId, tools } of mcpToolsList) {
        this.addMCPToolsToCache(serverId, tools);
      }
    } catch (error) {
      logger.error('[UnifiedTool] Failed to load MCP tools:', error);
    }
  }

  /**
   * 将 Skill 添加到缓存
   */
  private addSkillToCache(skill: SkillTool): void {
    const tool: UnifiedTool = {
      id: `skill:${skill.name}`,
      name: skill.name,
      type: 'skill',
      source: skill.name,
      description: skill.description,
      category: skill.tags?.[0] || 'uncategorized',
      tags: skill.tags || [],
      parameters: skill.parameters,
      metadata: {
        version: skill.version,
        author: skill.author,
        level: skill.level
      }
    };

    this.toolCache.set(tool.id, tool);
    this.cacheTimestamp.set(tool.id, Date.now());

    logger.debug(`[UnifiedTool] Added skill to cache: ${skill.name}`);
  }

  /**
   * 从缓存中移除 Skill
   */
  private removeSkillFromCache(skillName: string): void {
    const id = `skill:${skillName}`;
    this.toolCache.delete(id);
    this.cacheTimestamp.delete(id);

    logger.debug(`[UnifiedTool] Removed skill from cache: ${skillName}`);
  }

  /**
   * 将 MCP 工具添加到缓存
   */
  private addMCPToolsToCache(serverId: string, tools: MCPTool[]): void {
    for (const tool of tools) {
      const unifiedTool: UnifiedTool = {
        id: `mcp:${serverId}:${tool.name}`,
        name: tool.name,
        type: 'mcp',
        source: serverId,
        description: tool.description,
        tags: [`mcp`, `server:${serverId}`],
        parameters: tool.inputSchema,
        metadata: {
          mcpServerId: serverId,
          mcpToolName: tool.name
        }
      };

      this.toolCache.set(unifiedTool.id, unifiedTool);
      this.cacheTimestamp.set(unifiedTool.id, Date.now());
    }

    logger.debug(`[UnifiedTool] Added ${tools.length} MCP tools from server ${serverId}`);
  }

  /**
   * 从缓存中移除 MCP 服务器
   */
  private removeMCPServerFromCache(serverId: string): void {
    const toRemove: string[] = [];

    for (const [id, tool] of this.toolCache.entries()) {
      if (tool.type === 'mcp' && tool.source === serverId) {
        toRemove.push(id);
      }
    }

    toRemove.forEach(id => {
      this.toolCache.delete(id);
      this.cacheTimestamp.delete(id);
    });

    logger.debug(`[UnifiedTool] Removed ${toRemove.length} MCP tools for server ${serverId}`);
  }

  /**
   * 搜索工具
   */
  async searchTools(options: ToolSearchOptions): Promise<ToolSearchResult[]> {
    try {
      const {
        query,
        type = 'all',
        category,
        tags,
        limit = 10,
        minScore = 0.3
      } = options;

      let results: ToolSearchResult[] = [];

      if (query) {
        // 向量搜索
        results = await this.vectorSearch(query, { type, limit, minScore });
      } else {
        // 列表搜索
        results = this.listSearch({ type, category, tags, limit });
      }

      // 按分数排序
      results.sort((a, b) => b.score - a.score);

      return results.slice(0, limit);
    } catch (error: any) {
      logger.error('[UnifiedTool] Tool search failed:', error);
      return [];
    }
  }

  /**
   * 向量搜索
   */
  private async vectorSearch(
    query: string,
    options: { type?: string; limit?: number; minScore?: number }
  ): Promise<ToolSearchResult[]> {
    try {
      const searchResult = await this.vectorDBService.searchTools(query, {
        limit: options.limit || 10,
        minScore: options.minScore || 0.3
      });

      return searchResult.map((result: VectorToolResult) => ({
        id: result.id,
        tool: result.tool as UnifiedTool,
        score: result.score,
        metadata: result.metadata
      }));
    } catch (error: any) {
      logger.error('[UnifiedTool] Vector search failed:', error);
      return [];
    }
  }

  /**
   * 列表搜索
   */
  private listSearch(options: {
    type?: string;
    category?: string;
    tags?: string[];
    limit?: number;
  }): ToolSearchResult[] {
    const { type, category, tags, limit = 10 } = options;

    let tools = Array.from(this.toolCache.values());

    // 类型过滤
    if (type !== 'all') {
      tools = tools.filter(t => t.type === type);
    }

    // 分类过滤
    if (category) {
      tools = tools.filter(t => t.category === category);
    }

    // 标签过滤
    if (tags && tags.length > 0) {
      tools = tools.filter(t =>
        tags.every(tag => t.tags?.includes(tag))
      );
    }

    // 转换为搜索结果
    return tools.slice(0, limit).map(tool => ({
      id: tool.id,
      tool,
      score: 1.0,
      reason: 'Direct match'
    }));
  }

  /**
   * 获取所有工具
   */
  getAllTools(type?: 'skill' | 'mcp'): UnifiedTool[] {
    let tools = Array.from(this.toolCache.values());

    if (type) {
      tools = tools.filter(t => t.type === type);
    }

    return tools;
  }

  /**
   * 根据 ID 获取工具
   */
  getToolById(id: string): UnifiedTool | undefined {
    return this.toolCache.get(id);
  }

  /**
   * 根据名称获取工具
   */
  getToolByName(name: string): UnifiedTool | undefined {
    // 先尝试精确匹配
    for (const tool of this.toolCache.values()) {
      if (tool.name === name) {
        return tool;
      }
    }

    // 如果没找到，尝试模糊匹配
    for (const tool of this.toolCache.values()) {
      if (tool.name.toLowerCase().includes(name.toLowerCase())) {
        return tool;
      }
    }

    return undefined;
  }

  /**
   * 调用工具
   */
  async callTool(
    toolNameOrId: string,
    arguments_: Record<string, any>,
    options?: { toolId?: string }
  ): Promise<UnifiedToolResult> {
    const startTime = Date.now();

    try {
      // 解析工具
      const tool = options?.toolId
        ? this.getToolById(options.toolId)
        : this.getToolByName(toolNameOrId);

      if (!tool) {
        throw new Error(`Tool not found: ${toolNameOrId}`);
      }

      let result: UnifiedToolResult;

      if (tool.type === 'skill') {
        // 调用 Skill
        result = await this.callSkill(tool, arguments_);
      } else {
        // 调用 MCP 工具
        result = await this.callMCPTool(tool, arguments_);
      }

      const duration = Date.now() - startTime;

      return {
        ...result,
        duration,
        metadata: {
          ...result.metadata,
          toolType: tool.type,
          source: tool.source,
          toolName: tool.name
        }
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      logger.error(`[UnifiedTool] Tool call failed:`, error);

      return {
        success: false,
        content: [],
        duration,
        error: {
          code: 'TOOL_CALL_ERROR',
          message: error.message || 'Unknown error'
        },
        metadata: {
          toolType: 'skill' as const,
          source: 'unknown',
          toolName: toolNameOrId
        }
      };
    }
  }

  /**
   * 调用 Skill
   */
  private async callSkill(tool: UnifiedTool, args: Record<string, any>): Promise<UnifiedToolResult> {
    try {
      const skillResult = await this.skillManager.executeSkill(tool.name, args);

      return {
        success: skillResult.success,
        content: [
          {
            type: 'text',
            text: skillResult.output || skillResult.error || ''
          }
        ],
        duration: skillResult.duration,
        metadata: {
          toolType: 'skill',
          source: tool.source,
          toolName: tool.name
        }
      };
    } catch (error: any) {
      return {
        success: false,
        content: [],
        duration: 0,
        error: {
          code: 'SKILL_EXECUTION_ERROR',
          message: error.message || 'Unknown error'
        }
      };
    }
  }

  /**
   * 调用 MCP 工具
   */
  private async callMCPTool(tool: UnifiedTool, args: Record<string, any>): Promise<UnifiedToolResult> {
    try {
      const mcpResult = await this.mcpIntegration.callTool({
        toolName: tool.metadata?.mcpToolName || tool.name,
        arguments: args,
        serverId: tool.source
      });

      return {
        success: mcpResult.success,
        content: mcpResult.content || [],
        duration: mcpResult.duration,
        metadata: {
          toolType: 'mcp',
          source: tool.source,
          toolName: tool.name
        }
      };
    } catch (error: any) {
      return {
        success: false,
        content: [],
        duration: 0,
        error: {
          code: 'MCP_EXECUTION_ERROR',
          message: error.message || 'Unknown error'
        }
      };
    }
  }

  /**
   * 刷新工具索引
   */
  async refreshToolIndex(): Promise<void> {
    try {
      logger.debug('[UnifiedTool] Refreshing tool index...');

      const tools = Array.from(this.toolCache.values());

      await this.vectorDBService.indexTools(tools);

      logger.info(`[UnifiedTool] Tool index refreshed: ${tools.length} tools indexed`);
    } catch (error: any) {
      logger.error('[UnifiedTool] Failed to refresh tool index:', error);
    }
  }

  /**
   * 获取统计信息
   */
  getStatistics() {
    const tools = Array.from(this.toolCache.values());

    const stats = {
      totalTools: tools.length,
      skillsCount: tools.filter(t => t.type === 'skill').length,
      mcpToolsCount: tools.filter(t => t.type === 'mcp').length,
      byCategory: {} as Record<string, number>,
      byTags: {} as Record<string, number>,
      cacheSize: this.toolCache.size,
      cacheTTL: this.CACHE_TTL
    };

    for (const tool of tools) {
      if (tool.category) {
        stats.byCategory[tool.category] = (stats.byCategory[tool.category] || 0) + 1;
      }

      for (const tag of tool.tags || []) {
        stats.byTags[tag] = (stats.byTags[tag] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.toolCache.clear();
    this.cacheTimestamp.clear();

    logger.info('[UnifiedTool] Cache cleared');
  }

  /**
   * 优雅关闭
   */
  async shutdown(): Promise<void> {
    logger.info('[UnifiedTool] Shutting down...');

    this.clearCache();

    logger.info('[UnifiedTool] Shut down complete');
  }
}
