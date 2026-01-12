/**
 * Variable Engine Module - Simplified Version
 *
 * 简化版的变量引擎模块导出
 * 特点：移除提供者模式，只保留核心引擎
 */

export * from "../../types/variable";
import { VariableEngine } from "./VariableEngine";
import type { IVariableEngine, VariableEngineOptions } from "../../types/variable";

export { VariableEngine };

/**
 * 创建变量引擎实例（简化版）
 *
 * @param options - 变量引擎配置选项（简化版中不再使用）
 * @returns 变量引擎实例
  19  */
export function createVariableEngine(_options?: VariableEngineOptions): IVariableEngine {
  return new VariableEngine();
}
