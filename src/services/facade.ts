/**
 * Services Facade - Unified Services Object
 *
 * This module provides a unified facade object that aggregates all services.
 * External code can import `services` and access all functionality through it.
 *
 * Usage:
 * ```typescript
 * import { services } from "./services/facade";
 *
 * const skills = await services.skills.listSkills();
 * const results = await services.retrieval.findRelevantSkills("file search");
 * ```
 */

import type { EventBus } from "../core/EventBus";
import type { LLMManager } from "../core/LLMManager";
import type { ProtocolEngine } from "../core/ProtocolEngine";
import type { AdminConfig } from "./ConfigService";
import type { ChatService } from "./ChatService";
import type { SkillManager } from "./skill";
import type { ToolRetrievalService } from "./tool-retrieval/ToolRetrievalService";
import type { ContextCompressionService } from "./context-compression/ContextCompressionService";
import type { MCPIntegrationService } from "./MCPIntegrationService";
import type { LLMConfigService } from "./LLMConfigService";

// ============================================================================
// Facade Interfaces
// ============================================================================

export interface ChatServices {
  processMessage: (request: any) => Promise<any>;
  streamMessage: (request: any) => AsyncIterable<any>;
  createChatCompletion: (options: any) => Promise<any>;
  createStreamChatCompletion: (options: any) => AsyncIterable<any>;
  getActiveRequestCount: () => number;
  setWebSocketManager: (ws: any) => void;
  stopCleanupTimer: () => void;
}

export interface SkillServices {
  installSkill: (zipBuffer: Buffer, options?: any) => Promise<any>;
  uninstallSkill: (name: string) => Promise<any>;
  updateSkill: (name: string, description: string) => Promise<any>;
  listSkills: (options?: any) => Promise<any>;
  getSkill: (name: string) => Promise<any>;
  getStatistics: () => Promise<any>;
  getRetrievalService: () => any;
  waitForInitialization: () => Promise<void>;
}

export interface MCPServices {
  registerServer: (config: any) => Promise<void>;
  unregisterServer: (serverId: string) => Promise<void>;
  callTool: (serverId: string, toolName: string, args: any) => Promise<any>;
  listServers: () => Promise<any[]>;
  loadServersFromDatabase: () => Promise<void>;
  shutdown: () => Promise<void>;
}

export interface RetrievalServices {
  initialize: () => Promise<void>;
  findRelevantSkills: (query: string, limit?: number, threshold?: number) => Promise<any[]>;
  findRelevantTools: (query: string, limit?: number, threshold?: number) => Promise<any[]>;
  indexSkill: (skill: any) => Promise<void>;
  indexTools: (tools: any[]) => Promise<void>;
  removeSkill: (skillId: string) => Promise<void>;
  removeTool: (toolId: string) => Promise<void>;
  scanAndIndexAllSkills: (basePath?: string) => Promise<void>;
  indexBuiltinTools: () => Promise<void>;
  getStatus: () => any;
}

export interface CompressionServices {
  compress: (messages: any[], options: any) => Promise<any>;
  getStrategy: (strategy: string) => any;
}

export interface LLMServices {
  createCompletion: (options: any) => Promise<any>;
  embed: (text: string) => Promise<number[]>;
  listModels: () => Promise<any[]>;
  getAllModels: () => any[];
}

export interface ConfigServices {
  getFullConfig: () => any;
  readConfig: () => any;
  validateConfig: (config: any) => any;
  validateSystemConfig: () => any;
  isSetupCompleted: () => boolean;
}

/**
 * Services Facade - Unified Access Point
 */
export interface ServicesFacade {
  /** Chat service */
  chat: ChatServices;
  /** Skill management service */
  skills: SkillServices;
  /** MCP integration service */
  mcp: MCPServices;
  /** Tool retrieval service */
  retrieval: RetrievalServices;
  /** Context compression service */
  compression: CompressionServices;
  /** LLM management service */
  llm: LLMServices;
  /** Configuration service */
  config: ConfigServices;
  /** Internal access (for testing only) */
  _internal: {
    eventBus: EventBus;
    skillManager: SkillManager;
    toolRetrievalService: ToolRetrievalService;
    llmManager: LLMManager;
    chatService: ChatService;
    protocolEngine: ProtocolEngine;
    mcpIntegration: MCPIntegrationService;
    llmConfigService: LLMConfigService;
  };
}

// ============================================================================
// Services Object (Lazy Initialization)
// ============================================================================

// Lazy initialization map
const servicesMap: Partial<ServicesFacade> = {};

/**
 * Get the services facade object
 * Services are initialized on first access
 */
export function getServices(): ServicesFacade {
  return servicesMap as ServicesFacade;
}

/**
 * Set services (for testing)
 */
export function _setServices(services: ServicesFacade): void {
  Object.assign(servicesMap, services);
}

/**
 * Reset services (for testing)
 */
export function _resetServices(): void {
  Object.keys(servicesMap).forEach((key) => {
    delete servicesMap[key as keyof ServicesFacade];
  });
}
