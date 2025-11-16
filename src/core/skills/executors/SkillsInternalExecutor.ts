import { SkillsDirectExecutor, SkillsDirectExecutorOptions } from './SkillsDirectExecutor';

export class SkillsInternalExecutor extends SkillsDirectExecutor {
  constructor(options: Omit<SkillsDirectExecutorOptions, 'executionType'>) {
    super({ ...options, executionType: 'internal' });
  }
}
