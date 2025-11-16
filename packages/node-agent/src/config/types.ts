import { z } from 'zod';

const llmProviderSchema = z.object({
  apiKey: z.string().min(1),
  baseURL: z.string().url(),
  model: z.string().min(1),
  stream: z.boolean().optional(),
  timeout: z.number().int().positive().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
  fastMode: z
    .object({
      enabled: z.boolean().default(false),
      defaultReply: z.string().default('抱歉，我这边暂时无法回答这个问题。')
    })
    .default({ enabled: false, defaultReply: '抱歉，我这边暂时无法回答这个问题。' })
});

export const nodeAgentConfigSchema = z.object({
  hub: z.object({
    url: z.string().url(),
    apiKey: z.string().min(1).optional()
  }),
  node: z.object({
    id: z.string().min(1).optional(),
    name: z.string().min(1),
    type: z.enum(['worker', 'companion']),
    capabilities: z.array(z.string()).default([]),
    tools: z.array(z.string()).default([])
  }),
  heartbeat: z.object({
    intervalMs: z.number().int().positive().default(30_000)
  }).default({ intervalMs: 30_000 }),
  tasks: z.object({
    maxConcurrent: z.number().int().positive().default(2),
    defaultTimeoutMs: z.number().int().positive().default(60_000)
  }).default({ maxConcurrent: 2, defaultTimeoutMs: 60_000 }),
  llm: z
    .object({
      streamEnabled: z.boolean().default(true),
      localFallback: z.boolean().default(false),
      defaultProvider: z.string().min(1).optional(),
      providers: z.record(llmProviderSchema).default({}),
      retry: z
        .object({
          attempts: z.number().int().nonnegative().default(0),
          delayMs: z.number().int().nonnegative().default(1_000)
        })
        .default({ attempts: 0, delayMs: 1_000 })
    })
    .default({
      streamEnabled: true,
      localFallback: false,
      providers: {},
      retry: { attempts: 0, delayMs: 1_000 }
    }),
  telemetry: z
    .object({
      enabled: z.boolean().default(true),
      port: z.number().int().positive().default(8765)
    })
    .default({
      enabled: true,
      port: 8765
    }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    format: z.enum(['json', 'pretty']).default('pretty')
  }).default({ level: 'info', format: 'pretty' }),
  plugins: z
    .object({
      toolDirectory: z.string().default('plugins')
    })
    .default({
      toolDirectory: 'plugins'
    })
});

export type NodeAgentConfig = z.infer<typeof nodeAgentConfigSchema>;

export interface LoadedConfig {
  config: NodeAgentConfig;
  sourcePath: string;
  warnings: string[];
  maskedConfig: Record<string, unknown>;
}

