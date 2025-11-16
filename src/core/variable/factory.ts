/**
 * Variable Engine Factory
 * 
 * 变量引擎工厂函数
 */

import { VariableEngine } from './VariableEngine';
import { IVariableEngine, VariableEngineOptions } from '../../types/variable';

/**
 * 创建变量引擎实例
 * 
 * @param options - 配置选项
 * @returns 变量引擎实例
 */
export function createVariableEngine(options?: VariableEngineOptions): IVariableEngine {
  return new VariableEngine(options);
}

