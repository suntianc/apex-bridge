/**
 * ProactivityScheduler - 主动性调度系统核心类
 * 负责管理主动场景、触发判断、生成消息并发送
 */

import * as schedule from 'node-schedule';
import { 
  ProactivitySchedulerConfig, 
  ProactiveScene, 
  ProactiveContext,
  ProactiveMessage
} from '../types/proactivity';
import { PersonalityConfig } from '../types/personality';
import { TriggerHub } from './TriggerHub';
import { EvaluationEngine } from './EvaluationEngine';
import { PolicyGuard } from './PolicyGuard';
import { logger } from '../utils/logger';

export class ProactivityScheduler {
  private config: Required<Omit<ProactivitySchedulerConfig, 'personalityEngine' | 'emotionEngine' | 'memoryService' | 'chatService' | 'eventBus'>> & {
    personalityEngine?: any;
    emotionEngine?: any;
    memoryService?: any;
    chatService?: any;
    eventBus?: any;
  };
  
  private triggerHub: TriggerHub;
  private evaluationEngine: EvaluationEngine;
  private policyGuard: PolicyGuard;
  
  private scenes: Map<string, ProactiveScene> = new Map();
  private scheduledJobs: Map<string, schedule.Job> = new Map();
  private isRunning: boolean = false;
  
  // Phase 2: 随机触发和状态检查
  private randomTriggerTimer: NodeJS.Timeout | null = null;
  private stateCheckTimer: NodeJS.Timeout | null = null;
  private lastInteractionTime: Map<string, number> = new Map();
  private negativeEmotionStartTime: Map<string, number> = new Map();

  constructor(config?: ProactivitySchedulerConfig) {
    this.config = {
      enabled: config?.enabled ?? true,
      timezone: config?.timezone ?? 'Asia/Taipei',
      quietWindow: {
        start: config?.quietWindow?.start ?? '22:00',
        end: config?.quietWindow?.end ?? '08:00'
      },
      workdayHours: {
        start: config?.workdayHours?.start ?? '09:00',
        end: config?.workdayHours?.end ?? '20:00'
      },
      maxDailyMessages: config?.maxDailyMessages ?? 1,
      actionThreshold: config?.actionThreshold ?? 0.62, // Phase 2标准阈值
      debounceMs: config?.debounceMs ?? 30 * 60 * 1000,
      personalityEngine: config?.personalityEngine,
      emotionEngine: config?.emotionEngine,
      memoryService: config?.memoryService,
      chatService: config?.chatService,
      eventBus: config?.eventBus
    };

    // 初始化核心组件
    this.triggerHub = new TriggerHub({
      debounceMs: this.config.debounceMs,
      timezone: this.config.timezone,
      quietWindow: this.config.quietWindow
    });

    this.evaluationEngine = new EvaluationEngine({
      actionThreshold: this.config.actionThreshold // 0.62（Phase 2标准）
    });

    this.policyGuard = new PolicyGuard({
      maxDailyMessages: this.config.maxDailyMessages,
      enabled: this.config.enabled
    });

    logger.info('✅ ProactivityScheduler initialized', {
      enabled: this.config.enabled,
      timezone: this.config.timezone,
      maxDailyMessages: this.config.maxDailyMessages
    });
  }

  /**
   * 注册场景
   */
  registerScene(scene: ProactiveScene): void {
    if (!scene.id || !scene.name) {
      throw new Error('Scene must have id and name');
    }

    this.scenes.set(scene.id, {
      ...scene,
      enabled: scene.enabled ?? true,
      priority: scene.priority ?? 0
    });

    logger.info(`✅ Scene registered: ${scene.id} (${scene.name})`);

    // 如果是定时触发场景，注册定时任务
    if (scene.trigger === 'schedule' && scene.schedule) {
      this.scheduleScene(scene.id, scene.schedule);
    }
  }

  /**
   * 为场景注册定时任务
   */
  private scheduleScene(sceneId: string, cronExpression: string): void {
    // 取消已存在的任务
    if (this.scheduledJobs.has(sceneId)) {
      this.scheduledJobs.get(sceneId)?.cancel();
    }

    const job = schedule.scheduleJob(cronExpression, async () => {
      if (!this.isRunning || !this.config.enabled) {
        logger.debug(`⏸️ Scheduler not running or disabled, skipping scheduled trigger: ${sceneId}`);
        return;
      }

      try {
        logger.debug(`⏰ Scheduled trigger fired for scene: ${sceneId}`);
        // 定时触发时，对于schedule类型的场景，如果不在触达窗内，应该跳过
        // 但对于生日/纪念日提醒，即使不在触达窗也应该检查（因为可能有关键提醒）
        const scene = this.scenes.get(sceneId);
        const isReminderScene = sceneId === 'birthday_reminder' || sceneId === 'anniversary_reminder';
        // 提醒类场景跳过触达窗检查，其他schedule场景遵守触达窗
        await this.trigger(sceneId, undefined, { skipChecks: isReminderScene });
      } catch (error: any) {
        logger.error(`❌ Failed to trigger scene ${sceneId}:`, error);
      }
    });

    if (job) {
      this.scheduledJobs.set(sceneId, job);
      logger.info(`✅ Scene scheduled: ${sceneId} (${cronExpression})`);
    } else {
      logger.warn(`⚠️ Failed to schedule scene: ${sceneId} (invalid cron: ${cronExpression})`);
    }
  }

  /**
   * 启动调度器
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('⚠️ ProactivityScheduler is already running');
      return;
    }

    if (!this.config.enabled) {
      logger.info('ℹ️ ProactivityScheduler is disabled, not starting');
      return;
    }

    this.isRunning = true;
    logger.info('✅ ProactivityScheduler started');

    // 监听事件触发（如果配置了EventBus）
    if (this.config.eventBus) {
      this.setupEventListeners();
    }
    
    // Phase 2: 启动随机触发和状态检查
    this.startRandomTrigger();
    this.startStateCheck();
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // 取消所有定时任务
    for (const [sceneId, job] of this.scheduledJobs.entries()) {
      job.cancel();
      logger.debug(`⏸️ Scene schedule cancelled: ${sceneId}`);
    }
    this.scheduledJobs.clear();

    // Phase 2: 停止随机触发和状态检查
    this.stopRandomTrigger();
    this.stopStateCheck();

    logger.info('⏸️ ProactivityScheduler stopped');
  }

  /**
   * 触发场景（手动或事件驱动）
   */
  async trigger(sceneId: string, context?: ProactiveContext, options?: { skipChecks?: boolean }): Promise<void> {
    if (!this.isRunning || !this.config.enabled) {
      logger.debug(`⏸️ ProactivityScheduler is not running or disabled`);
      return;
    }

    const scene = this.scenes.get(sceneId);
    if (!scene) {
      logger.warn(`⚠️ Scene not found: ${sceneId}`);
      return;
    }

    // 检查场景是否启用
    if (!this.policyGuard.isEnabled(sceneId)) {
      logger.debug(`⏸️ Scene is disabled: ${sceneId}`);
      return;
    }

    const skipChecks = options?.skipChecks || false;

    // 检查触发防抖（手动触发时可以跳过）
    if (!skipChecks && !this.triggerHub.shouldTrigger(sceneId)) {
      logger.debug(`⏸️ Trigger skipped: debounced (${sceneId})`);
      return;
    }

    // 检查静音窗（手动触发时可以跳过）
    if (!skipChecks && this.triggerHub.isInQuietWindow()) {
      logger.debug(`⏸️ Trigger skipped: in quiet window (${sceneId})`);
      return;
    }

    // Phase 2: 增强场景判断逻辑
    // 1. 检查触达窗（工作日）- 对于schedule和random类型（手动触发时可以跳过）
    if (!skipChecks && (scene.trigger === 'schedule' || scene.trigger === 'random') && !this.triggerHub.isInDeliveryWindow()) {
      logger.debug(`⏸️ Trigger skipped: outside delivery window (${sceneId})`);
      return;
    }

    // Phase 2: 增强场景判断逻辑
    // 2. 对于condition类型，先检查条件函数
    if (scene.trigger === 'condition' && scene.condition) {
      const testContext = this.buildEnhancedContext(context, scene);
      
      try {
        const conditionMet = scene.condition(testContext);
        if (!conditionMet) {
          logger.debug(`⏸️ Condition not met for scene: ${sceneId}`);
          return;
        }
        logger.debug(`✅ Condition met for scene: ${sceneId}`);
      } catch (error: any) {
        logger.error(`❌ Error evaluating condition for scene ${sceneId}:`, error);
        return;
      }
    }

    // 3. 对于event类型，检查事件类型匹配
    if (scene.trigger === 'event') {
      const eventType = context?.metadata?.eventType;
      const expectedEventType = scene.metadata?.eventType;
      
      if (expectedEventType && eventType !== expectedEventType) {
        logger.debug(`⏸️ Event type mismatch for scene: ${sceneId} (expected: ${expectedEventType}, got: ${eventType})`);
        return;
      }
    }

    // Phase 2: 构建增强的上下文（包含更多状态信息）
    const fullContext = this.buildEnhancedContext(context, scene);

    // Phase 2: 从memoryService获取用户记忆信息（如果可用）
    if (this.config.memoryService && fullContext.userId) {
      try {
        // 获取最近的记忆（用于上下文增强）
        const recentMemories = await this.config.memoryService.searchMemories?.(
          fullContext.userId,
          '',
          { limit: 5 }
        );
        if (recentMemories && recentMemories.length > 0) {
          fullContext.metadata = {
            ...fullContext.metadata,
            recentMemories: recentMemories.slice(0, 3) // 只保留最近3条
          };
        }
      } catch (error: any) {
        logger.debug(`⚠️ Failed to load recent memories for context: ${error.message}`);
      }
    }

    // 获取人格配置
    let personality: PersonalityConfig | undefined;
    if (this.config.personalityEngine) {
      try {
        personality = this.config.personalityEngine.loadPersonality('default');
      } catch (error: any) {
        logger.warn(`⚠️ Failed to load personality: ${error.message}`);
      }
    }

    // 如果没有人格配置，创建一个基本的fallback
    if (!personality) {
      personality = {
        identity: { name: 'AI助手' },
        traits: { core: ['友好', '专业'] },
        style: { tone: '友好', address: '您', emojiUsage: 'moderate' }
      };
    }

    // Phase 2: 评估场景（增强版）
    const scores = await this.evaluationEngine.evaluateScenes([scene], fullContext);
    const topScore = scores[0];

    // 判断是否应该执行（使用0.62阈值）
    // 注意：事件触发的场景（如关怀提醒）即使评分略低也应该执行，因为这是用户主动触发的
    // 手动触发时（skipChecks=true），也应该降低阈值，因为这是用户主动触发的
    const isEventTriggered = scene.trigger === 'event';
    const isManualTrigger = skipChecks === true;
    const isReminderScene = sceneId === 'birthday_reminder' || sceneId === 'anniversary_reminder';
    
    // 事件触发或手动触发时，使用更低的阈值（0.5）
    // 提醒类场景手动触发时，也应该使用更低的阈值
    let effectiveThreshold = this.config.actionThreshold;
    if (isEventTriggered || (isManualTrigger && isReminderScene)) {
      effectiveThreshold = 0.5;
    }
    
    if (topScore.score < effectiveThreshold) {
      logger.info(`⏸️ Scene score too low: ${sceneId} (${topScore.score.toFixed(2)} < ${effectiveThreshold.toFixed(2)}${isEventTriggered ? ' [event-triggered]' : isManualTrigger ? ' [manual-trigger]' : ''})`);
      logger.debug(`   Score breakdown: ${topScore.reason}`);
      return;
    }
    
    logger.info(`✅ Scene passed evaluation: ${sceneId} (score: ${topScore.score.toFixed(2)}, threshold: ${effectiveThreshold.toFixed(2)}${isEventTriggered ? ' [event-triggered]' : isManualTrigger ? ' [manual-trigger]' : ''})`);
    logger.debug(`   Score breakdown: ${topScore.reason}`);

    // 检查频次限制（手动触发时可以跳过）
    if (!skipChecks && !this.policyGuard.canSendMessage(fullContext.userId)) {
      logger.info(`⏸️ Daily message limit reached for user: ${fullContext.userId}`);
      return;
    }

    // 生成消息
    try {
      const message = await scene.generateMessage(fullContext, personality);
      
      // 如果消息为空（例如，没有提醒需要发送），则不触发
      if (!message || message.trim() === '') {
        logger.info(`⏸️ Scene ${sceneId} generated empty message, skipping`);
        logger.debug(`   Context: userId=${fullContext.userId}, sceneId=${sceneId}, trigger=${scene.trigger}`);
        // 对于生日/纪念日提醒，如果返回空消息，说明没有即将到来的提醒
        if (sceneId === 'birthday_reminder' || sceneId === 'anniversary_reminder') {
          logger.info(`💡 No upcoming reminders found for ${sceneId} (userId: ${fullContext.userId})`);
        }
        return;
      }
      
      logger.debug(`✅ Scene ${sceneId} generated message (length: ${message.length})`);
      
      // Phase 2: 记录话题（用于多样性惩罚）
      this.evaluationEngine.recordTopic(sceneId);
      
      // Phase 2: 记录用户互动（用于状态检查）
      this.recordUserInteraction(fullContext.userId);

      // 创建主动消息对象
      const proactiveMessage: ProactiveMessage = {
        sceneId: sceneId,
        content: message,
        userId: fullContext.userId,
        timestamp: Date.now(),
        personality: personality,
        metadata: {
          score: topScore.score,
          reason: topScore.reason
        }
      };

      // 发送消息（通过ChatService或EventBus）
      await this.deliverMessage(proactiveMessage);

      logger.info(`✅ Proactive message sent: ${sceneId} (score: ${topScore.score.toFixed(2)})`);

    } catch (error: any) {
      logger.error(`❌ Failed to generate message for scene ${sceneId}:`, error);
    }
  }

  /**
   * 发送主动消息
   */
  private async deliverMessage(message: ProactiveMessage): Promise<void> {
    // 方式1：通过ChatService发送（如果配置了）
    if (this.config.chatService) {
      // TODO: 实现通过ChatService发送主动消息的逻辑
      // 这可能需要在ChatService中添加一个sendProactiveMessage方法
      logger.debug(`📤 Delivering proactive message via ChatService: ${message.sceneId}`);
    }

    // 方式2：通过EventBus发布事件（如果配置了）
    if (this.config.eventBus) {
      this.config.eventBus.publish('proactive:message', message);
      logger.debug(`📢 Proactive message published to EventBus: ${message.sceneId}`);
    }

    // 方式3：直接记录日志（如果没有其他方式）
    if (!this.config.chatService && !this.config.eventBus) {
      logger.info(`📨 Proactive Message [${message.sceneId}]: ${message.content}`);
    }
  }

  /**
   * 设置事件监听器（Phase 2增强）
   * 监听各种事件并触发相应的主动场景
   */
  private setupEventListeners(): void {
    if (!this.config.eventBus) {
      logger.debug('⚠️ EventBus not available, skipping event listeners setup');
      return;
    }

    // 监听新文档事件 - 可以触发文档分析场景
    this.config.eventBus.subscribe('memory:new_document', (data: any) => {
      logger.info('📡 Event received: memory:new_document', { userId: data?.userId, contentLength: data?.content?.length || 0 });
      
      // 查找事件触发的场景（trigger === 'event' 且 metadata.eventType === 'memory:new_document'）
      const eventScenes = Array.from(this.scenes.values()).filter(
        scene => scene.trigger === 'event' && 
        scene.metadata?.eventType === 'memory:new_document' &&
        this.policyGuard.isEnabled(scene.id)
      );
      
      logger.debug(`🔍 Found ${eventScenes.length} event scene(s) for memory:new_document:`, eventScenes.map(s => s.id));
      
      if (eventScenes.length > 0) {
        logger.info(`🎯 Triggering ${eventScenes.length} event scene(s) for memory:new_document`);
        eventScenes.forEach(scene => {
          // 事件触发的场景不受触达窗限制
          this.trigger(scene.id, {
            userId: data?.userId || 'default',
            metadata: { ...data, eventType: 'memory:new_document' }
          }, { skipChecks: true }).catch(err => logger.error(`❌ Failed to trigger scene ${scene.id}:`, err));
        });
      } else {
        logger.warn(`⚠️ No event scenes found for memory:new_document event`);
      }
    });

    // 监听情感负向事件 - 触发关怀提醒场景
    this.config.eventBus.subscribe('emotion:negative_detected', (data: any) => {
      logger.info('📡 Event received: emotion:negative_detected', { userId: data?.userId, emotion: data?.emotion, intensity: data?.intensity });
      
      // 查找关怀类场景或事件触发的场景
      const careScenes = Array.from(this.scenes.values()).filter(
        scene => (
          (scene.trigger === 'event' && scene.metadata?.eventType === 'emotion:negative_detected') ||
          scene.id.includes('care') || scene.id.includes('comfort')
        ) &&
        this.policyGuard.isEnabled(scene.id)
      );
      
      logger.debug(`🔍 Found ${careScenes.length} care scene(s) for emotion:negative_detected:`, careScenes.map(s => s.id));
      
      if (careScenes.length > 0) {
        logger.info(`🎯 Triggering ${careScenes.length} care scene(s) for negative emotion`);
        careScenes.forEach(scene => {
          // 事件触发的场景不受触达窗限制
          this.trigger(scene.id, {
            userId: data?.userId || 'default',
            emotion: data?.emotion,
            metadata: { ...data, eventType: 'emotion:negative_detected' }
          }, { skipChecks: true }).catch(err => logger.error(`❌ Failed to trigger scene ${scene.id}:`, err));
        });
      } else {
        logger.warn(`⚠️ No care scenes found for emotion:negative_detected event`);
      }
    });

    logger.info('✅ Event listeners set up (Phase 2)');
  }

  /**
   * 启用场景
   */
  enableScene(sceneId: string): void {
    const scene = this.scenes.get(sceneId);
    if (!scene) {
      logger.warn(`⚠️ Scene not found: ${sceneId}`);
      return;
    }

    scene.enabled = true;
    this.policyGuard.enableScene(sceneId);

    // 如果是定时场景，重新注册定时任务
    if (scene.trigger === 'schedule' && scene.schedule) {
      this.scheduleScene(sceneId, scene.schedule);
    }

    logger.info(`✅ Scene enabled: ${sceneId}`);
  }

  /**
   * 禁用场景
   */
  disableScene(sceneId: string): void {
    const scene = this.scenes.get(sceneId);
    if (!scene) {
      logger.warn(`⚠️ Scene not found: ${sceneId}`);
      return;
    }

    scene.enabled = false;
    this.policyGuard.disableScene(sceneId);

    // 取消定时任务
    if (this.scheduledJobs.has(sceneId)) {
      this.scheduledJobs.get(sceneId)?.cancel();
      this.scheduledJobs.delete(sceneId);
    }

    logger.info(`⏸️ Scene disabled: ${sceneId}`);
  }

  /**
   * 获取所有场景
   */
  getScenes(): ProactiveScene[] {
    return Array.from(this.scenes.values());
  }

  /**
   * 获取场景
   */
  getScene(sceneId: string): ProactiveScene | undefined {
    return this.scenes.get(sceneId);
  }

  /**
   * Phase 2: 启动随机触发（泊松过程）
   * λ = 0.15/h（平均约6.7小时一次）
   */
  private startRandomTrigger(): void {
    if (!this.config.enabled) {
      return;
    }

    const LAMBDA = 0.15; // 每小时0.15次
    
    const scheduleNext = () => {
      // 生成泊松过程的间隔时间（指数分布）
      const intervalHours = -Math.log(Math.random()) / LAMBDA;
      const intervalMs = intervalHours * 60 * 60 * 1000;
      
      this.randomTriggerTimer = setTimeout(() => {
        // 检查是否在静音窗或非工作日
        if (this.triggerHub.isInQuietWindow() || !this.triggerHub.isInDeliveryWindow()) {
          logger.debug('⏸️ Random trigger skipped: quiet window or outside delivery window');
          scheduleNext(); // 重新调度
          return;
        }

        // 查找随机触发的场景
        const randomScenes = Array.from(this.scenes.values()).filter(
          scene => scene.trigger === 'random' && this.policyGuard.isEnabled(scene.id)
        );

        if (randomScenes.length > 0) {
          // 随机选择一个场景触发
          const randomScene = randomScenes[Math.floor(Math.random() * randomScenes.length)];
          logger.info(`🎲 Random trigger: ${randomScene.id}`);
          
          this.trigger(randomScene.id, {
            userId: 'default',
            metadata: { triggerType: 'random' }
          }).catch(err => logger.error(`❌ Failed to trigger random scene ${randomScene.id}:`, err));
        }

        scheduleNext(); // 递归调度下一次
      }, intervalMs);

      logger.debug(`🎲 Random trigger scheduled in ${(intervalMs / 1000 / 60).toFixed(1)} minutes`);
    };

    scheduleNext();
    logger.info('✅ Random trigger started (Poisson process, λ=0.15/h)');
  }

  /**
   * Phase 2: 停止随机触发
   */
  private stopRandomTrigger(): void {
    if (this.randomTriggerTimer) {
      clearTimeout(this.randomTriggerTimer);
      this.randomTriggerTimer = null;
      logger.debug('⏸️ Random trigger stopped');
    }
  }

  /**
   * Phase 2: 启动状态检查（定期检查用户状态）
   * 检查长时间无互动、持续负向情绪等
   */
  private startStateCheck(): void {
    if (!this.config.enabled) {
      return;
    }

    // 每30分钟检查一次状态
    const CHECK_INTERVAL_MS = 30 * 60 * 1000;

    this.stateCheckTimer = setInterval(() => {
      if (!this.isRunning || this.triggerHub.isInQuietWindow()) {
        return;
      }

      const now = Date.now();
      const NO_INTERACTION_THRESHOLD = 72 * 60 * 60 * 1000; // 72小时
      const NEGATIVE_EMOTION_THRESHOLD = 48 * 60 * 60 * 1000; // 48小时

      // 检查所有用户的状态
      this.lastInteractionTime.forEach((lastTime, userId) => {
        const hoursSinceInteraction = (now - lastTime) / (1000 * 60 * 60);

        // 检查长时间无互动（≥72小时）
        if (hoursSinceInteraction >= 72) {
          const stateScenes = Array.from(this.scenes.values()).filter(
            scene => scene.trigger === 'condition' && 
            scene.metadata?.conditionType === 'no_interaction' &&
            this.policyGuard.isEnabled(scene.id)
          );

          if (stateScenes.length > 0) {
            logger.info(`🎯 Triggering state scene for no interaction (${hoursSinceInteraction.toFixed(1)}h)`);
            stateScenes.forEach(scene => {
              this.trigger(scene.id, {
                userId: userId,
                metadata: { 
                  conditionType: 'no_interaction',
                  hoursSinceInteraction: hoursSinceInteraction
                }
              }).catch(err => logger.error(`❌ Failed to trigger state scene ${scene.id}:`, err));
            });
          }
        }
      });

      // 检查持续负向情绪（≥48小时）
      this.negativeEmotionStartTime.forEach((startTime, userId) => {
        const hoursSinceNegative = (now - startTime) / (1000 * 60 * 60);

        if (hoursSinceNegative >= 48) {
          const careScenes = Array.from(this.scenes.values()).filter(
            scene => scene.trigger === 'condition' && 
            scene.metadata?.conditionType === 'negative_emotion_persistent' &&
            this.policyGuard.isEnabled(scene.id)
          );

          if (careScenes.length > 0) {
            logger.info(`🎯 Triggering care scene for persistent negative emotion (${hoursSinceNegative.toFixed(1)}h)`);
            careScenes.forEach(scene => {
              this.trigger(scene.id, {
                userId: userId,
                metadata: { 
                  conditionType: 'negative_emotion_persistent',
                  hoursSinceNegative: hoursSinceNegative
                }
              }).catch(err => logger.error(`❌ Failed to trigger care scene ${scene.id}:`, err));
            });
          }
        }
      });
    }, CHECK_INTERVAL_MS);

    logger.info('✅ State check started (every 30 minutes)');
  }

  /**
   * Phase 2: 停止状态检查
   */
  private stopStateCheck(): void {
    if (this.stateCheckTimer) {
      clearInterval(this.stateCheckTimer);
      this.stateCheckTimer = null;
      logger.debug('⏸️ State check stopped');
    }
  }

  /**
   * Phase 2: 记录用户互动时间（供状态检查使用）
   */
  recordUserInteraction(userId: string): void {
    this.lastInteractionTime.set(userId, Date.now());
    // 清除负向情绪记录（因为用户有互动）
    this.negativeEmotionStartTime.delete(userId);
  }

  /**
   * Phase 2: 记录负向情绪开始时间（供状态检查使用）
   */
  recordNegativeEmotion(userId: string): void {
    if (!this.negativeEmotionStartTime.has(userId)) {
      this.negativeEmotionStartTime.set(userId, Date.now());
      logger.debug(`📝 Negative emotion recorded for user: ${userId}`);
    }
  }

  /**
   * Phase 2: 构建增强的上下文（包含用户状态、记忆等信息）
   */
  private buildEnhancedContext(context?: ProactiveContext, scene?: ProactiveScene): ProactiveContext {
    const userId = context?.userId || 'default';
    const now = Date.now();
    
    const enhancedContext: ProactiveContext = {
      userId: userId,
      timestamp: now,
      ...context,
      metadata: {
        ...context?.metadata,
        // 添加用户状态信息
        isWorkday: this.triggerHub.isWorkday(),
        isInQuietWindow: this.triggerHub.isInQuietWindow(),
        isInDeliveryWindow: this.triggerHub.isInDeliveryWindow(),
        // 添加互动时间信息
        lastInteractionTime: this.lastInteractionTime.get(userId),
        hoursSinceInteraction: this.lastInteractionTime.has(userId) 
          ? (now - this.lastInteractionTime.get(userId)!) / (1000 * 60 * 60)
          : undefined,
        // 添加负向情绪信息
        negativeEmotionStartTime: this.negativeEmotionStartTime.get(userId),
        hoursSinceNegative: this.negativeEmotionStartTime.has(userId)
          ? (now - this.negativeEmotionStartTime.get(userId)!) / (1000 * 60 * 60)
          : undefined,
        // 添加场景信息
        sceneId: scene?.id,
        sceneTrigger: scene?.trigger,
        scenePriority: scene?.priority
      }
    };

    // 如果有记忆服务，尝试添加最近的记忆摘要（异步，不阻塞）
    if (this.config.memoryService && this.config.memoryService.getRecentMemories) {
      // 这里可以异步获取，但不阻塞当前流程
      // 如果需要，可以在generateMessage中获取
    }

    return enhancedContext;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ProactivitySchedulerConfig>): void {
    if (config.maxDailyMessages !== undefined) {
      this.config.maxDailyMessages = config.maxDailyMessages;
      this.policyGuard.updateConfig({ maxDailyMessages: config.maxDailyMessages });
    }
    if (config.actionThreshold !== undefined) {
      this.config.actionThreshold = config.actionThreshold;
      this.evaluationEngine.setActionThreshold(config.actionThreshold);
    }
    if (config.enabled !== undefined) {
      this.config.enabled = config.enabled;
      this.policyGuard.updateConfig({ enabled: config.enabled });
    }
    logger.info('✅ ProactivityScheduler config updated');
  }

  /**
   * 获取状态
   */
  getStatus(): {
    isRunning: boolean;
    enabled: boolean;
    sceneCount: number;
    scheduledJobCount: number;
  } {
    return {
      isRunning: this.isRunning,
      enabled: this.config.enabled,
      sceneCount: this.scenes.size,
      scheduledJobCount: this.scheduledJobs.size
    };
  }
}

