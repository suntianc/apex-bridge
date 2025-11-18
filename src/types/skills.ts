export type SkillExecutionType =
  | 'direct'
  | 'internal';

export type SkillLoadingPriority = 'low' | 'normal' | 'high';

export interface SkillMetadataProvider {
  loadMetadata(skillPath: string): Promise<SkillMetadata>;
}

export interface SkillPermissionConfig {
  network?: boolean;
  filesystem?: 'none' | 'read' | 'read-write';
  externalApis?: string[];
  environment?: Record<string, string>;
}

export interface SkillTriggerPattern {
  pattern: string;
  confidence?: number;
  locale?: string;
}

export interface SkillMetadata {
  name: string;
  displayName: string;
  description: string;
  version: string;
  type: SkillExecutionType;
  category?: string;
  domain: string;
  keywords: string[];
  tags?: string[];
  capabilities?: string[];
  triggerPatterns?: Array<string | SkillTriggerPattern>;
  permissions: SkillPermissionConfig;
  triggers?: SkillTriggerMetadata;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  security?: SkillSecurityPolicy;
  resources?: SkillResourceManifest;
  estimatedTokens?: number;
  cacheable: boolean;
  ttl: number;
  priority?: SkillLoadingPriority;
  sandboxExecution?: boolean; // 🆕 是否使用沙箱执行（默认 true，如果为 false 则直接执行）
  config?: Record<string, unknown>;
  createdAt?: number;
  updatedAt?: number;
  path: string;
  loadedAt: number;
  // ABP协议支持（可选，ABP-only）
  protocol?: 'abp';
  abp?: {
    kind?: 'action' | 'query' | 'transform' | 'validate' | 'stream' | 'schedule';
    tools?: Array<{
      name: string;
      description?: string;
      parameters?: Record<string, {
        type?: string;
        description?: string;
        required?: boolean;
        default?: any;
        validation?: {
          min?: number;
          max?: number;
          pattern?: string;
          enum?: any[];
        };
      }>;
      returns?: {
        type?: string;
        description?: string;
      };
    }>;
  };
}

export interface SkillTriggerMetadata {
  intents?: string[];
  phrases?: string[];
  eventTypes?: string[];
  priority?: number;
}

export interface SkillSecurityPolicy {
  timeoutMs?: number;
  memoryMb?: number;
  network?: 'none' | 'allowlist';
  networkAllowlist?: string[];
  filesystem?: 'none' | 'read-only' | 'read-write';
  environment?: Record<string, string>;
}

export interface SkillResourceManifest {
  entry?: string;
  helpers?: string[];
  references?: string[];
  assets?: string[];
}

export interface SkillSearchOptions {
  limit?: number;
  minConfidence?: number;
  domain?: string;
  requiredKeywords?: string[];
}

export interface SkillSearchResult {
  metadata: SkillMetadata;
  confidence: number;
  matchedKeywords: string[];
  matchedDescriptionTerms: string[];
  matchedTriggers?: string[];
}

export interface SkillContentSection {
  title: string;
  body: string;
}

export interface SkillCodeBlock {
  language: string;
  code: string;
}

export interface SkillContent {
  name: string;
  raw: string;
  sections: SkillContentSection[];
  codeBlocks: SkillCodeBlock[];
  frontMatter?: Record<string, unknown>;
  path: string;
  loadedAt: number;
}

export interface SkillScriptResource {
  name: string;
  path: string;
  content: string;
  size: number;
  language: string;
}

export interface SkillAssetResource {
  name: string;
  path: string;
  size: number;
  mimeType?: string;
}

export interface SkillResources {
  scripts: SkillScriptResource[];
  assets: SkillAssetResource[];
  references?: SkillReferenceResource[];
  dependencies: string[];
  loadedAt: number;
}

export interface SkillReferenceResource {
  name: string;
  path: string;
  size: number;
  mimeType?: string;
}

export type SkillDependencyCategory = 'builtin' | 'external' | 'relative' | 'remote';

export interface SkillDependency {
  module: string;
  importType: 'import' | 'require';
  specifier?: string;
  category?: SkillDependencyCategory;
}

export interface ResolvedDependency {
  module: string;
  category: SkillDependencyCategory;
  exports: unknown;
  path?: string;
}

export interface DependencyResolutionSummary {
  resolvedModules: ResolvedDependency[];
  warnings: string[];
}

export interface CompilationDiagnostic {
  message: string;
  code?: number;
  category?: string;
  file?: string;
  line?: number;
  column?: number;
}

export interface SkillCodeMetadata {
  exports: string[];
  imports: SkillDependency[];
  complexityScore: number;
}

export interface SkillCodeExtraction {
  entryCode: string;
  auxiliaryCode: string[];
  dependencies: SkillDependency[];
  metadata: SkillCodeMetadata;
}

export interface GeneratedSkillCode {
  javascript: string;
  sourceMap?: string;
  diagnostics?: CompilationDiagnostic[];
  metadata: SkillCodeMetadata;
  dependencies: SkillDependency[];
}

export type SecurityLevel = 'safe' | 'low' | 'medium' | 'high';

export interface SecurityIssue {
  level: SecurityLevel;
  code: string;
  message: string;
  snippet?: string;
}

export interface SecurityReport {
  passed: boolean;
  riskLevel: SecurityLevel;
  issues: SecurityIssue[];
  recommendations: string[];
  durationMs: number;
}

export interface SecurityValidatorOptions {
  additionalForbiddenPatterns?: RegExp[];
  maxComplexityScore?: number;
}

export interface SandboxResourceLimits {
  executionTimeout: number;
  memoryLimitMb: number;
}

export interface SandboxRunOptions {
  context?: Record<string, unknown>;
  args?: Record<string, unknown>;
  environment?: Record<string, string>;
  resourceLimitsOverride?: Partial<SandboxResourceLimits>;
}

export type CodeGenerationPhase = 'total' | 'extraction' | 'dependency' | 'compilation' | 'security' | 'sandbox';

export interface CodeGenerationMetrics {
  phases: Record<CodeGenerationPhase, number>;
  totalMs: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export type CodeGenerationProfilerSnapshot = CodeGenerationMetrics;

export interface ExecutionContext {
  sessionId?: string;
  userId?: string;
  conversationId?: string;
  locale?: string;
  timezone?: string;
  channel?: string;
  metadata?: Record<string, unknown>;
}

export type SkillResultStatus = 'success' | 'error';

export type SkillResultFormat = 'object' | 'text' | 'binary' | 'void' | 'primitive';

export interface StandardSkillResult {
  status: SkillResultStatus;
  format: SkillResultFormat;
  data?: unknown;
  message?: string;
}

export interface ExecutionRequest {
  skillName: string;
  parameters?: Record<string, unknown>;
  context?: ExecutionContext;
  timeout?: number;
  permissions?: SkillPermissionConfig;
}

export interface ExecutionError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
  metadata?: SkillMetadata;
}

export interface SkillExecutionOutcome {
  output: unknown;
  format?: SkillResultFormat;
  status?: SkillResultStatus;
  message?: string;
  securityReport?: SecurityReport;
  profilerMetrics?: CodeGenerationMetrics;
  tokenUsage?: number;
  warnings?: string[];
}

export interface ExecutionMetadata {
  executionTime: number;
  memoryUsage: number;
  tokenUsage: number;
  cacheHit: boolean;
  executionType: SkillExecutionType;
  timestamp: number;
  securityReport?: SecurityReport;
  profilerMetrics?: CodeGenerationMetrics;
}

export interface ExecutionResponse {
  success: boolean;
  result?: StandardSkillResult;
  error?: ExecutionError;
  metadata: ExecutionMetadata;
  warnings?: string[];
}

export interface SkillsExecutor {
  execute(request: ExecutionRequest): Promise<ExecutionResponse>;
  validate(skill: SkillMetadata): Promise<ValidationResult> | ValidationResult;
  getExecutionContext(): ExecutionContext;
  cleanup(): Promise<void>;
}

export interface ExecutorCacheConfig {
  ttlMs: number;
  maxSize: number;
}

export interface SkillMetadataValidationIssue {
  field: string;
  message: string;
}

export interface MetadataLoaderOptions {
  maxMetadataTokens?: number;
  strict?: boolean;
}

export interface SkillsIndexOptions {
  skillsRoot: string;
  metadataProvider?: SkillMetadataProvider;
  defaultSearchLimit?: number;
  defaultConfidenceThreshold?: number;
  caseSensitive?: boolean;
}

export interface SkillsIndexStats {
  totalSkills: number;
  cacheHits: number;
  cacheMisses: number;
  lastIndexedAt?: number;
}

export interface CacheConfig {
  maxSize: number;
  ttl: number;
}

export interface SkillsCacheConfig {
  metadata: CacheConfig;
  content: CacheConfig;
  resources: CacheConfig;
}

export interface SkillsCacheOptions {
  config?: Partial<SkillsCacheConfig>;
}

export interface CacheLevelStats {
  hits: number;
  misses: number;
  size: number;
  capacity: number;
}

export interface SkillsCacheStats {
  metadata: CacheLevelStats;
  content: CacheLevelStats;
  resources: CacheLevelStats;
}

export interface ExecutorStatsSnapshot {
  total: number;
  successful: number;
  failed: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  cacheHits: number;
  cacheMisses: number;
  tokenUsage: number;
  lastExecutionAt?: number;
}

export interface ExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  executorStats: Record<SkillExecutionType, ExecutorStatsSnapshot>;
}

export interface CodeCacheOptions {
  maxSize?: number;
  ttlMs?: number;
}

export interface CodeCacheEntry {
  hash: string;
  compiledAt: number;
  lastUsed: number;
  hitCount: number;
  code: GeneratedSkillCode;
  securityReport: SecurityReport;
  profilerMetrics: CodeGenerationMetrics;
}

export interface CodeCacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  entries: Array<Pick<CodeCacheEntry, 'hash' | 'compiledAt' | 'lastUsed' | 'hitCount'>>;
}

export interface InstructionLoaderOptions {
  maxContentTokens?: number;
}

export interface ResourceLoaderOptions {
  includeScripts?: boolean;
  includeAssets?: boolean;
}

export interface SkillLoadOptions {
  includeContent?: boolean;
  includeResources?: boolean;
  minConfidence?: number;
}

export interface SkillLoadResult {
  metadata: SkillMetadata;
  content?: SkillContent;
  resources?: SkillResources;
}

export interface DependencyManagerOptions {
  allowRelative?: boolean;
  allowedBuiltins?: string[];
  allowedExternal?: string[];
  customResolvers?: Record<string, () => unknown>;
}

export interface DependencyAnalysisOptions {
  skillName?: string;
  skillPath?: string;
}

// 智能预加载相关类型
export interface SkillUsageRecord {
  skillName: string;
  executionCount: number;
  lastExecutedAt: number;
  firstExecutedAt: number;
  averageConfidence: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  cacheHitRate: number;
  requiresResources: boolean;
  executionType: SkillExecutionType;
}

export interface UsagePattern {
  skillName: string;
  frequency: number; // 使用频率 (0-1)
  confidence: number; // 平均置信度
  recency: number; // 最近使用时间 (时间戳)
  requiresResources: boolean;
  priority: number; // 综合优先级分数
}

export interface PreloadStrategy {
  analyzeUsagePatterns(records: SkillUsageRecord[]): UsagePattern[];
  shouldPreload(pattern: UsagePattern, context: PreloadContext): boolean;
  getPreloadPriority(patterns: UsagePattern[]): UsagePattern[];
}

export interface PreloadContext {
  currentLoad: number; // 当前系统负载 (0-1)
  availableMemory: number; // 可用内存 (MB)
  timeSinceLastExecution: number; // 距离上次执行的时间 (ms)
  cacheStats: {
    metadataHitRate: number;
    contentHitRate: number;
    resourceHitRate: number;
  };
}

export interface PreloadConfig {
  enabled: boolean;
  interval: number; // 分析间隔 (ms)
  frequencyThreshold: number; // 频率阈值 (0-1)
  confidenceThreshold: number; // 置信度阈值 (0-1)
  maxSkills: number; // 最多预加载技能数
  lowLoadThreshold: number; // 低负载阈值 (0-1)
  minMemoryMB: number; // 最小可用内存 (MB)
}

export interface PreloadResult {
  skillName: string;
  success: boolean;
  preloaded: {
    metadata: boolean;
    content: boolean;
    resources: boolean;
  };
  error?: string;
  timestamp: number;
}

export interface PreloadStats {
  totalPreloads: number;
  successfulPreloads: number;
  failedPreloads: number;
  preloadHitRate: number; // 预加载命中率
  averagePreloadTime: number;
  lastPreloadAt?: number;
}

// 内存管理相关类型
export interface MemoryStats {
  heapUsed: number; // 已使用的堆内存 (bytes)
  heapTotal: number; // 总堆内存 (bytes)
  external: number; // 外部内存 (bytes)
  rss: number; // 常驻集大小 (bytes)
  availableMemory: number; // 可用内存 (MB)
  memoryUsagePercent: number; // 内存使用百分比 (0-1)
  timestamp: number;
}

export interface MemoryPressureLevel {
  level: 'normal' | 'moderate' | 'high' | 'critical';
  threshold: number; // 触发阈值 (0-1)
  action: string; // 建议采取的行动
}

export interface MemoryCleanupResult {
  cleaned: {
    cacheEntries: number;
    expiredRecords: number;
    unusedResources: number;
  };
  freedMemory: number; // 释放的内存 (bytes)
  duration: number; // 清理耗时 (ms)
  timestamp: number;
}

export interface MemoryManagerConfig {
  enabled: boolean;
  monitoringInterval: number; // 监控间隔 (ms)
  normalThreshold: number; // 正常阈值 (0-1)
  moderateThreshold: number; // 中等压力阈值 (0-1)
  highThreshold: number; // 高压力阈值 (0-1)
  criticalThreshold: number; // 严重压力阈值 (0-1)
  maxMemoryMB: number; // 最大内存限制 (MB)
  autoCleanup: boolean; // 自动清理
  cleanupInterval: number; // 清理间隔 (ms)
  aggressiveCleanup: boolean; // 激进清理模式
}

export interface MemoryManagerStats {
  currentStats: MemoryStats;
  pressureLevel: MemoryPressureLevel;
  totalCleanups: number;
  totalFreedMemory: number;
  averageCleanupTime: number;
  lastCleanupAt?: number;
  cleanupHistory: MemoryCleanupResult[];
}
