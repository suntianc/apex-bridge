/**
 * AceCapabilityManager - ACE能力管理器
 * 映射到L3（Agent Model Layer）- 自我认知层
 *
 * 核心职责：
 * 1. 动态维护技能清单（与SkillManager集成）
 * 2. 自动标记故障技能
 * 3. 技能能力边界管理
 * 4. 与ToolRetrievalService（LanceDB）深度集成
 * 5. 集成ReActStrategy的动态注销机制
 *
 * 内存管理改进：
 * - 使用LRU缓存限制技能状态Map大小
 * - 访问时间追踪和自动淘汰
 * - 定期清理不活跃技能
 */

import { SkillTool } from '../types/tool-system';
import { AceIntegrator } from './AceIntegrator';
import { SkillManager } from './SkillManager';
import { ToolRetrievalService } from './ToolRetrievalService';
import type { AceEthicsGuard } from './AceEthicsGuard';
import { logger } from '../utils/logger';
import { LRUMap } from '../utils/cache';

export interface CapabilityStatus {
  skillName: string;
  status: 'active' | 'faulty' | 'inactive';
  lastUsed: number;
  failureCount: number;
  lastError?: string;
  capabilities: string[];
  tags: string[];
  version: string;
}

export interface SkillCapabilityMetrics {
  totalSkills: number;
  activeSkills: number;
  faultySkills: number;
  inactiveSkills: number;
  mostUsedSkills: Array<{ name: string; usageCount: number }>;
  failureRateBySkill: Array<{ name: string; failureCount: number }>;
}

/**
 * ACE能力管理器（L3自我认知层）
 * 深度整合项目现有的技能系统和向量检索
 */
export class AceCapabilityManager {
  // ========== 配置常量 ==========
  private static readonly MAX_SKILL_STATES = 500;       // 最大技能状态数
  private static readonly MAX_USAGE_COUNTERS = 500;     // 最大使用计数器数
  private static readonly MAX_FAILURE_THRESHOLD = 3;    // 失败阈值
  private static readonly INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5分钟不活跃超时
  private static readonly CLEANUP_INTERVAL_MS = 10 * 60 * 1000;  // 10分钟清理一次

  /**
   * 技能状态Map - 使用LRU缓存防止内存泄漏
   */
  private skillStatuses: LRUMap<string, CapabilityStatus> = new LRUMap(
    AceCapabilityManager.MAX_SKILL_STATES
  );

  /**
   * 技能使用计数器 - 使用LRU缓存
   */
  private skillUsageCounters: LRUMap<string, number> = new LRUMap(
    AceCapabilityManager.MAX_USAGE_COUNTERS
  );

  /**
   * 定期清理定时器
   */
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private aceIntegrator: AceIntegrator,
    private skillManager: SkillManager,
    private toolRetrievalService: ToolRetrievalService
  ) {
    // 启动定期清理
    this.startPeriodicCleanup();

    logger.info('[AceCapabilityManager] Initialized with LRU cache for skill states');
  }

  /**
   * 启动定期清理任务
   */
  private startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSkills();
    }, AceCapabilityManager.CLEANUP_INTERVAL_MS);

    // 确保不阻止进程退出
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * 销毁服务，清理资源
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.skillStatuses.clear();
    this.skillUsageCounters.clear();

    logger.info('[AceCapabilityManager] Destroyed and cleaned up all resources');
  }

  /**
   * 技能注册时更新L3（与SkillManager集成）
   * 当新技能被安装时，自动更新到L3的自我认知模型
   */
  async registerSkill(skill: SkillTool): Promise<void> {
    try {
      // 🆕 L3能力决策前，先经过L1伦理审查
      const ethicsGuard = this.getEthicsGuard();
      if (ethicsGuard) {
        const reviewResult = await ethicsGuard.reviewCapability({
          name: skill.name,
          description: skill.description,
          type: skill.type
        });

        if (!reviewResult.approved) {
          logger.warn(`[AceCapabilityManager] L1伦理审查未通过，阻止技能注册: ${skill.name}`);

          // 向L1层报告阻止
          await this.aceIntegrator.sendToLayer('ASPIRATIONAL', {
            type: 'CAPABILITY_REJECTED',
            content: `技能注册被拒绝: ${skill.name}`,
            metadata: {
              skillName: skill.name,
              reason: reviewResult.reason,
              suggestions: reviewResult.suggestions,
              timestamp: Date.now()
            }
          });

          return; // 阻止注册
        }

        logger.info(`[AceCapabilityManager] L1伦理审查通过，允许技能注册: ${skill.name}`);
      }

      // 更新L3的自我认知模型
      await this.aceIntegrator.sendToLayer('AGENT_MODEL', {
        type: 'CAPABILITY_UPDATE',
        content: `New skill registered: ${skill.name}`,
        metadata: {
          skillName: skill.name,
          skillType: skill.type,
          capabilities: skill.description,
          tags: skill.tags,
          version: skill.version,
          action: 'registered',
          timestamp: Date.now()
        }
      });

      // 更新向量检索索引（使用LanceDB）
      await this.toolRetrievalService.indexSkill({
        name: skill.name,
        description: skill.description,
        tags: skill.tags || [],
        path: skill.path,
        version: skill.version,
        metadata: {
          parameters: skill.parameters,
          author: skill.author,
          category: 'skill',
          capabilityLevel: skill.level || 1
        }
      });

      // 初始化技能状态
      this.skillStatuses.set(skill.name, {
        skillName: skill.name,
        status: 'active',
        lastUsed: 0,
        failureCount: 0,
        capabilities: [skill.description],
        tags: skill.tags || [],
        version: skill.version
      });

      // 初始化使用计数器
      this.skillUsageCounters.set(skill.name, 0);

      logger.info(`[AceCapabilityManager] Skill registered and indexed: ${skill.name}`);
    } catch (error: any) {
      logger.error(`[AceCapabilityManager] Failed to register skill ${skill.name}:`, error);
      throw error;
    }
  }

  /**
   * 技能失败时标记故障（与ReActStrategy动态注销机制集成）
   * 当技能执行失败时，自动标记为故障状态，并触发注销流程
   */
  async markSkillAsFaulty(skillName: string, error: string): Promise<void> {
    try {
      const status = this.skillStatuses.get(skillName);
      if (!status) {
        logger.warn(`[AceCapabilityManager] Skill not found in capability registry: ${skillName}`);
        return;
      }

      // 更新失败计数
      status.failureCount++;
      status.lastError = error;
      status.lastUsed = Date.now();

      // 检查是否超过失败阈值
      if (status.failureCount >= AceCapabilityManager.MAX_FAILURE_THRESHOLD) {
        status.status = 'faulty';

        // 向L3报告故障
        await this.aceIntegrator.sendToLayer('AGENT_MODEL', {
          type: 'CAPABILITY_UPDATE',
          content: `Skill ${skillName} marked as faulty after ${status.failureCount} failures`,
          metadata: {
            skillName,
            status: 'faulty',
            failureCount: status.failureCount,
            error,
            timestamp: Date.now(),
            action: 'marked_faulty'
          }
        });

        logger.warn(`[AceCapabilityManager] Skill marked as faulty: ${skillName} (failures: ${status.failureCount})`);

        // 触发自动注销机制（与ReActStrategy集成）
        // ReActStrategy会在5分钟超时后自动清理此技能
        await this.initiateSkillCleanup(skillName);
      } else {
        // 仍在重试范围内，记录警告
        await this.aceIntegrator.sendToLayer('AGENT_MODEL', {
          type: 'CAPABILITY_UPDATE',
          content: `Skill ${skillName} failed (attempt ${status.failureCount}/${AceCapabilityManager.MAX_FAILURE_THRESHOLD})`,
          metadata: {
            skillName,
            failureCount: status.failureCount,
            error,
            timestamp: Date.now(),
            action: 'failed'
          }
        });

        logger.debug(`[AceCapabilityManager] Skill failure recorded: ${skillName} (${status.failureCount}/${AceCapabilityManager.MAX_FAILURE_THRESHOLD})`);
      }
    } catch (error: any) {
      logger.error(`[AceCapabilityManager] Failed to mark skill as faulty: ${skillName}`, error);
    }
  }

  /**
   * L3查询：当前可用技能列表
   * 返回所有状态为active的技能，供L4/L5层决策使用
   */
  async getAvailableCapabilities(): Promise<string[]> {
    try {
      // 从SkillManager获取最新技能列表
      const skillsResult = await this.skillManager.listSkills({ limit: 1000 });
      const activeSkills = skillsResult.skills
        .filter(skill => {
          const status = this.skillStatuses.get(skill.name);
          return status && status.status === 'active';
        })
        .map(skill => skill.name);

      logger.debug(`[AceCapabilityManager] Available capabilities: ${activeSkills.length} active skills`);

      return activeSkills;
    } catch (error: any) {
      logger.error('[AceCapabilityManager] Failed to get available capabilities:', error);
      return [];
    }
  }

  /**
   * L3动态技能追踪（与ReActStrategy的自动注销机制集成）
   * 当技能被访问/使用时，更新其活动状态和时间戳
   */
  async updateSkillActivity(skillName: string): Promise<void> {
    try {
      const status = this.skillStatuses.get(skillName);
      if (!status) {
        logger.warn(`[AceCapabilityManager] Skill not found in capability registry: ${skillName}`);
        return;
      }

      // 更新活动状态
      status.lastUsed = Date.now();
      if (status.status === 'inactive') {
        status.status = 'active';
      }

      // 更新使用计数器
      const currentCount = this.skillUsageCounters.get(skillName) || 0;
      this.skillUsageCounters.set(skillName, currentCount + 1);

      // 向L3报告活动更新
      await this.aceIntegrator.sendToLayer('AGENT_MODEL', {
        type: 'ACTIVITY_UPDATE',
        content: `Skill ${skillName} accessed`,
        metadata: {
          skillName,
          timestamp: Date.now(),
          status: 'active',
          usageCount: currentCount + 1,
          action: 'accessed'
        }
      });

      logger.debug(`[AceCapabilityManager] Skill activity updated: ${skillName}`);
    } catch (error: any) {
      logger.error(`[AceCapabilityManager] Failed to update skill activity: ${skillName}`, error);
    }
  }

  /**
   * 清理不活跃技能（与ReActStrategy自动注销机制集成）
   * 检查并标记长时间未使用的技能为inactive状态
   * 使用LRU缓存自动淘汰最久未使用的技能
   */
  async cleanupInactiveSkills(): Promise<void> {
    try {
      const now = Date.now();
      const inactiveSkills: string[] = [];
      const faultySkillsToRemove: string[] = [];

      for (const [skillName, status] of this.skillStatuses.entries()) {
        // 检查是否长时间未使用
        if (status.status === 'active' && (now - status.lastUsed) > AceCapabilityManager.INACTIVITY_TIMEOUT_MS) {
          status.status = 'inactive';
          inactiveSkills.push(skillName);

          // 向L3报告不活跃状态
          await this.aceIntegrator.sendToLayer('AGENT_MODEL', {
            type: 'CAPABILITY_UPDATE',
            content: `Skill ${skillName} marked as inactive due to inactivity`,
            metadata: {
              skillName,
              status: 'inactive',
              lastUsed: status.lastUsed,
              inactiveFor: now - status.lastUsed,
              timestamp: now,
              action: 'marked_inactive'
            }
          });
        }

        // 清理长时间处于faulty状态的技能（超过30分钟）
        if (status.status === 'faulty' && (now - status.lastUsed) > 30 * 60 * 1000) {
          faultySkillsToRemove.push(skillName);
        }
      }

      // 从状态Map中移除长时间faulty的技能
      for (const skillName of faultySkillsToRemove) {
        this.skillStatuses.delete(skillName);
        this.skillUsageCounters.delete(skillName);
        logger.debug(`[AceCapabilityManager] Removed faulty skill from cache: ${skillName}`);
      }

      if (inactiveSkills.length > 0) {
        logger.info(`[AceCapabilityManager] Marked ${inactiveSkills.length} skills as inactive: ${inactiveSkills.join(', ')}`);
      }

      if (faultySkillsToRemove.length > 0) {
        logger.info(`[AceCapabilityManager] Removed ${faultySkillsToRemove.length} faulty skills from cache`);
      }
    } catch (error: any) {
      logger.error('[AceCapabilityManager] Failed to cleanup inactive skills:', error);
    }
  }

  /**
   * 获取技能能力边界
   * 返回技能的详细信息，包括参数、标签、版本等
   */
  async getSkillCapabilityBoundary(skillName: string): Promise<CapabilityStatus | null> {
    try {
      const status = this.skillStatuses.get(skillName);
      if (!status) {
        logger.warn(`[AceCapabilityManager] Skill not found: ${skillName}`);
        return null;
      }

      return status;
    } catch (error: any) {
      logger.error(`[AceCapabilityManager] Failed to get skill boundary: ${skillName}`, error);
      return null;
    }
  }

  /**
   * 获取所有技能的能力状态
   * 用于监控和调试
   */
  getAllSkillStatuses(): CapabilityStatus[] {
    return Array.from(this.skillStatuses.values());
  }

  /**
   * 获取技能能力指标
   * 统计各种状态技能的数量和性能指标
   */
  getCapabilityMetrics(): SkillCapabilityMetrics {
    const statuses = Array.from(this.skillStatuses.values());

    const metrics: SkillCapabilityMetrics = {
      totalSkills: statuses.length,
      activeSkills: 0,
      faultySkills: 0,
      inactiveSkills: 0,
      mostUsedSkills: [],
      failureRateBySkill: []
    };

    // 统计各状态数量
    for (const status of statuses) {
      switch (status.status) {
        case 'active':
          metrics.activeSkills++;
          break;
        case 'faulty':
          metrics.faultySkills++;
          break;
        case 'inactive':
          metrics.inactiveSkills++;
          break;
      }
    }

    // 统计使用频率
    const usageArray = Array.from(this.skillUsageCounters.entries())
      .map(([name, count]) => ({ name, usageCount: count }))
      .sort((a, b) => b.usageCount - a.usageCount);

    metrics.mostUsedSkills = usageArray.slice(0, 10);

    // 统计失败率
    const failureArray = statuses
      .filter(s => s.failureCount > 0)
      .map(s => ({ name: s.skillName, failureCount: s.failureCount }))
      .sort((a, b) => b.failureCount - a.failureCount);

    metrics.failureRateBySkill = failureArray;

    return metrics;
  }

  /**
   * 重置技能状态
   * 用于测试或特殊情况
   */
  async resetSkillStatus(skillName: string): Promise<void> {
    try {
      const status = this.skillStatuses.get(skillName);
      if (status) {
        status.status = 'active';
        status.failureCount = 0;
        status.lastError = undefined;

        await this.aceIntegrator.sendToLayer('AGENT_MODEL', {
          type: 'CAPABILITY_UPDATE',
          content: `Skill ${skillName} status reset`,
          metadata: {
            skillName,
            action: 'reset',
            timestamp: Date.now()
          }
        });

        logger.info(`[AceCapabilityManager] Skill status reset: ${skillName}`);
      }
    } catch (error: any) {
      logger.error(`[AceCapabilityManager] Failed to reset skill status: ${skillName}`, error);
    }
  }

  /**
   * 触发技能清理流程
   * 与ReActStrategy的自动注销机制集成
   */
  private async initiateSkillCleanup(skillName: string): Promise<void> {
    try {
      // 向L3报告清理启动
      await this.aceIntegrator.sendToLayer('AGENT_MODEL', {
        type: 'CLEANUP_INITIATED',
        content: `Cleanup initiated for faulty skill: ${skillName}`,
        metadata: {
          skillName,
          reason: 'faulty',
          timestamp: Date.now()
        }
      });

      // 注意：实际的清理工作由ReActStrategy的5分钟超时机制处理
      logger.info(`[AceCapabilityManager] Cleanup initiated for skill: ${skillName} (ReActStrategy will handle in 5 minutes)`);
    } catch (error: any) {
      logger.error(`[AceCapabilityManager] Failed to initiate skill cleanup: ${skillName}`, error);
    }
  }

  /**
   * 获取伦理守卫实例
   */
  private getEthicsGuard(): AceEthicsGuard | null {
    return (this.aceIntegrator as any).ethicsGuard || null;
  }

  /**
   * 技能卸载时从L3移除
   */
  async unregisterSkill(skillName: string): Promise<void> {
    try {
      // 从状态映射中移除
      this.skillStatuses.delete(skillName);
      this.skillUsageCounters.delete(skillName);

      // 向L3报告卸载
      await this.aceIntegrator.sendToLayer('AGENT_MODEL', {
        type: 'CAPABILITY_UPDATE',
        content: `Skill ${skillName} unregistered`,
        metadata: {
          skillName,
          action: 'unregistered',
          timestamp: Date.now()
        }
      });

      // 从向量检索中移除
      try {
        await this.toolRetrievalService.removeSkill(skillName);
      } catch (error) {
        logger.warn(`[AceCapabilityManager] Failed to remove skill from vector index: ${skillName}`, error);
      }

      logger.info(`[AceCapabilityManager] Skill unregistered: ${skillName}`);
    } catch (error: any) {
      logger.error(`[AceCapabilityManager] Failed to unregister skill: ${skillName}`, error);
    }
  }
}
