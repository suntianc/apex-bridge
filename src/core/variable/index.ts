/**
 * Variable Engine Module
 * 
 * 变量引擎模块导出
 */

export * from '../../types/variable';
import { VariableEngine } from './VariableEngine';
import type { IVariableEngine, VariableEngineOptions } from '../../types/variable';

export { VariableEngine };

/**
 * 创建变量引擎实例
 * 
 * @param options - 变量引擎配置选项
 * @returns 变量引擎实例
 */
export function createVariableEngine(options?: VariableEngineOptions): IVariableEngine {
  return new VariableEngine(options);
}

