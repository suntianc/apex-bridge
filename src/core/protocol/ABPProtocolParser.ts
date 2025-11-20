/**
 * ABP Protocol Parser
 * 
 * ABP (ApexBridge Protocol) 是一个独立的协议（ABP-only）
 * 解决协议合规问题（CC BY-NC-SA 4.0约束）
 * 
 * @module core/protocol
 */

import {
  ABPProtocolConfig,
} from '../../types/abp';
import { logger } from '../../utils/logger';

/**
 * ABP协议解析器默认配置
 */
const DEFAULT_CONFIG: Required<ABPProtocolConfig> = {
  dualProtocolEnabled: false,
  errorRecoveryEnabled: true,
  jsonRepair: {
    enabled: true,
    strict: false,
  },
  noiseStripping: {
    enabled: true,
    aggressive: false,
  },
  boundaryValidation: {
    enabled: true,
    strict: false,
  },
  fallback: {
    enabled: true,
    toPlainText: true,
  },
  variable: {
    cacheEnabled: true,
    cacheTTL: 60000, // 1分钟
  },
};

/**
 * ABP协议解析器实现
 */
export class ABPProtocolParser {
  private config: Required<ABPProtocolConfig>;

  constructor(config?: ABPProtocolConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config } as Required<ABPProtocolConfig>;
  }
}

