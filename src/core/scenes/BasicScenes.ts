/**
 * BasicScenes - 基础场景定义
 * 包含早安问候、晚安祝福、健康提醒等基础场景
 */

import { ProactiveScene, ProactiveContext } from '../../types/proactivity';
import { PersonalityConfig } from '../../types/personality';
import { RelationshipStorage } from '../../utils/relationshipStorage';
import { logger } from '../../utils/logger';

/**
 * 早安问候场景
 */
export const morningGreetingScene: ProactiveScene = {
  id: 'morning_greeting',
  name: '早安问候',
  description: '工作日上午9:30主动问候用户',
  trigger: 'schedule',
  // schedule: '30 9 * * 1-5', // 工作日9:30
  schedule: '* * * * *', // 工作日9:30
  enabled: true,
  priority: 1,
  generateMessage: async (context: ProactiveContext, personality: PersonalityConfig): Promise<string> => {
    const name = personality.identity.name || 'AI助手';
    const address = personality.style.address || '您';
    const emoji = personality.identity.avatar || '☀️';
    
    const greetings = [
      `${emoji} 早上好，${address}！今天有什么计划吗？`,
      `${emoji} 早安，${address}！新的一天开始了，有什么需要我帮助的吗？`,
      `${emoji} 早上好！${address}今天看起来精神不错，有什么想聊的吗？`
    ];
    
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
};

/**
 * 晚安祝福场景
 */
export const eveningGreetingScene: ProactiveScene = {
  id: 'evening_greeting',
  name: '晚安祝福',
  description: '工作日下午2:30主动问候用户',
  trigger: 'schedule',
  schedule: '30 14 * * 1-5', // 工作日14:30
  enabled: true,
  priority: 0.8,
  generateMessage: async (context: ProactiveContext, personality: PersonalityConfig): Promise<string> => {
    const name = personality.identity.name || 'AI助手';
    const address = personality.style.address || '您';
    const emoji = personality.identity.avatar || '🌙';
    
    const greetings = [
      `${emoji} 下午好，${address}！今天过得怎么样？`,
      `${emoji} 下午好！${address}今天工作顺利吗？需要我帮什么忙吗？`,
      `${emoji} 下午好，${address}！休息一下，喝点水吧~`
    ];
    
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
};

/**
 * 健康提醒场景
 */
export const healthReminderScene: ProactiveScene = {
  id: 'health_reminder',
  name: '健康提醒',
  description: '长时间无互动时提醒用户注意健康',
  trigger: 'condition',
  enabled: true,
  priority: 0.5,
  condition: (context: ProactiveContext): boolean => {
    // 检查是否长时间无互动（72小时）
    // 这个逻辑会在外部判断，这里只是占位
    return false;
  },
  generateMessage: async (context: ProactiveContext, personality: PersonalityConfig): Promise<string> => {
    const name = personality.identity.name || 'AI助手';
    const address = personality.style.address || '您';
    const emoji = personality.identity.avatar || '💪';
    
    const reminders = [
      `${emoji} ${address}，记得多喝水，适当休息哦~`,
      `${emoji} 提醒${address}：工作虽重要，但也要注意身体健康！`,
      `${emoji} ${address}，长时间工作后记得起来活动一下~`
    ];
    
    return reminders[Math.floor(Math.random() * reminders.length)];
  }
};

/**
 * 生日提醒场景（需要动态创建，因为需要访问关系数据）
 */
export function createBirthdayReminderScene(relationshipStorage: RelationshipStorage): ProactiveScene {
  return {
    id: 'birthday_reminder',
    name: '生日提醒',
    description: '提醒用户即将到来的生日',
    trigger: 'schedule',
    schedule: '0 9 * * *', // 每天上午9:00检查
    enabled: true,
    priority: 0.9,
    generateMessage: async (context: ProactiveContext, personality: PersonalityConfig): Promise<string> => {
      const userId = context.userId || 'default';
      const address = personality.style.address || '您';
      const emoji = personality.identity.avatar || '🎂';
      
      // 获取即将到来的生日提醒（7天内）
      const reminders = await relationshipStorage.getUpcomingReminders(userId, 7);
      const birthdayReminders = reminders.filter(r => r.eventType === 'birthday');
      
      logger.debug(`🎂 Birthday reminder check: found ${birthdayReminders.length} reminders for user ${userId}`);
      
      if (birthdayReminders.length === 0) {
        // 如果没有提醒，返回空字符串（场景不应该触发）
        logger.debug(`💡 No upcoming birthday reminders found for user ${userId}`);
        return '';
      }
      
      const reminder = birthdayReminders[0];
      const daysText = reminder.daysUntil === 0 ? '今天' : `${reminder.daysUntil}天后`;
      
      const messages = [
        `${emoji} 提醒${address}：${reminder.relationshipName}的生日${daysText}就到了！记得准备祝福哦~`,
        `${emoji} ${address}，${daysText}是${reminder.relationshipName}的生日，别忘了送上祝福！`,
        `${emoji} 生日提醒：${reminder.relationshipName}的生日${daysText}就到了，给${address}提个醒~`
      ];
      
      return messages[Math.floor(Math.random() * messages.length)];
    }
  };
}

/**
 * 纪念日提醒场景（需要动态创建，因为需要访问关系数据）
 */
export function createAnniversaryReminderScene(relationshipStorage: RelationshipStorage): ProactiveScene {
  return {
    id: 'anniversary_reminder',
    name: '纪念日提醒',
    description: '提醒用户即将到来的纪念日',
    trigger: 'schedule',
    schedule: '0 9 * * *', // 每天上午9:00检查
    enabled: true,
    priority: 0.85,
    generateMessage: async (context: ProactiveContext, personality: PersonalityConfig): Promise<string> => {
      const userId = context.userId || 'default';
      const address = personality.style.address || '您';
      const emoji = personality.identity.avatar || '💝';
      
      // 获取即将到来的纪念日提醒（7天内）
      const reminders = await relationshipStorage.getUpcomingReminders(userId, 7);
      const anniversaryReminders = reminders.filter(r => r.eventType === 'anniversary');
      
      logger.debug(`💝 Anniversary reminder check: found ${anniversaryReminders.length} reminders for user ${userId}`);
      
      if (anniversaryReminders.length === 0) {
        // 如果没有提醒，返回空字符串（场景不应该触发）
        logger.debug(`💡 No upcoming anniversary reminders found for user ${userId}`);
        return '';
      }
      
      const reminder = anniversaryReminders[0];
      const daysText = reminder.daysUntil === 0 ? '今天' : `${reminder.daysUntil}天后`;
      
      const messages = [
        `${emoji} 提醒${address}：${reminder.relationshipName}的纪念日${daysText}就到了！记得准备祝福哦~`,
        `${emoji} ${address}，${daysText}是${reminder.relationshipName}的纪念日，别忘了庆祝一下！`,
        `${emoji} 纪念日提醒：${reminder.relationshipName}的纪念日${daysText}就到了，给${address}提个醒~`
      ];
      
      return messages[Math.floor(Math.random() * messages.length)];
    }
  };
}

/**
 * 文档分析场景（事件触发）
 */
export const documentAnalysisScene: ProactiveScene = {
  id: 'document_analysis',
  name: '文档分析',
  description: '当有新文档记录时，主动分析并提供见解',
  trigger: 'event',
  enabled: true,
  priority: 0.7,
  metadata: {
    eventType: 'memory:new_document'
  },
  generateMessage: async (context: ProactiveContext, personality: PersonalityConfig): Promise<string> => {
    const address = personality.style.address || '您';
    const emoji = personality.identity.avatar || '📝';
    const content = context.metadata?.content || '';
    
    // 简单分析：如果内容较长，提示可以深入分析
    if (content.length > 100) {
      return `${emoji} ${address}，我注意到您刚才记录了一些内容。需要我帮您分析或总结一下吗？`;
    }
    
    return `${emoji} ${address}，我记录了您刚才的内容。有什么需要我帮助的吗？`;
  }
};

/**
 * 关怀提醒场景（事件触发）
 */
export const careReminderScene: ProactiveScene = {
  id: 'care_reminder',
  name: '关怀提醒',
  description: '当检测到负面情绪时，主动关怀用户',
  trigger: 'event',
  enabled: true,
  priority: 0.9,
  metadata: {
    eventType: 'emotion:negative_detected'
  },
  generateMessage: async (context: ProactiveContext, personality: PersonalityConfig): Promise<string> => {
    const address = personality.style.address || '您';
    const emoji = personality.identity.avatar || '💝';
    const emotion = context.emotion?.type || context.metadata?.emotion || '负面情绪';
    
    const messages = [
      `${emoji} ${address}，我注意到您可能心情不太好。需要聊聊吗？`,
      `${emoji} ${address}，如果您感到困扰，我在这里倾听。`,
      `${emoji} ${address}，有什么我可以帮助您的吗？`
    ];
    
    return messages[Math.floor(Math.random() * messages.length)];
  }
};

/**
 * 获取所有基础场景
 */
export function getBasicScenes(): ProactiveScene[] {
  return [
    morningGreetingScene,
    eveningGreetingScene,
    healthReminderScene,
    documentAnalysisScene,
    careReminderScene
  ];
}

