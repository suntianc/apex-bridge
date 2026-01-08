import { LLMManager } from '../core/LLMManager';
import { ApexLLMAdapter } from '../core/ace/ApexLLMAdapter';
import { ConfigService } from './ConfigService';
import { LLMConfigService } from './LLMConfigService';
import { PathService } from './PathService';
import { AceCore, Trajectory, ReflectionTrigger } from '../core/ace/AceCore';
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
    private engine: AceCore | null = null;
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
        logger.debug('Initializing local AceCore...');

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
            logger.debug(`[ACE] Using evolution model: ${evolutionModel.providerName}/${evolutionModel.modelKey}`);

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

            // 4. Instantiate AceCore with unified storage config
            this.engine = new AceCore({
                agentId: 'apex-bridge-001',
                reflectionCycleInterval: 60000,
                maxSessionAge: 24 * 60 * 60 * 1000, // 24小时
                storage: {
                    mode: 'memory' // 使用内存存储，本地化实现
                },
                memory: {
                    provider: 'memory' // 本地内存存储
                },
                llm: {
                    driver: llmAdapter
                },
                reflectionTrigger: {
                    predictionErrorThreshold: 0.3,
                    loopDetectionWindow: 5,
                    loopDetectionThreshold: 0.8,
                    stagnationTimeWindow: 5 * 60 * 1000,
                    stagnationProgressThreshold: 0.01,
                    maxTokens: 100000,
                    maxSteps: 100,
                    maxTime: 30 * 60 * 1000,
                    cooldownMs: 30 * 1000,
                    contextWindowThreshold: 0.8
                }
            });

            // 5. Register tools (keep existing tool registration logic if any)
            // Example placeholder – replace with real tools as needed
            // this.engine.registerTool({ name: 'web_search', ... });

            // 5. Bind engine events for logging / monitoring
            this.bindEvents();

            // 6. Start the engine – this will initialize all storages, scheduler, etc.
            const memBefore = process.memoryUsage();
            logger.debug(`[Memory] Before AceCore start - RSS: ${Math.round(memBefore.rss / 1024 / 1024)}MB, Heap: ${Math.round(memBefore.heapUsed / 1024 / 1024)}MB`);

            await this.engine.start();

            const memAfter = process.memoryUsage();
            logger.debug(`[Memory] After AceCore start - RSS: ${Math.round(memAfter.rss / 1024 / 1024)}MB, Heap: ${Math.round(memAfter.heapUsed / 1024 / 1024)}MB`);
            logger.debug(`[Memory] AceCore memory delta - RSS: +${Math.round((memAfter.rss - memBefore.rss) / 1024 / 1024)}MB, Heap: +${Math.round((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024)}MB`);

            this.validateConfig();
            logger.debug('AceCore initialized');
        } catch (error: any) {
            logger.error(`❌ Failed to initialize AceCore: ${error.message}`);
            this.engine = null;
        } finally {
            this.isInitializing = false;
        }
    }

    private bindEvents() {
        if (!this.engine) return;

        // 🆕 本地化AceCore使用EventEmitter总线系统进行事件通信
        // 通过总线系统监听特定层级的事件

        // 🆕 监听全局策略层的反思触发
        this.engine.bus.northbound.on('GLOBAL_STRATEGY', (packet: any) => {
            // 检查是否包含反思触发信息
            if (packet.data?.trigger) {
                const trigger = packet.data.trigger as ReflectionTrigger;
                this.handleReflectionTrigger(trigger);
            }
        });

        // 🆕 监听任务执行层的反思触发
        this.engine.bus.northbound.on('TASK_PROSECUTION', (packet: any) => {
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
        logger.debug(`[ACE] Reflection: ${trigger.type}`);

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

    public getEngine(): AceCore | null {
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
    public getAgent(): AceCore | null {
        return this.getEngine();
    }
    private validateConfig(): void {
        if (!this.engine) {
            logger.warn('[ACE] Engine not initialized, cannot validate config');
            return;
        }

        // 检查AceCore是否已启动
        if (this.engine.isStarted()) {
            logger.debug('[ACE] Scheduler running');
        } else {
            logger.warn('[ACE] ⚠️ AceCore scheduler is not running');
        }

        // 验证反思触发器配置
        const reflectionValidation = this.validateReflectionTriggerConfig();
        if (!reflectionValidation.valid) {
            logger.error(`[ACE] Reflection trigger config validation failed: ${reflectionValidation.errors.join(', ')}`);
        } else if (reflectionValidation.warnings.length > 0) {
            logger.warn(`[ACE] Reflection trigger config warnings: ${reflectionValidation.warnings.join(', ')}`);
        } else {
            logger.debug('[ACE] Reflection trigger config validated');
        }

        // 检查配置是否正确传递
        logger.debug('[ACE] Configuration validated');
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
            errors.push('AceCore not initialized');
            return { valid: false, errors, warnings };
        }

        // 检查AceCore是否已启动
        try {
            if (!this.engine.isStarted()) {
                warnings.push('AceCore scheduler not started - reflection cycle may not work');
            }

            // 检查配置是否正确传递
            const config = this.engine.getConfig();
            if (!config.agentId) {
                errors.push('AgentId not configured');
            }

            // 检查总线是否可用
            if (!this.engine.bus) {
                errors.push('Bus not available');
            }
        } catch (error: any) {
            errors.push(`AceCore validation failed: ${error.message}`);
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
     * 在本地化AceCore中，evolution 直接保存轨迹数据并触发反思事件。
     * 调度器会在 reflection cycle 时自动处理这些轨迹数据。
     */
    public async evolve(trajectory: Trajectory): Promise<void> {
        if (!this.engine) {
            logger.warn('[ACE] Cannot trigger evolution: engine not initialized');
            return;
        }

        try {
            // 使用AceCore的evolve方法
            await this.engine.evolve(trajectory);

            logger.debug(`[ACE] Trajectory evolved for task: ${trajectory.task_id}`);
        } catch (error: any) {
            logger.error(`[ACE] Failed to evolve trajectory: ${error.message}`);
            throw error;
        }
    }
}
