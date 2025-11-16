import { mkdtempSync, rmSync } from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Admin panel node event forwarding', () => {
  jest.setTimeout(30000);
  const originalEnv: Record<string, string | undefined> = {
    root: process.env.APEX_BRIDGE_ROOT_DIR,
    config: process.env.APEX_BRIDGE_CONFIG_DIR,
    data: process.env.APEX_BRIDGE_DATA_DIR,
    autostart: process.env.APEX_BRIDGE_AUTOSTART
  };

  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'apex-admin-events-'));
    process.env.APEX_BRIDGE_ROOT_DIR = tmpRoot;
    process.env.APEX_BRIDGE_CONFIG_DIR = path.join(tmpRoot, 'config');
    process.env.APEX_BRIDGE_DATA_DIR = path.join(tmpRoot, 'data');
    process.env.APEX_BRIDGE_AUTOSTART = 'false';
  });

  afterAll(() => {
    if (originalEnv.root !== undefined) {
      process.env.APEX_BRIDGE_ROOT_DIR = originalEnv.root;
    } else {
      delete process.env.APEX_BRIDGE_ROOT_DIR;
    }
    if (originalEnv.config !== undefined) {
      process.env.APEX_BRIDGE_CONFIG_DIR = originalEnv.config;
    } else {
      delete process.env.APEX_BRIDGE_CONFIG_DIR;
    }
    if (originalEnv.data !== undefined) {
      process.env.APEX_BRIDGE_DATA_DIR = originalEnv.data;
    } else {
      delete process.env.APEX_BRIDGE_DATA_DIR;
    }
    if (originalEnv.autostart !== undefined) {
      process.env.APEX_BRIDGE_AUTOSTART = originalEnv.autostart;
    } else {
      delete process.env.APEX_BRIDGE_AUTOSTART;
    }

    if (tmpRoot) {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('broadcasts node events via AdminPanel channel', async () => {
    await jest.isolateModulesAsync(async () => {
      const { EventBus } = await import('../../src/core/EventBus');
      const { VCPIntelliCore } = await import('../../src/server');
      const { AdminPanelChannel } = await import('../../src/api/websocket/channels/AdminPanelChannel');

      const bus = EventBus.getInstance();
      bus.removeAllListeners();

      const core = new VCPIntelliCore();
      
      // 创建AdminPanelChannel实例并设置mock
      const adminPanelChannel = new AdminPanelChannel();
      const broadcastMock = jest.fn();
      // 替换broadcast方法
      adminPanelChannel.broadcast = broadcastMock;
      (core as any).adminPanelChannel = adminPanelChannel;
      
      // 重新设置事件转发（确保adminPanelChannel已设置）
      (core as any).setupNodeEventForwarding();

      const payload = { taskId: 'task-123', nodeId: 'node-abc', success: true };
      bus.publish('task_completed', payload);

      // 等待事件处理完成
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(broadcastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'node_event',
          event: 'task_completed',
          payload
        })
      );

      if ((core as any).nodeManager) {
        (core as any).nodeManager.stop();
      }
      bus.removeAllListeners();
    });
  });
});
