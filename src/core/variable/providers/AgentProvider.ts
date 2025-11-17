/**
 * Agent Variable Provider
 * 
 * 提供Agent相关的变量
 
 */

import { IVariableProvider, VariableContext } from '../../../types/variable';
import { logger } from '../../../utils/logger';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

/**
 * AgentProvider配置
 */
export interface AgentProviderConfig {
  agentDirectory: string;
  enableCache?: boolean;
  cacheTTL?: number;
}

/**
 * Agent变量提供者
 * 
 * 从agent目录加载agent配置并提供变量解析
 */
export class AgentProvider implements IVariableProvider {
  readonly name = 'AgentProvider';
  readonly namespace = 'agent';

  private agentDirectory: string;
  private agentCache: Map<string, { data: any; timestamp: number }>;
  private enableCache: boolean;
  private cacheTTL: number;

  constructor(config: AgentProviderConfig) {
    this.agentDirectory = config.agentDirectory;
    this.enableCache = config.enableCache ?? true;
    this.cacheTTL = config.cacheTTL ?? 60000; // 默认1分钟
    this.agentCache = new Map();
  }

  async resolve(key: string, context?: VariableContext): Promise<string | null> {
    // Agent变量格式：{{agent:AgentName}} 或 {{AgentName}}（如果namespace匹配）
    const agentName = this.extractAgentName(key);
    if (!agentName) {
      return null;
    }

    try {
      const agentData = await this.loadAgent(agentName);
      if (agentData) {
        // 返回agent的JSON字符串表示
        return JSON.stringify(agentData, null, 2);
      }
    } catch (error) {
      logger.error(`[AgentProvider] Error loading agent '${agentName}':`, error);
    }

    return null;
  }

  getSupportedKeys(): string[] {
    // 返回所有可用的agent名称
    return this.listAgents();
  }

  /**
   * 提取agent名称
   */
  private extractAgentName(key: string): string | null {
    // 支持 {{agent:AgentName}} 或 {{AgentName}}（如果以agent:开头）
    if (key.startsWith('agent:')) {
      return key.substring(6);
    }
    // 也可以直接使用agent名称（如果文件存在）
    return key;
  }

  /**
   * 加载agent配置
   */
  private async loadAgent(agentName: string): Promise<any> {
    // 检查缓存
    if (this.enableCache) {
      const cached = this.agentCache.get(agentName);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.data;
      }
    }

    try {
      const agentPath = path.join(this.agentDirectory, agentName, 'agent.json');
      const content = await fs.readFile(agentPath, 'utf-8');
      const agentData = JSON.parse(content);

      // 保存到缓存
      if (this.enableCache) {
        this.agentCache.set(agentName, {
          data: agentData,
          timestamp: Date.now(),
        });
      }

      return agentData;
    } catch (error) {
      logger.debug(`[AgentProvider] Agent '${agentName}' not found or error loading`);
      return null;
    }
  }

  /**
   * 列出所有可用的agent
   */
  private listAgents(): string[] {
    try {
      // 同步读取目录（简化实现）
      const entries = fsSync.readdirSync(this.agentDirectory, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch (error) {
      logger.debug(`[AgentProvider] Error listing agents:`, error);
      return [];
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.agentCache.clear();
    logger.debug('[AgentProvider] Cache cleared');
  }
}

