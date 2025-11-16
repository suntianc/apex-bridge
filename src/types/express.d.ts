import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Locals {
    auth?: {
      apiKeyId?: string;
      apiKeyToken?: string;
      userId?: string;
      roles?: string[];
      metadata?: Record<string, unknown>;
    };
    rateLimit?: {
      ruleId?: string;
      key?: string;
      strategy?: string;
      limit?: number;
      remaining?: number;
      reset?: number;
      exceeded?: boolean;
      message?: string;
      provider?: 'memory' | 'redis' | string;
    };
    rateLimited?: boolean;
  }
}

export {};

