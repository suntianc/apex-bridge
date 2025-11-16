/**
 * Security Headers Middleware - 安全头中间件
 * 
 * 配置 Helmet.js 安全头，包括 CSP、HSTS、X-Frame-Options 等
 */

import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { ConfigService } from '../../services/ConfigService';
import { logger } from '../../utils/logger';

export interface SecurityHeadersConfig {
  enabled: boolean;
  csp?: {
    enabled: boolean;
    directives?: Record<string, string[]>;
  };
  hsts?: {
    enabled: boolean;
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
  frameguard?: {
    enabled: boolean;
    action?: 'DENY' | 'SAMEORIGIN';
  };
  contentTypeNosniff?: boolean;
  xssFilter?: boolean;
  referrerPolicy?: string;
  permissionsPolicy?: Record<string, string[]>;
}

/**
 * 创建安全头中间件
 * @param config 安全头配置
 * @returns Express 中间件
 */
export function createSecurityHeadersMiddleware(config?: Partial<SecurityHeadersConfig>): (req: Request, res: Response, next: NextFunction) => void {
  const configService = ConfigService.getInstance();
  const adminConfig = configService.readConfig();

  // 默认配置
  const defaultConfig: SecurityHeadersConfig = {
    enabled: true,
    csp: {
      enabled: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // 允许内联脚本（管理后台需要）
        'style-src': ["'self'", "'unsafe-inline'"], // 允许内联样式
        'img-src': ["'self'", 'data:', 'https:'], // 允许图片
        'font-src': ["'self'", 'data:'], // 允许字体
        'connect-src': ["'self'", 'ws:', 'wss:'], // 允许 WebSocket 连接
        'frame-ancestors': ["'none'"], // 不允许嵌入
        'base-uri': ["'self'"], // 基础 URI
        'form-action': ["'self'"], // 表单提交
        'frame-src': ["'self'"], // iframe 源
        'object-src': ["'none'"], // 不允许对象
        'upgrade-insecure-requests': [] // 升级不安全请求
      }
    },
    hsts: {
      enabled: true,
      maxAge: 31536000, // 1年
      includeSubDomains: true,
      preload: false
    },
    frameguard: {
      enabled: true,
      action: 'DENY'
    },
    contentTypeNosniff: true,
    xssFilter: true,
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: {
      'geolocation': [],
      'microphone': [],
      'camera': [],
      'payment': [],
      'usb': []
    }
  };

  // 合并配置
  const securityConfig: SecurityHeadersConfig = {
    ...defaultConfig,
    ...config,
    csp: {
      ...defaultConfig.csp,
      ...config?.csp
    },
    hsts: {
      ...defaultConfig.hsts,
      ...config?.hsts
    },
    frameguard: {
      ...defaultConfig.frameguard,
      ...config?.frameguard
    }
  };

  // 如果禁用，返回空中间件
  if (!securityConfig.enabled) {
    return (req: Request, res: Response, next: NextFunction) => {
      next();
    };
  }

  // 配置 Helmet
  const helmetOptions: any = {
    contentSecurityPolicy: securityConfig.csp?.enabled ? {
      directives: securityConfig.csp.directives as any
    } : false,
    hsts: securityConfig.hsts?.enabled ? {
      maxAge: securityConfig.hsts.maxAge || 31536000,
      includeSubDomains: securityConfig.hsts.includeSubDomains !== false,
      preload: securityConfig.hsts.preload === true
    } : false,
    frameguard: securityConfig.frameguard?.enabled ? {
      action: securityConfig.frameguard.action === 'SAMEORIGIN' ? 'sameorigin' : 'deny'
    } : false,
    noSniff: securityConfig.contentTypeNosniff !== false,
    xssFilter: securityConfig.xssFilter !== false,
    referrerPolicy: {
      policy: securityConfig.referrerPolicy as any || 'strict-origin-when-cross-origin'
    },
    permittedCrossDomainPolicies: {
      permittedPolicies: 'none'
    },
    expectCt: {
      maxAge: 86400, // 24小时
      enforce: true
    },
    crossOriginEmbedderPolicy: false, // 禁用，避免破坏现有功能
    crossOriginOpenerPolicy: {
      policy: 'same-origin'
    },
    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    },
    originAgentCluster: true,
    dnsPrefetchControl: {
      allow: false
    },
    downloadOptions: {
      action: 'deny'
    },
    hidePoweredBy: true,
    ieNoOpen: true,
    permissionsPolicy: securityConfig.permissionsPolicy ? {
      features: securityConfig.permissionsPolicy as any
    } : undefined
  };

  // 创建 Helmet 中间件
  const helmetMiddleware = helmet(helmetOptions);

  // 返回包装后的中间件
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // 应用 Helmet 中间件
      helmetMiddleware(req, res, () => {
        // 添加自定义安全头
        if (securityConfig.referrerPolicy) {
          res.setHeader('Referrer-Policy', securityConfig.referrerPolicy);
        }

        // 添加 Permissions-Policy 头
        if (securityConfig.permissionsPolicy) {
          const permissionsPolicyValue = Object.entries(securityConfig.permissionsPolicy)
            .map(([feature, allowlist]) => {
              if (allowlist.length === 0) {
                return `${feature}=()`;
              }
              return `${feature}=(${allowlist.join(' ')})`;
            })
            .join(', ');
          res.setHeader('Permissions-Policy', permissionsPolicyValue);
        }

        next();
      });
    } catch (error: any) {
      logger.error('❌ Security headers middleware error:', error);
      next();
    }
  };
}

/**
 * 默认安全头中间件（使用默认配置）
 */
export const securityHeadersMiddleware = createSecurityHeadersMiddleware();
