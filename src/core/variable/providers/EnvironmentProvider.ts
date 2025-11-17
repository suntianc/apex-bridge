/**
 * Environment Variable Provider
 * 
 * 提供环境变量访问
 
 */

import { IVariableProvider, VariableContext } from '../../../types/variable';
import { logger } from '../../../utils/logger';

/**
 * 环境变量提供者
 * 
 * 支持所有以特定前缀开头的环境变量：
 * - Tar* - 目标变量
 * - Var* - 通用变量
 * - ENV_* - 环境变量
 */
export class EnvironmentProvider implements IVariableProvider {
  readonly name = 'EnvironmentProvider';

  private prefixes: string[];

  constructor(prefixes: string[] = ['Tar', 'Var', 'ENV_']) {
    this.prefixes = prefixes;
  }

  async resolve(key: string, context?: VariableContext): Promise<string | null> {
    // 处理 namespace:variableKey 格式 (例如: Var:TEST_VAR)
    // 检查key是否以支持的前缀开头，格式为 prefix:variableKey
    let envKey: string | undefined;
    
    for (const prefix of this.prefixes) {
      // 检查格式: prefix:variableKey
      if (key.startsWith(prefix + ':')) {
        envKey = key.substring(prefix.length + 1); // 提取 variableKey 部分
        break;
      }
      // 检查格式: 直接以prefix开头（向后兼容）
      else if (key.startsWith(prefix)) {
        envKey = key;
        break;
      }
    }

    if (!envKey) {
      return null;
    }

    // 获取环境变量值
    const value = process.env[envKey];

    if (value === undefined) {
      logger.debug(`[EnvironmentProvider] Environment variable '${envKey}' not found (from key '${key}')`);
      return `[未配置 ${envKey}]`;
    }

    return value;
  }

  getSupportedKeys(): string[] {
    // 返回所有匹配前缀的环境变量
    const keys: string[] = [];
    for (const envKey in process.env) {
      if (this.prefixes.some(prefix => envKey.startsWith(prefix))) {
        keys.push(envKey);
      }
    }
    return keys;
  }

  /**
   * 添加支持的前缀
   */
  addPrefix(prefix: string): void {
    if (!this.prefixes.includes(prefix)) {
      this.prefixes.push(prefix);
      logger.info(`[EnvironmentProvider] Added prefix: ${prefix}`);
    }
  }

  /**
   * 移除前缀
   */
  removePrefix(prefix: string): void {
    const index = this.prefixes.indexOf(prefix);
    if (index > -1) {
      this.prefixes.splice(index, 1);
      logger.info(`[EnvironmentProvider] Removed prefix: ${prefix}`);
    }
  }

  /**
   * 获取所有前缀
   */
  getPrefixes(): string[] {
    return [...this.prefixes];
  }
}

