import { AceEngine, Trajectory, ReflectionTrigger } from 'ace-engine-core';
import { LLMManager } from '../core/LLMManager';
import { ApexLLMAdapter } from '../core/ace/ApexLLMAdapter';
import { ConfigService } from './ConfigService';
import { LLMConfigService } from './LLMConfigService';
import { PathService } from './PathService';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs';

interface ReflectionTriggerStats {
    count: number;
    lastTriggered: number;
    triggersByType: Map<string, number>;
}

export class AceService {
    private static instance: AceService;
    private engine: AceEngine | null = null;
    private llmManager: LLMManager;
    private configService: ConfigService;
    private llmConfigService: LLMConfigService;
    private isInitializing: boolean = false;
    // 🆕 反思触发统计
    private reflectionTriggerStats: Map<string, ReflectionTriggerStats> = new Map();

    private constructor() {
        this.llmManager = new LLMManager();
        this.configService = ConfigService.getInstance();
        this.llmConfigService = LLMConfigService.getInstance();
    }

    public static getInstance(): AceService {
        if (!AceService.instance) {
            AceService.instance = new AceService();
        }
        return AceService.instance;
    }

    /**
     * Initialize ACE Engine
     */
    async initialize(): Promise<void> {
        if (this.engine || this.isInitializing) return;

        this.isInitializing = true;
        logger.info('🚀 Initializing ACE Engine...');

        try {
            // 1. Prepare storage configuration (使用 PathService 统一管理路径)
            const pathService = PathService.getInstance();
            const dataDir = path.join(pathService.getDataDir(), 'ace');
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            // 2. Resolve evolution model from DB (via LLMConfigService)
            const evolutionModel = this.llmConfigService.getAceEvolutionModel();
            if (!evolutionModel) {
                logger.warn('[ACE] No ACE evolution model configured. Engine will be disabled.');
                return;
            }
            logger.info(`[ACE] Using evolution model: ${evolutionModel.providerName}/${evolutionModel.modelKey}`);

            // 3. Create LLM adapter (Dual‑Channel strategy)
            const llmAdapter = new ApexLLMAdapter(this.llmManager, {
                executionModelGetter: () => ({
                    provider: evolutionModel.provider,
                    model: evolutionModel.modelKey
                }),
                evolutionModel: {
                    provider: evolutionModel.provider,
                    model: evolutionModel.modelKey
                }
            });

            // 4. Instantiate AceEngine with unified storage config
            this.engine = new AceEngine({
                agentId: 'apex-bridge-001',
                storage: {
                    mode: 'composite',
                    sqlitePath: path.join(dataDir, 'trajectory.db'),
                    logsPath: path.join(dataDir, 'logs.db'),
                },
                cache: {
                    type: 'memory', // 使用内存缓存，如需 Redis 可改为 'redis' 并配置 redisUrl
                    // redisUrl: 'redis://localhost:6379' // 如果使用 Redis，取消注释并配置
                },
                memory: {
                    provider: 'chroma',
                    endpoint: 'http://localhost:8000',
                    collectionPrefix: 'apex_bridge'
                },
                llm: {
                    driver: llmAdapter,
                    // modelMap 可选：为不同层级指定不同模型
                    // modelMap: {
                    //     aspirational: 'gpt-4',
                    //     task_prosecution: 'gpt-3.5-turbo'
                    // }
                },
                reflectionTrigger: {
                    // 预测误差阈值：当预期状态与实际状态差异超过此值时触发反思
                    predictionErrorThreshold: 0.3,  // 0-1 之间，默认 0.3
                    // 循环检测配置
                    loopDetectionWindow: 5,          // 检测最近 N 次行动，默认 5
                    loopDetectionThreshold: 0.8,    // 相似度阈值，默认 0.8
                    // 停滞检测配置
                    stagnationTimeWindow: 5 * 60 * 1000,      // 时间窗口（毫秒），默认 5 分钟
                    stagnationProgressThreshold: 0.01,        // 进度变化阈值，默认 0.01
                    // 资源耗尽阈值
                    maxTokens: 100000,              // 最大 Token 数，默认 100000
                    maxSteps: 100,                  // 最大步骤数，默认 100
                    maxTime: 30 * 60 * 1000,        // 最大时间（毫秒），默认 30 分钟
                    // Cooldown 配置：防止过度反思
                    cooldownMs: 30 * 1000,          // 冷却时间（毫秒），默认 30 秒
                    // 上下文窗口阈值：当上下文窗口使用率超过此值时触发记忆压缩
                    contextWindowThreshold: 0.8     // 0-1 之间，默认 0.8
                },
                // 在 AceService.initialize() 中
                // reflectionTrigger: {
                //     predictionErrorThreshold: parseFloat(
                //         process.env.ACE_PREDICTION_ERROR_THRESHOLD || '0.3'
                //     ),
                //     loopDetectionWindow: parseInt(
                //         process.env.ACE_LOOP_DETECTION_WINDOW || '5'
                //     ),
                //     loopDetectionThreshold: parseFloat(
                //         process.env.ACE_LOOP_DETECTION_THRESHOLD || '0.8'
                //     ),
                //     stagnationTimeWindow: parseInt(
                //         process.env.ACE_STAGNATION_TIME_WINDOW || String(5 * 60 * 1000)
                //     ),
                //     stagnationProgressThreshold: parseFloat(
                //         process.env.ACE_STAGNATION_PROGRESS_THRESHOLD || '0.01'
                //     ),
                //     maxTokens: parseInt(
                //         process.env.ACE_MAX_TOKENS || '100000'
                //     ),
                //     maxSteps: parseInt(
                //         process.env.ACE_MAX_STEPS || '100'
                //     ),
                //     maxTime: parseInt(
                //         process.env.ACE_MAX_TIME || String(30 * 60 * 1000)
                //     ),
                //     cooldownMs: parseInt(
                //         process.env.ACE_COOLDOWN_MS || String(30 * 1000)
                //     ),
                //     contextWindowThreshold: parseFloat(
                //         process.env.ACE_CONTEXT_WINDOW_THRESHOLD || '0.8')
                //     }
            });

            // 5. Register tools (keep existing tool registration logic if any)
            // Example placeholder – replace with real tools as needed
            // this.engine.registerTool({ name: 'web_search', ... });

            // 6. Bind engine events for logging / monitoring
            this.bindEvents();

            // 7. Start the engine – this will initialize all storages, scheduler, etc.
            const memBefore = process.memoryUsage();
            logger.info(`[Memory] Before ACE Engine start - RSS: ${Math.round(memBefore.rss / 1024 / 1024)}MB, Heap: ${Math.round(memBefore.heapUsed / 1024 / 1024)}MB`);

            await this.engine.start();

            const memAfter = process.memoryUsage();
            logger.info(`[Memory] After ACE Engine start - RSS: ${Math.round(memAfter.rss / 1024 / 1024)}MB, Heap: ${Math.round(memAfter.heapUsed / 1024 / 1024)}MB`);
            logger.info(`[Memory] ACE Engine memory delta - RSS: +${Math.round((memAfter.rss - memBefore.rss) / 1024 / 1024)}MB, Heap: +${Math.round((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024)}MB`);

            this.validateConfig();
            logger.info('✅ ACE Engine initialized and started successfully');
        } catch (error: any) {
            logger.error(`❌ Failed to initialize ACE Engine: ${error.message}`);
            this.engine = null;
        } finally {
            this.isInitializing = false;
        }
    }

    private bindEvents() {
        if (!this.engine) return;

        // 新版 ACE Engine 使用总线系统（BusManager）进行事件通信
        // 可以通过总线系统监听特定层级的事件
        // 注意：新版架构中不再有 'evolved'、'reflected'、'error' 等直接事件
        // 这些功能由调度器（CognitiveScheduler）和层级系统内部处理

        // 🆕 监听全局策略层的反思触发
        // 使用字符串常量来避免类型导入问题
        this.engine.bus.northbound.on('GLOBAL_STRATEGY' as any, (packet: any) => {
            // 检查是否包含反思触发信息
            if (packet.data?.trigger) {
                const trigger = packet.data.trigger as ReflectionTrigger;
                this.handleReflectionTrigger(trigger);
            }
        });

        // 🆕 监听任务执行层的反思触发
        this.engine.bus.northbound.on('TASK_PROSECUTION' as any, (packet: any) => {
            if (packet.data?.trigger) {
                const trigger = packet.data.trigger as ReflectionTrigger;
                this.handleReflectionTrigger(trigger);
            }
        });

        logger.debug('[ACE] Reflection trigger event listeners bound');
    }

    /**
     * 🆕 处理反思触发事件
     */
    private handleReflectionTrigger(trigger: ReflectionTrigger): void {
        // 记录日志
        logger.info(`[ACE] Reflection triggered: ${trigger.type} at level ${trigger.level}`, {
            sessionId: trigger.sessionId,
            traceId: trigger.traceId,
            timestamp: trigger.timestamp,
            context: trigger.context
        });

        // 记录统计
        this.recordReflectionTrigger(trigger);

        // 发送通知（可选）
        this.notifyReflectionTrigger(trigger);
    }

    /**
     * 🆕 通知反思触发（可选：通过 EventBus 或其他机制）
     */
    private notifyReflectionTrigger(trigger: ReflectionTrigger): void {
        // 可以通过 EventBus 发送事件，供其他服务监听
        // 例如：WebSocket 服务可以监听此事件并推送给前端
        // EventBus.getInstance().emit('reflection:triggered', trigger);

        // 目前仅记录日志，后续可以扩展为 WebSocket 推送
        logger.debug(`[ACE] Reflection trigger notification: ${trigger.type} for session ${trigger.sessionId}`);
    }

    /**
     * 🆕 记录反思触发统计
     */
    private recordReflectionTrigger(trigger: ReflectionTrigger): void {
        const sessionId = trigger.sessionId || 'global';
        const stats = this.reflectionTriggerStats.get(sessionId) || {
            count: 0,
            lastTriggered: 0,
            triggersByType: new Map<string, number>()
        };

        stats.count++;
        stats.lastTriggered = trigger.timestamp;
        const typeCount = stats.triggersByType.get(trigger.type) || 0;
        stats.triggersByType.set(trigger.type, typeCount + 1);

        this.reflectionTriggerStats.set(sessionId, stats);
    }

    /**
     * 🆕 获取反思触发统计
     * @param sessionId 会话ID（可选，不提供则返回所有会话的统计）
     * @returns 统计信息
     */
    public getReflectionTriggerStats(sessionId?: string): any {
        if (sessionId) {
            const stats = this.reflectionTriggerStats.get(sessionId);
            if (!stats) {
                return null;
            }
            // 转换 Map 为普通对象以便序列化
            return {
                count: stats.count,
                lastTriggered: stats.lastTriggered,
                triggersByType: Object.fromEntries(stats.triggersByType)
            };
        }
        // 返回所有会话的统计
        const result: Record<string, any> = {};
        for (const [sid, stats] of this.reflectionTriggerStats.entries()) {
            result[sid] = {
                count: stats.count,
                lastTriggered: stats.lastTriggered,
                triggersByType: Object.fromEntries(stats.triggersByType)
            };
        }
        return result;
    }

    public getEngine(): AceEngine | null {
        return this.engine;
    }

    /**
     * 🆕 检查ACE引擎是否已启用
     */
    public isEnabled(): boolean {
        return !!this.engine;
    }

    /**
     * @deprecated 使用 getEngine() 替代
     * 向后兼容方法：返回引擎实例
     */
    public getAgent(): AceEngine | null {
        return this.getEngine();
    }
    private validateConfig(): void {
        if (!this.engine) {
            logger.warn('[ACE] Engine not initialized, cannot validate config');
            return;
        }

        // 检查引擎是否包含 sessionManager
        if (this.engine.sessionManager) {
            logger.info('[ACE] ✅ SessionManager is available');
        } else {
            logger.warn('[ACE] ⚠️ SessionManager is not available');
        }

        // 验证反思触发器配置
        const reflectionValidation = this.validateReflectionTriggerConfig();
        if (!reflectionValidation.valid) {
            logger.error(`[ACE] Reflection trigger config validation failed: ${reflectionValidation.errors.join(', ')}`);
        } else if (reflectionValidation.warnings.length > 0) {
            logger.warn(`[ACE] Reflection trigger config warnings: ${reflectionValidation.warnings.join(', ')}`);
        } else {
            logger.info('[ACE] ✅ Reflection trigger config validated');
        }

        // 检查配置是否正确传递
        logger.info('[ACE] Configuration validated');
    }

    /**
     * 验证反思触发器配置
     * @returns 验证结果
     */
    public validateReflectionTriggerConfig(): {
        valid: boolean;
        errors: string[];
        warnings: string[];
    } {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!this.engine) {
            errors.push('ACE Engine not initialized');
            return { valid: false, errors, warnings };
        }

        // 注意：由于 config 是 private，我们无法直接访问
        // 这里我们通过检查引擎是否正常工作来间接验证
        // 实际配置验证应该在 AceEngine 构造函数中进行

        // 检查引擎是否已启动（间接验证配置）
        try {
            // 如果引擎有 sessionManager，说明基本配置正确
            if (!this.engine.sessionManager) {
                warnings.push('SessionManager not available - session isolation may not work');
            }

            // 检查存储是否可用
            if (!this.engine.storage) {
                errors.push('Storage not available');
            }

            // 检查总线是否可用
            if (!this.engine.bus) {
                errors.push('Bus not available');
            }
        } catch (error: any) {
            errors.push(`Engine validation failed: ${error.message}`);
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
    /**
     * Trigger evolution asynchronously
     * 
     * 在新版 ACE Engine 中，evolution 由内部调度器自动处理。
     * 此方法将轨迹数据保存到存储中，调度器会在 reflection cycle 时自动处理。
     * 
     * 注意：由于新版 ACE Engine 的架构变化，轨迹数据暂时保存到 kv_store 中。
     * 调度器会在定期 reflection cycle 时读取并处理这些轨迹数据。
     */
    public async evolve(trajectory: Trajectory): Promise<void> {
        if (!this.engine) {
            logger.warn('[ACE] Cannot trigger evolution: engine not initialized');
            return;
        }

        try {
            // 将轨迹数据保存到 kv_store，调度器会在 reflection cycle 时自动处理
            const trajectoryKey = `trajectory:${trajectory.task_id}`;
            const trajectoryData = JSON.stringify(trajectory);

            // 使用 SQLite 存储保存轨迹（通过类型断言访问私有属性）
            // 注意：这是临时方案，理想情况下应该在 SQLiteStorage 中添加公共方法
            const sqliteStorage = this.engine.storage.sqlite as any;
            if (sqliteStorage && sqliteStorage.db) {
                sqliteStorage.db.prepare(`
                    INSERT INTO kv_store (key, value)
                    VALUES (?, ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value
                `).run(trajectoryKey, trajectoryData);

                logger.debug(`[ACE] Trajectory saved for evolution: ${trajectory.task_id}`);
            } else {
                logger.warn('[ACE] SQLite storage not available, trajectory not saved');
            }
        } catch (error: any) {
            logger.error(`[ACE] Failed to save trajectory: ${error.message}`);
            // 不抛出错误，避免影响主流程
            logger.debug(`[ACE] Trajectory data: ${JSON.stringify(trajectory).substring(0, 100)}...`);
        }
    }
}
