/**
 * VCP IntelliCore (智脑) - 事件总线
 * 用于解耦各层之间的通信
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export class EventBus extends EventEmitter {
  private static instance: EventBus;
  
  private constructor() {
    super();
    this.setMaxListeners(100); // 增加最大监听器数量
  }
  
  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
      logger.debug('EventBus instance created');
    }
    return EventBus.instance;
  }
  
  /**
   * 发布事件
   */
  publish(event: string, data: any): void {
    logger.debug(`📢 Event published: ${event}`);
    this.emit(event, data);
  }
  
  /**
   * 订阅事件
   */
  subscribe(event: string, handler: (data: any) => void): void {
    logger.debug(`📡 Subscribed to event: ${event}`);
    this.on(event, handler);
  }
  
  /**
   * 取消订阅
   */
  unsubscribe(event: string, handler: (data: any) => void): void {
    this.off(event, handler);
  }
}

// 导出单例
export default EventBus.getInstance();

