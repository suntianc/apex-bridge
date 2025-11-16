/**
 * Custom Validators - 自定义业务规则验证器
 * 
 * 提供业务特定的验证规则，用于补充 JSON Schema 验证
 */

import { addCustomKeyword, addCustomFormat } from './validationMiddleware';
import { PathService } from '../../services/PathService';
import { ConfigService } from '../../services/ConfigService';
import * as path from 'path';
import * as fs from 'fs';

const pathService = PathService.getInstance();
const configService = ConfigService.getInstance();

/**
 * 验证代理/人格ID
 */
export function validateAgentId(value: string): boolean {
  // 检查格式：允许字母、数字、汉字、连字符
  if (!/^[\w\u4e00-\u9fa5-]+$/.test(value)) {
    throw new Error('代理 ID 只能包含字母、数字、汉字和连字符');
  }

  // 检查长度
  if (value.length < 3 || value.length > 50) {
    throw new Error('代理 ID 长度必须在 3 到 50 个字符之间');
  }

  // 检查是否受保护
  if (value === 'default') {
    throw new Error('不能使用 "default" 作为代理 ID（受保护）');
  }

  return true;
}

/**
 * 验证文件路径
 */
export function validateFilePath(value: string): boolean {
  // 防止路径遍历
  if (value.includes('..') || value.includes('~')) {
    throw new Error('无效的文件路径：检测到路径遍历');
  }

  // 规范化路径
  const normalized = path.normalize(value);

  // 检查是否在允许的目录内（人格目录）
  const personalityDir = path.join(pathService.getConfigDir(), 'personality');
  const absolutePath = path.resolve(personalityDir, normalized);
  
  if (!absolutePath.startsWith(path.resolve(personalityDir))) {
    throw new Error('文件路径在允许的目录之外');
  }

  return true;
}

/**
 * 验证节点类型
 */
export function validateNodeType(value: string): boolean {
  const allowedTypes = ['companion', 'worker', 'custom', 'hub'];
  if (!allowedTypes.includes(value)) {
    throw new Error(`节点类型必须是以下之一: ${allowedTypes.join(', ')}`);
  }
  return true;
}

/**
 * 验证关系类型
 */
export function validateRelationshipType(value: string): boolean {
  const allowedTypes = ['friend', 'enemy', 'neutral', 'family', 'romantic'];
  if (!allowedTypes.includes(value)) {
    throw new Error(`关系类型必须是以下之一: ${allowedTypes.join(', ')}`);
  }
  return true;
}

/**
 * 验证会话类型
 */
export function validateSessionType(value: string): boolean {
  const allowedTypes = ['private', 'group'];
  if (!allowedTypes.includes(value)) {
    throw new Error(`会话类型必须是以下之一: ${allowedTypes.join(', ')}`);
  }
  return true;
}

/**
 * 验证端口号
 */
export function validatePort(value: number): boolean {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('端口号必须在 1 到 65535 之间');
  }
  return true;
}

/**
 * 验证温度值
 */
export function validateTemperature(value: number): boolean {
  if (typeof value !== 'number' || value < 0 || value > 2) {
    throw new Error('温度值必须在 0 到 2 之间');
  }
  return true;
}

/**
 * 验证消息角色
 */
export function validateMessageRole(value: string): boolean {
  const allowedRoles = ['system', 'user', 'assistant', 'tool'];
  if (!allowedRoles.includes(value)) {
    throw new Error(`消息角色必须是以下之一: ${allowedRoles.join(', ')}`);
  }
  return true;
}

/**
 * 验证 LLM 提供商
 */
export function validateLLMProvider(value: string): boolean {
  const allowedProviders = ['openai', 'deepseek', 'zhipu', 'claude', 'ollama', 'custom'];
  if (!allowedProviders.includes(value)) {
    throw new Error(`LLM 提供商必须是以下之一: ${allowedProviders.join(', ')}`);
  }
  return true;
}

/**
 * 验证用户名
 */
export function validateUsername(value: string): boolean {
  if (typeof value !== 'string' || value.length < 3 || value.length > 50) {
    throw new Error('用户名长度必须在 3 到 50 个字符之间');
  }

  // 只允许字母、数字、下划线
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error('用户名只能包含字母、数字和下划线');
  }

  return true;
}

/**
 * 验证密码
 */
export function validatePassword(value: string): boolean {
  if (typeof value !== 'string' || value.length < 6 || value.length > 100) {
    throw new Error('密码长度必须在 6 到 100 个字符之间');
  }

  return true;
}

/**
 * 验证 API Key 格式
 */
export function validateAPIKey(value: string): boolean {
  if (typeof value !== 'string' || value.length < 10 || value.length > 200) {
    throw new Error('API Key 长度必须在 10 到 200 个字符之间');
  }

  // 基本格式检查（可以包含字母、数字、连字符、下划线）
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error('API Key 格式无效');
  }

  return true;
}

/**
 * 初始化自定义验证器
 * 注册所有自定义格式到验证中间件
 * 
 * 注意：AJV的关键字注册比较复杂，这里我们主要使用格式验证和模式验证
 * 自定义验证逻辑可以在控制器层进行，或者使用格式验证
 */
export function initializeCustomValidators(): void {
  // 注册自定义格式
  // 注意：格式验证返回true/false，不能自定义错误消息
  // 如果需要自定义错误消息，应该在模式中使用pattern或enum，或者在控制器层验证
  
  // 代理ID格式（字母、数字、汉字、连字符）
  addCustomFormat('agent-id', {
    type: 'string',
    validate: (value: string) => {
      try {
        return validateAgentId(value);
      } catch {
        return false;
      }
    }
  });

  // 文件路径格式（防止路径遍历）
  addCustomFormat('file-path', {
    type: 'string',
    validate: (value: string) => {
      try {
        return validateFilePath(value);
      } catch {
        return false;
      }
    }
  });

  // 节点类型格式
  addCustomFormat('node-type', {
    type: 'string',
    validate: (value: string) => {
      try {
        return validateNodeType(value);
      } catch {
        return false;
      }
    }
  });

  // 关系类型格式
  addCustomFormat('relationship-type', {
    type: 'string',
    validate: (value: string) => {
      try {
        return validateRelationshipType(value);
      } catch {
        return false;
      }
    }
  });

  // 会话类型格式
  addCustomFormat('session-type', {
    type: 'string',
    validate: (value: string) => {
      try {
        return validateSessionType(value);
      } catch {
        return false;
      }
    }
  });

  // 消息角色格式
  addCustomFormat('message-role', {
    type: 'string',
    validate: (value: string) => {
      try {
        return validateMessageRole(value);
      } catch {
        return false;
      }
    }
  });

  // LLM提供商格式
  addCustomFormat('llm-provider', {
    type: 'string',
    validate: (value: string) => {
      try {
        return validateLLMProvider(value);
      } catch {
        return false;
      }
    }
  });

  // 用户名格式
  addCustomFormat('username', {
    type: 'string',
    validate: (value: string) => {
      try {
        return validateUsername(value);
      } catch {
        return false;
      }
    }
  });

  // 密码格式
  addCustomFormat('password', {
    type: 'string',
    validate: (value: string) => {
      try {
        return validatePassword(value);
      } catch {
        return false;
      }
    }
  });

  // API Key格式
  addCustomFormat('api-key', {
    type: 'string',
    validate: (value: string) => {
      try {
        return validateAPIKey(value);
      } catch {
        return false;
      }
    }
  });
}

// 注意：验证函数已经在文件顶部导出，这里不需要再次导出
