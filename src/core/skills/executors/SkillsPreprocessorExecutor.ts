import { SkillsDirectExecutor, SkillsDirectExecutorOptions } from './SkillsDirectExecutor';
import { ExecutionRequest, SkillMetadata } from '../../../types';

export class SkillsPreprocessorExecutor extends SkillsDirectExecutor {
  constructor(options: Omit<SkillsDirectExecutorOptions, 'executionType'>) {
    super({ ...options, executionType: 'preprocessor' });
  }

  protected override shouldUseCache(
    request: ExecutionRequest,
    metadata?: SkillMetadata
  ): boolean {
    // 预处理器通常依赖上下文，默认不缓存
    return false;
  }
}
