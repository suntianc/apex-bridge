import type { Tool } from '../stream-orchestrator/types';

/**
 * 技能执行器
 * 简化的技能执行，支持Direct和Internal两种模式
 */
export class SkillExecutor {
  private skills = new Map<string, Tool>();

  /**
   * 注册技能
   */
  registerSkill(skill: Tool): void {
    this.skills.set(skill.name, skill);
  }

  /**
   * 获取技能
   */
  getSkillByName(name: string): Tool | undefined {
    return this.skills.get(name);
  }

  /**
   * 执行技能
   */
  async executeSkill(skill: Tool, args: any): Promise<any> {
    try {
      const result = await skill.execute(args);
      return result;
    } catch (error) {
      throw new Error(`技能执行失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
