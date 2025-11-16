/**
 * PolicyGuard 单元测试
 */

import { PolicyGuard } from '../../src/core/PolicyGuard';

describe('PolicyGuard', () => {
  let policyGuard: PolicyGuard;

  beforeEach(() => {
    policyGuard = new PolicyGuard({
      maxDailyMessages: 2,
      enabled: true
    });
  });

  describe('canSendMessage', () => {
    it('应该允许发送第一条消息', () => {
      expect(policyGuard.canSendMessage('user1')).toBe(true);
    });

    it('应该在达到限制时阻止发送', () => {
      policyGuard.canSendMessage('user1');
      policyGuard.canSendMessage('user1');
      expect(policyGuard.canSendMessage('user1')).toBe(false);
    });

    it('应该允许不同用户发送消息', () => {
      policyGuard.canSendMessage('user1');
      policyGuard.canSendMessage('user1');
      expect(policyGuard.canSendMessage('user2')).toBe(true);
    });

    it('应该在禁用时阻止发送', () => {
      policyGuard.updateConfig({ enabled: false });
      expect(policyGuard.canSendMessage('user1')).toBe(false);
    });
  });

  describe('isEnabled', () => {
    it('应该默认启用场景', () => {
      expect(policyGuard.isEnabled('test-scene')).toBe(true);
    });

    it('应该正确禁用场景', () => {
      policyGuard.disableScene('test-scene');
      expect(policyGuard.isEnabled('test-scene')).toBe(false);
    });

    it('应该正确启用场景', () => {
      policyGuard.disableScene('test-scene');
      policyGuard.enableScene('test-scene');
      expect(policyGuard.isEnabled('test-scene')).toBe(true);
    });
  });

  describe('getDailyMessageCount', () => {
    it('应该正确返回消息计数', () => {
      expect(policyGuard.getDailyMessageCount('user1')).toBe(0);
      policyGuard.canSendMessage('user1');
      expect(policyGuard.getDailyMessageCount('user1')).toBe(1);
    });
  });
});

