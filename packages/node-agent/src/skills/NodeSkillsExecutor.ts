import path from 'path';
import { Logger } from 'winston';
import { LoadedSkill, SkillMetadata } from './SkillsLoader';
import { TaskContext, TaskResult } from '../tasks/types';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export interface NodeSkillsExecutorOptions {
  logger: Logger;
}

export class NodeSkillsExecutor {
  private readonly logger: Logger;
  private readonly ajv: Ajv;
  private readonly executeCache = new Map<string, any>();

  constructor(options: NodeSkillsExecutorOptions) {
    this.logger = options.logger.child({ component: 'NodeSkillsExecutor' });
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);
  }

  /**
   * 创建任务处理器
   */
  createHandler(skill: LoadedSkill): (context: TaskContext) => Promise<TaskResult> {
    return async (context: TaskContext): Promise<TaskResult> => {
      const { assignment, logger: taskLogger, signal } = context;
      const startTime = Date.now();

      try {
        // 验证输入参数
        const validationResult = this.validateInput(skill.metadata, assignment.toolArgs);
        if (!validationResult.valid) {
          taskLogger.warn('Input validation failed', {
            errors: validationResult.errors
          });
          return {
            success: false,
            error: {
              code: 'VALIDATION_FAILED',
              message: `Input validation failed: ${validationResult.errors.join('; ')}`
            }
          };
        }

        // 检查缓存
        if (skill.metadata.cacheable) {
          const cacheKey = this.generateCacheKey(skill.name, assignment.toolArgs);
          const cached = this.executeCache.get(cacheKey);
          if (cached) {
            const now = Date.now();
            const ttl = (skill.metadata.ttl || 3600) * 1000;
            if (now - cached.timestamp < ttl) {
              taskLogger.debug('Cache hit', { skillName: skill.name, cacheKey });
              return {
                success: true,
                result: cached.result
              };
            } else {
              this.executeCache.delete(cacheKey);
            }
          }
        }

        // 加载执行脚本
        const executeFn = await this.loadExecuteFunction(skill.executePath);
        if (!executeFn) {
          return {
            success: false,
            error: {
              code: 'EXECUTE_FUNCTION_NOT_FOUND',
              message: `Execute function not found in ${skill.executePath}`
            }
          };
        }

        // 执行技能（带超时控制）
        const timeoutMs = skill.metadata.security?.timeout_ms || 60000;
        const result = await this.executeWithTimeout(
          () => executeFn(assignment.toolArgs || {}),
          timeoutMs,
          signal
        );

        // 验证输出结果
        const outputValidation = this.validateOutput(skill.metadata, result);
        if (!outputValidation.valid) {
          taskLogger.warn('Output validation failed', {
            errors: outputValidation.errors
          });
          // 输出验证失败不阻止返回结果，只记录警告
        }

        // 缓存结果
        if (skill.metadata.cacheable && result !== undefined) {
          const cacheKey = this.generateCacheKey(skill.name, assignment.toolArgs);
          this.executeCache.set(cacheKey, {
            result,
            timestamp: Date.now()
          });
        }

        const executionTime = Date.now() - startTime;
        taskLogger.debug('Skill executed successfully', {
          skillName: skill.name,
          executionTime
        });

        return {
          success: true,
          result
        };
      } catch (error) {
        const executionTime = Date.now() - startTime;
        taskLogger.error('Skill execution failed', {
          skillName: skill.name,
          error: (error as Error).message,
          executionTime
        });

        if ((error as Error).name === 'AbortError' || (error as Error).message.includes('timeout')) {
          return {
            success: false,
            error: {
              code: 'TIMEOUT',
              message: `Skill execution timed out after ${skill.metadata.security?.timeout_ms || 60000}ms`
            }
          };
        }

        return {
          success: false,
          error: {
            code: 'EXECUTION_FAILED',
            message: (error as Error).message
          }
        };
      }
    };
  }

  /**
   * 验证输入参数
   */
  private validateInput(metadata: SkillMetadata, input: any): { valid: boolean; errors: string[] } {
    const schema = metadata.input_schema;
    if (!schema) {
      return { valid: true, errors: [] };
    }

    try {
      const validate = this.ajv.compile(schema);
      const valid = validate(input);
      
      if (!valid) {
        const errors = validate.errors?.map(err => 
          `${err.instancePath} ${err.message}`
        ) || ['Validation failed'];
        return { valid: false, errors };
      }

      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [`Schema validation error: ${(error as Error).message}`]
      };
    }
  }

  /**
   * 验证输出结果
   */
  private validateOutput(metadata: SkillMetadata, output: any): { valid: boolean; errors: string[] } {
    const schema = metadata.output_schema;
    if (!schema) {
      return { valid: true, errors: [] };
    }

    try {
      const validate = this.ajv.compile(schema);
      const valid = validate(output);
      
      if (!valid) {
        const errors = validate.errors?.map(err => 
          `${err.instancePath} ${err.message}`
        ) || ['Validation failed'];
        return { valid: false, errors };
      }

      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [`Schema validation error: ${(error as Error).message}`]
      };
    }
  }

  /**
   * 加载执行函数
   */
  private async loadExecuteFunction(executePath: string): Promise<((params: any) => any) | null> {
    try {
      // 解析绝对路径
      const resolvedPath = path.isAbsolute(executePath)
        ? executePath
        : path.resolve(process.cwd(), executePath);
      
      // 清除 require 缓存，确保每次加载最新代码
      const resolvedModule = require.resolve(resolvedPath);
      if (require.cache[resolvedModule]) {
        delete require.cache[resolvedModule];
      }
      
      const module = require(resolvedPath);
      
      // 支持默认导出或命名导出
      if (typeof module === 'function') {
        return module;
      } else if (typeof module.default === 'function') {
        return module.default;
      } else if (typeof module.execute === 'function') {
        return module.execute;
      }

      return null;
    } catch (error) {
      this.logger.error(`Failed to load execute function from ${executePath}:`, {
        error: (error as Error).message
      });
      return null;
    }
  }

  /**
   * 带超时控制的执行
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T> | T,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Task aborted'));
        return;
      }

      const timeoutId = setTimeout(() => {
        reject(new Error(`Execution timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const abortHandler = () => {
        clearTimeout(timeoutId);
        reject(new Error('Task aborted'));
      };

      if (signal) {
        signal.addEventListener('abort', abortHandler);
      }

      Promise.resolve(fn())
        .then((result) => {
          clearTimeout(timeoutId);
          if (signal) {
            signal.removeEventListener('abort', abortHandler);
          }
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          if (signal) {
            signal.removeEventListener('abort', abortHandler);
          }
          reject(error);
        });
    });
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(skillName: string, params: any): string {
    const paramsStr = JSON.stringify(params, Object.keys(params || {}).sort());
    return `${skillName}:${paramsStr}`;
  }
}

