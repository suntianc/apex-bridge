/**
 * AgentChannel 单元测试
 */

import { AgentChannel, AgentChannelManager } from "@/core/agent/AgentChannel";
import { AgentMessage, AgentMessageType, AgentMessageFactory } from "@/core/agent/AgentMessage";

describe("AgentChannel", () => {
  let channel: AgentChannel;

  beforeEach(() => {
    channel = new AgentChannel("test-channel", ["agent-a", "agent-b"]);
  });

  describe("constructor", () => {
    it("should create channel with correct properties", () => {
      expect(channel.id).toBe("test-channel");
      expect(channel.agentIds).toEqual(["agent-a", "agent-b"]);
      expect(channel.messageQueue).toHaveLength(0);
      expect(channel.routingRules).toHaveLength(0);
      expect(channel.createdAt).toBeInstanceOf(Date);
      expect(channel.lastActivity).toBeInstanceOf(Date);
    });

    it("should create channel with custom max queue size", () => {
      const customChannel = new AgentChannel("custom", [], {
        maxQueueSize: 100,
      });
      expect(customChannel).toBeDefined();
    });
  });

  describe("publish", () => {
    it("should publish message to channel", () => {
      const message = AgentMessageFactory.createHeartbeat("agent-a");
      const result = channel.publish(message);

      expect(result).toBe(true);
      expect(channel.messageQueue).toHaveLength(1);
      expect(channel.messageQueue[0]).toEqual(message);
    });

    it("should return false when publish fails", () => {
      const invalidMessage = { invalid: "message" } as unknown as AgentMessage;
      const result = channel.publish(invalidMessage);

      expect(result).toBe(false);
    });

    it("should update last activity on publish", async () => {
      const beforePublish = channel.lastActivity.getTime();
      await new Promise((resolve) => setTimeout(resolve, 10));

      const message = AgentMessageFactory.createHeartbeat("agent-a");
      channel.publish(message);

      expect(channel.lastActivity.getTime()).toBeGreaterThan(beforePublish);
    });
  });

  describe("subscribe", () => {
    it("should subscribe agent to channel", () => {
      const result = channel.subscribe("agent-c");

      expect(result).toBe(true);
    });

    it("should reject duplicate subscription", () => {
      channel.subscribe("agent-c");
      const result = channel.subscribe("agent-c");

      expect(result).toBe(false);
    });

    it("should subscribe with filters", () => {
      const filters = [{ field: "type", operator: "eq" as const, value: "task_request" }];
      const result = channel.subscribe("agent-c", filters);

      expect(result).toBe(true);
    });
  });

  describe("unsubscribe", () => {
    it("should unsubscribe agent from channel", () => {
      channel.subscribe("agent-c");
      const result = channel.unsubscribe("agent-c");

      expect(result).toBe(true);
    });

    it("should return false for non-subscribed agent", () => {
      const result = channel.unsubscribe("agent-d");

      expect(result).toBe(false);
    });
  });

  describe("getMessagesForAgent", () => {
    it("should return messages for subscribed agent", () => {
      channel.subscribe("agent-a");

      const message = AgentMessageFactory.createTaskRequest("manager", "agent-a", {
        taskId: "task-1",
        taskType: "test",
        description: "Test task",
        inputData: {},
        expectedOutput: "Output",
        constraints: [],
        timeoutSeconds: 30,
      });
      channel.publish(message);

      const messages = channel.getMessagesForAgent("agent-a");

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(message);
    });

    it("should not return messages for non-subscribed agent", () => {
      const message = AgentMessageFactory.createTaskRequest("manager", "agent-a", {
        taskId: "task-1",
        taskType: "test",
        description: "Test task",
        inputData: {},
        expectedOutput: "Output",
        constraints: [],
        timeoutSeconds: 30,
      });
      channel.publish(message);

      const messages = channel.getMessagesForAgent("agent-c");

      expect(messages).toHaveLength(0);
    });

    it("should filter messages based on filters", () => {
      channel.subscribe("agent-a", [{ field: "type", operator: "eq", value: "heartbeat" }]);

      const taskMessage = AgentMessageFactory.createTaskRequest("manager", "agent-a", {
        taskId: "task-1",
        taskType: "test",
        description: "Test task",
        inputData: {},
        expectedOutput: "Output",
        constraints: [],
        timeoutSeconds: 30,
      });
      const heartbeatMessage = AgentMessageFactory.createHeartbeat("agent-b");

      channel.publish(taskMessage);
      channel.publish(heartbeatMessage);

      const messages = channel.getMessagesForAgent("agent-a");

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe(AgentMessageType.HEARTBEAT);
    });
  });

  describe("addRoutingRule", () => {
    it("should add routing rule", () => {
      channel.addRoutingRule({
        pattern: "type:task_request",
        targetAgent: "agent-c",
        priority: 1,
      });

      expect(channel.routingRules).toHaveLength(1);
      expect(channel.routingRules[0].pattern).toBe("type:task_request");
    });

    it("should sort rules by priority", () => {
      channel.addRoutingRule({
        pattern: "low",
        targetAgent: "agent-a",
        priority: 1,
      });
      channel.addRoutingRule({
        pattern: "high",
        targetAgent: "agent-b",
        priority: 10,
      });

      expect(channel.routingRules[0].priority).toBe(10);
    });
  });

  describe("clearQueue", () => {
    it("should clear all messages when no timestamp provided", () => {
      const message = AgentMessageFactory.createHeartbeat("agent-a");
      channel.publish(message);
      channel.publish(message);

      expect(channel.messageQueue).toHaveLength(2);

      const removedCount = channel.clearQueue();

      expect(removedCount).toBe(2);
      expect(channel.messageQueue).toHaveLength(0);
    });

    it("should clear messages before timestamp", () => {
      const oldMessage = AgentMessageFactory.createHeartbeat("agent-a");
      const newMessage = AgentMessageFactory.createHeartbeat("agent-b");

      channel.publish(oldMessage);
      channel.publish(newMessage);

      const cutoff = newMessage.timestamp - 1;
      const removedCount = channel.clearQueue(cutoff);

      expect(removedCount).toBe(1);
      expect(channel.messageQueue).toHaveLength(1);
      expect(channel.messageQueue[0]).toEqual(newMessage);
    });
  });

  describe("getStats", () => {
    it("should return channel statistics", () => {
      const stats = channel.getStats();

      expect(stats).toEqual({
        id: "test-channel",
        messageCount: 0,
        subscriberCount: 0,
        lastActivity: channel.lastActivity,
        createdAt: channel.createdAt,
      });
    });

    it("should update stats after publishing message", () => {
      channel.publish(AgentMessageFactory.createHeartbeat("agent-a"));

      const stats = channel.getStats();

      expect(stats.messageCount).toBe(1);
    });
  });
});

describe("AgentChannelManager", () => {
  let manager: AgentChannelManager;

  beforeEach(() => {
    manager = new AgentChannelManager();
  });

  describe("constructor", () => {
    it("should initialize with default channel", () => {
      const defaultChannel = manager.getDefaultChannel();

      expect(defaultChannel).toBeDefined();
      expect(defaultChannel.id).toBe("default");
    });
  });

  describe("createChannel", () => {
    it("should create new channel", () => {
      const channel = manager.createChannel(["agent-a", "agent-b"]);

      expect(channel.id).toBeDefined();
      expect(channel.agentIds).toEqual(["agent-a", "agent-b"]);
    });

    it("should throw error for duplicate channel id", () => {
      const channel = manager.createChannel(["agent-a"], { channelId: "custom" });

      expect(() => {
        manager.createChannel(["agent-b"], { channelId: "custom" });
      }).toThrow("Channel custom already exists");
    });
  });

  describe("getChannel", () => {
    it("should return existing channel", () => {
      const created = manager.createChannel(["agent-a"], { channelId: "my-channel" });
      const retrieved = manager.getChannel("my-channel");

      expect(retrieved).toEqual(created);
    });

    it("should return undefined for non-existing channel", () => {
      const retrieved = manager.getChannel("non-existing");

      expect(retrieved).toBeUndefined();
    });
  });

  describe("deleteChannel", () => {
    it("should delete existing channel", () => {
      manager.createChannel(["agent-a"], { channelId: "to-delete" });

      const result = manager.deleteChannel("to-delete");

      expect(result).toBe(true);
      expect(manager.getChannel("to-delete")).toBeUndefined();
    });

    it("should not delete default channel", () => {
      const result = manager.deleteChannel("default");

      expect(result).toBe(false);
      expect(manager.getDefaultChannel()).toBeDefined();
    });

    it("should return false for non-existing channel", () => {
      const result = manager.deleteChannel("non-existing");

      expect(result).toBe(false);
    });
  });

  describe("getAllChannels", () => {
    it("should return all channels including default", () => {
      manager.createChannel(["agent-a"], { channelId: "channel-1" });
      manager.createChannel(["agent-b"], { channelId: "channel-2" });

      const channels = manager.getAllChannels();

      expect(channels).toHaveLength(3);
    });
  });

  describe("publish", () => {
    it("should publish to default channel", () => {
      const message = AgentMessageFactory.createHeartbeat("agent-a");
      const result = manager.publish(message);

      expect(result).toBe(true);
      expect(manager.getDefaultChannel().messageQueue).toHaveLength(1);
    });
  });
});
