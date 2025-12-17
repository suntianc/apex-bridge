/**
 * Reflector 相关类型定义
 * Stage 1: Reflector MVP - 规则引擎版
 */

import { ErrorType } from './trajectory';

/**
 * 错误模式规则
 * 定义常见错误类型的识别规则和解决方案
 */
export interface ErrorPatternRule {
  error_type: ErrorType;
  keywords: string[];
  anti_pattern: string;
  solution: string;
  tags: string[];
}

/**
 * 失败模式分析结果
 * 从失败 Trajectory 中提取的反模式信息
 */
export interface FailurePattern {
  error_type: ErrorType;
  occurrences: number;
  failed_trajectories: string[];
  anti_pattern: string;
  solution: string;
  tags: string[];
  confidence: number;
}
