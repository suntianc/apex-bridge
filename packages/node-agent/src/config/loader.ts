import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { randomBytes } from 'crypto';
import dotenv from 'dotenv';
import { nodeAgentConfigSchema, LoadedConfig, NodeAgentConfig } from './types';
import { mergeDeep, maskSensitive } from '../utils/object';

const readFile = promisify(fs.readFile);

export interface LoadConfigOptions {
  configPath?: string;
  envPrefix?: string;
}

const DEFAULT_CONFIG_FILENAMES = [
  'node-agent.config.json',
  'node-agent.config.example.json',
  'config/node-agent.config.json'
];

const ENV_PREFIX = 'NODE_AGENT_';
const DEFAULT_NODE_ID_FILENAME = 'node-id';
const DEFAULT_ID_DIR = path.resolve(process.cwd(), 'runtime-data');

let dotenvLoaded = false;

function ensureDotenvOnce(): void {
  if (dotenvLoaded) {
    return;
  }
  dotenv.config();
  dotenvLoaded = true;
}

function findConfigPath(customPath?: string): string {
  if (customPath) {
    return path.resolve(process.cwd(), customPath);
  }

  const envPath = process.env[`${ENV_PREFIX}CONFIG`];
  if (envPath) {
    return path.resolve(process.cwd(), envPath);
  }

  for (const filename of DEFAULT_CONFIG_FILENAMES) {
    const candidate = path.resolve(process.cwd(), filename);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to locate config file. Tried: ${[
      'NODE_AGENT_CONFIG env',
      ...DEFAULT_CONFIG_FILENAMES
    ].join(', ')}`
  );
}

function parseEnvOverrides(): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  const get = (key: string) => process.env[`${ENV_PREFIX}${key}`];

  const hubUrl = get('HUB_URL');
  const hubAbpKey = get('HUB_ABP_KEY');
  if (hubUrl || hubAbpKey) {
    const hubOverrides: Record<string, unknown> = {};
    if (hubUrl) hubOverrides.url = hubUrl;
    if (hubAbpKey) hubOverrides.abpKey = hubAbpKey;
    overrides.hub = {
      ...((overrides.hub as Record<string, unknown> | undefined) ?? {}),
      ...hubOverrides
    };
  }

  const nodeId = get('NODE_ID');
  const nodeName = get('NODE_NAME');
  const nodeType = get('NODE_TYPE');
  const nodeCapabilities = get('NODE_CAPABILITIES');
  const nodeTools = get('NODE_TOOLS');
  if (nodeId || nodeName || nodeType || nodeCapabilities || nodeTools) {
    const nodeOverrides: Record<string, unknown> = {};
    if (nodeId) nodeOverrides.id = nodeId;
    if (nodeName) nodeOverrides.name = nodeName;
    if (nodeType) nodeOverrides.type = nodeType;
    if (nodeCapabilities) {
      nodeOverrides.capabilities = nodeCapabilities
        .split(',')
        .map((cap) => cap.trim())
        .filter(Boolean);
    }
    if (nodeTools) {
      nodeOverrides.tools = nodeTools
        .split(',')
        .map((tool) => tool.trim())
        .filter(Boolean);
    }
    overrides.node = {
      ...((overrides.node as Record<string, unknown> | undefined) ?? {}),
      ...nodeOverrides
    };
  }

  const heartbeatInterval = get('HEARTBEAT_INTERVAL_MS');
  if (heartbeatInterval) {
    overrides.heartbeat = {
      intervalMs: Number.parseInt(heartbeatInterval, 10)
    };
  }

  const maxConcurrent = get('TASKS_MAX_CONCURRENT');
  const defaultTimeout = get('TASKS_DEFAULT_TIMEOUT_MS');
  if (maxConcurrent || defaultTimeout) {
    overrides.tasks = {
      ...((overrides.tasks as Record<string, unknown> | undefined) ?? {}),
      ...(maxConcurrent ? { maxConcurrent: Number.parseInt(maxConcurrent, 10) } : {}),
      ...(defaultTimeout ? { defaultTimeoutMs: Number.parseInt(defaultTimeout, 10) } : {})
    };
  }

  const llmStreamEnabled = get('LLM_STREAM_ENABLED');
  const llmLocalFallback = get('LLM_LOCAL_FALLBACK');
  const llmRetryAttempts = get('LLM_RETRY_ATTEMPTS');
  const llmRetryDelay = get('LLM_RETRY_DELAY_MS');
  if (llmStreamEnabled || llmLocalFallback || llmRetryAttempts || llmRetryDelay) {
    const existingRetry = ((overrides.llm as Record<string, unknown> | undefined)?.retry ??
      {}) as Record<string, unknown>;

    overrides.llm = {
      ...((overrides.llm as Record<string, unknown> | undefined) ?? {}),
      ...(llmStreamEnabled ? { streamEnabled: llmStreamEnabled === 'true' } : {}),
      ...(llmLocalFallback ? { localFallback: llmLocalFallback === 'true' } : {}),
      retry: {
        ...existingRetry,
        ...(llmRetryAttempts ? { attempts: Number.parseInt(llmRetryAttempts, 10) } : {}),
        ...(llmRetryDelay ? { delayMs: Number.parseInt(llmRetryDelay, 10) } : {})
      }
    };
  }

  const loggingLevel = get('LOGGING_LEVEL');
  const loggingFormat = get('LOGGING_FORMAT');
  if (loggingLevel || loggingFormat) {
    overrides.logging = {
      ...((overrides.logging as Record<string, unknown> | undefined) ?? {}),
      ...(loggingLevel ? { level: loggingLevel } : {}),
      ...(loggingFormat ? { format: loggingFormat } : {})
    };
  }

  const telemetryEnabled = get('TELEMETRY_ENABLED');
  const telemetryPort = get('TELEMETRY_PORT');
  if (telemetryEnabled || telemetryPort) {
    overrides.telemetry = {
      ...((overrides.telemetry as Record<string, unknown> | undefined) ?? {}),
      ...(telemetryEnabled ? { enabled: telemetryEnabled === 'true' } : {}),
      ...(telemetryPort ? { port: Number.parseInt(telemetryPort, 10) } : {})
    };
  }

  const skillsDirectory = get('SKILLS_DIRECTORY');
  if (skillsDirectory) {
    overrides.skills = {
      ...((overrides.skills as Record<string, unknown> | undefined) ?? {}),
      directory: skillsDirectory
    };
  }

  return overrides;
}

function sanitizePathSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function resolveNodeIdPath(configPath: string, nodeName: string): string {
  const customPath = process.env[`${ENV_PREFIX}ID_PATH`];
  if (customPath) {
    return path.resolve(process.cwd(), customPath);
  }
  const nameSegment =
    nodeName && nodeName.trim().length > 0 ? sanitizePathSegment(nodeName.trim()) : undefined;
  const configSegment = sanitizePathSegment(
    path.relative(process.cwd(), configPath) || path.basename(configPath)
  );

  const targetDir =
    nameSegment && nameSegment.length > 0
      ? path.join(DEFAULT_ID_DIR, nameSegment)
      : path.join(DEFAULT_ID_DIR, configSegment);

  ensureDirectoryForFile(path.join(targetDir, DEFAULT_NODE_ID_FILENAME));
  return path.join(targetDir, DEFAULT_NODE_ID_FILENAME);
}

function generateNodeId(): string {
  return `node-${Date.now()}-${randomBytes(4).toString('hex')}`;
}

function ensureDirectoryForFile(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureNodeIdentity(
  config: NodeAgentConfig,
  configPath: string,
  warnings: string[]
): void {
  const nodeName = config.node.name || 'node';
  const identityPath = resolveNodeIdPath(configPath, nodeName);
  ensureDirectoryForFile(identityPath);

  const fileExists = fs.existsSync(identityPath);
  const fileId = fileExists ? fs.readFileSync(identityPath, 'utf8').trim() : '';
  const configId = config.node.id?.trim();

  if (configId && configId.length > 0) {
    if (fileExists && fileId && fileId !== configId) {
      warnings.push(
        `node-id file (${path.relative(process.cwd(), identityPath)}) differs from config value; updating file to config value.`
      );
    }
    fs.writeFileSync(identityPath, configId, 'utf8');
    config.node.id = configId;
    return;
  }

  if (fileId) {
    config.node.id = fileId;
    return;
  }

  const generatedId = generateNodeId();
  fs.writeFileSync(identityPath, generatedId, 'utf8');
  config.node.id = generatedId;
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadedConfig> {
  ensureDotenvOnce();

  const resolvedPath = findConfigPath(options.configPath);
  const rawFile = await readFile(resolvedPath, 'utf8');
  let parsedFile: unknown;
  try {
    parsedFile = JSON.parse(rawFile);
  } catch (error) {
    throw new Error(`Failed to parse config JSON (${resolvedPath}): ${(error as Error).message}`);
  }

  if (parsedFile === null || typeof parsedFile !== 'object' || Array.isArray(parsedFile)) {
    throw new Error(`Config file (${resolvedPath}) must contain a JSON object`);
  }

  const envOverrides = parseEnvOverrides();
  const merged = mergeDeep(parsedFile, envOverrides);

  const config = nodeAgentConfigSchema.parse(merged);
  const masked = maskSensitive(config, ['hub.abpKey']);
  const maskedLLM = masked.llm as Record<string, unknown> | undefined;
  if (maskedLLM && typeof maskedLLM === 'object' && !Array.isArray(maskedLLM)) {
    const providers = maskedLLM.providers as Record<string, any> | undefined;
    if (providers && typeof providers === 'object') {
      Object.keys(providers).forEach((key) => {
        const provider = providers[key];
        if (provider && typeof provider === 'object' && 'apiKey' in provider) {
          provider.apiKey = '***';
        }
      });
    }
  }

  const warnings: string[] = [];

  ensureNodeIdentity(config, resolvedPath, warnings);

  return {
    config,
    sourcePath: resolvedPath,
    warnings,
    maskedConfig: masked
  };
}

