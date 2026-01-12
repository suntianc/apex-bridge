/**
 * AgentProtocol 单元测试
 */

import { AgentProtocol, AgentMessageRouter } from "@/core/agent/AgentProtocol";
import {
  AgentMessage,
  AgentMessageType,
  AgentMessageFactory,
  TaskRequest,
  TaskStatus,
} from "@/core/agent/AgentMessage";

describe("AgentProtocol", () => {
  let protocol: AgentProtocol;

  beforeEach(() => {
    protocol = new AgentProtocol();
  });

  describe("constructor", () => {
    it("should initialize with default config", () => {
      expect(protocol.version).toBe("1.0.0");
    });

    it("should accept custom config", () => {
      const customProtocol = new AgentProtocol({
        encoding: "json",
        compression: true,
        checksum: false,
      });

      const config = customProtocol.getConfig();
      expect(config.encoding).toBe("json");
      expect(config.compression).toBe(true);
      expect(config.checksum).toBe(false);
    });
  });

  describe("encode and decode", () => {
    it("should encode and decode heartbeat message", () => {
      const original = AgentMessageFactory.createHeartbeat("agent-a", 0.5);
      const encoded = protocol.encode(original);
      const decoded = protocol.decode(encoded);

      expect(decoded.id).toBe(original.id);
      expect(decoded.type).toBe(original.type);
      expect(decoded.from).toBe(original.from);
      expect(decoded.to).toBe(original.to);
      expect(decoded.timestamp).toBe(original.timestamp);
    });

    it("should encode and decode task request message", () => {
      const taskRequest: TaskRequest = {
        taskId: "task-123",
        taskType: "analysis",
        description: "Analyze data",
        inputData: { key: "value" },
        expectedOutput: "Result",
        constraints: ["time-limit"],
        timeoutSeconds: 60,
      };

      const original = AgentMessageFactory.createTaskRequest(
        "agent-a",
        "agent-b",
        taskRequest,
        "conv-123"
      );

      const encoded = protocol.encode(original);
      const decoded = protocol.decode(encoded);

      expect(decoded.id).toBe(original.id);
      expect(decoded.type).toBe(AgentMessageType.TASK_REQUEST);
      expect(decoded.correlationId).toBe("task-123");
      expect(decoded.conversationId).toBe("conv-123");
    });

    it("should encode and decode task response message", () => {
      const taskResponse = {
        taskId: "task-123",
        status: TaskStatus.SUCCESS,
        result: { output: "result" },
        evidence: ["source1"],
        confidence: 0.95,
      };

      const original = AgentMessageFactory.createTaskResponse(
        "agent-b",
        "agent-a",
        "original-msg-id",
        taskResponse
      );

      const encoded = protocol.encode(original);
      const decoded = protocol.decode(encoded);

      expect(decoded.id).toBe(original.id);
      expect(decoded.correlationId).toBe("original-msg-id");
    });

    it("should throw error for invalid message during encode", () => {
      const invalidMessage = { invalid: "message" } as unknown as AgentMessage;

      expect(() => {
        protocol.encode(invalidMessage);
      }).toThrow("Invalid message structure");
    });

    it("should throw error for corrupted buffer during decode", () => {
      const corruptedBuffer = Buffer.from("not valid json");

      expect(() => {
        protocol.decode(corruptedBuffer);
      }).toThrow();
    });
  });

  describe("validate", () => {
    it("should validate correct message", () => {
      const message: AgentMessage = {
        id: "msg-123",
        type: AgentMessageType.TASK_REQUEST,
        from: "agent-a",
        to: "agent-b",
        payload: {},
        timestamp: Date.now(),
      };

      expect(protocol.validate(message)).toBe(true);
    });

    it("should reject invalid message", () => {
      const invalidMessage = {
        id: "msg-123",
        type: "invalid_type",
        from: "agent-a",
        to: "agent-b",
        payload: {},
        timestamp: Date.now(),
      };

      expect(protocol.validate(invalidMessage)).toBe(false);
    });
  });

  describe("serialize and deserialize", () => {
    it("should serialize and deserialize message", () => {
      const original = AgentMessageFactory.createHeartbeat("agent-a");
      const serialized = protocol.serialize(original);
      const deserialized = protocol.deserialize(serialized);

      expect(deserialized).toEqual(original);
    });

    it("should throw error for invalid JSON during deserialize", () => {
      expect(() => {
        protocol.deserialize("invalid json");
      }).toThrow();
    });
  });

  describe("createRequest", () => {
    it("should create task request message", () => {
      const taskRequest: TaskRequest = {
        taskId: "task-123",
        taskType: "test",
        description: "Test",
        inputData: {},
        expectedOutput: "Output",
        constraints: [],
        timeoutSeconds: 30,
      };

      const message = protocol.createRequest("agent-a", "agent-b", taskRequest);

      expect(message.type).toBe(AgentMessageType.TASK_REQUEST);
      expect(message.from).toBe("agent-a");
      expect(message.to).toBe("agent-b");
    });
  });

  describe("createResponse", () => {
    it("should create task response message", () => {
      const taskResponse = {
        taskId: "task-123",
        status: TaskStatus.SUCCESS,
        result: {},
        evidence: [],
        confidence: 0.9,
      };

      const message = protocol.createResponse(
        "agent-b",
        "agent-a",
        "original-msg-id",
        taskResponse
      );

      expect(message.type).toBe(AgentMessageType.TASK_RESPONSE);
      expect(message.correlationId).toBe("original-msg-id");
    });
  });

  describe("createError", () => {
    it("should create error message", () => {
      const error = {
        code: "ERROR_CODE",
        message: "Error message",
        details: { key: "value" },
      };

      const message = protocol.createError("agent-b", "agent-a", "original-msg-id", error);

      expect(message.type).toBe(AgentMessageType.ERROR);
      expect(message.payload).toEqual(error);
    });
  });

  describe("createHeartbeat", () => {
    it("should create heartbeat message", () => {
      const message = protocol.createHeartbeat("agent-a", 0.75);

      expect(message.type).toBe(AgentMessageType.HEARTBEAT);
      expect(message.from).toBe("agent-a");
      expect(message.to).toBe("all");
    });
  });

  describe("getConfig and updateConfig", () => {
    it("should return current config", () => {
      const config = protocol.getConfig();

      expect(config).toHaveProperty("version");
      expect(config).toHaveProperty("encoding");
      expect(config).toHaveProperty("compression");
      expect(config).toHaveProperty("checksum");
    });

    it("should update config", () => {
      protocol.updateConfig({ compression: true, maxMessageSize: 2048 });

      const config = protocol.getConfig();
      expect(config.compression).toBe(true);
      expect(config.maxMessageSize).toBe(2048);
    });
  });
});

describe("AgentMessageRouter", () => {
  let router: AgentMessageRouter;
  let protocol: AgentProtocol;

  beforeEach(() => {
    protocol = new AgentProtocol();
    router = new AgentMessageRouter(protocol);
  });

  describe("constructor", () => {
    it("should initialize with default protocol", () => {
      const defaultRouter = new AgentMessageRouter();
      expect(defaultRouter).toBeDefined();
    });

    it("should initialize with custom protocol", () => {
      expect(router).toBeDefined();
    });
  });

  describe("registerHandler", () => {
    it("should register handler for message type", async () => {
      const handler = jest.fn();
      router.registerHandler(AgentMessageType.HEARTBEAT, handler);

      const message = AgentMessageFactory.createHeartbeat("agent-a");
      await router.handleMessage(message);

      expect(handler).toHaveBeenCalledWith(message);
    });

    it("should register multiple handlers for same type", async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      router.registerHandler(AgentMessageType.TASK_REQUEST, handler1);
      router.registerHandler(AgentMessageType.TASK_REQUEST, handler2);

      const message = AgentMessageFactory.createTaskRequest("agent-a", "agent-b", {
        taskId: "task-123",
        taskType: "test",
        description: "Test",
        inputData: {},
        expectedOutput: "Output",
        constraints: [],
        timeoutSeconds: 30,
      });

      await router.handleMessage(message);

      expect(handler1).toHaveBeenCalledWith(message);
      expect(handler2).toHaveBeenCalledWith(message);
    });
  });

  describe("handleMessage", () => {
    it("should handle message with registered handler", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      router.registerHandler(AgentMessageType.HEARTBEAT, handler);

      const message = AgentMessageFactory.createHeartbeat("agent-a");
      await router.handleMessage(message);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should not throw when no handler registered", async () => {
      const message = AgentMessageFactory.createHeartbeat("agent-a");

      await expect(router.handleMessage(message)).resolves.not.toThrow();
    });

    it("should handle handler errors gracefully", async () => {
      const errorHandler = jest.fn().mockRejectedValue(new Error("Handler error"));
      router.registerHandler(AgentMessageType.HEARTBEAT, errorHandler);

      const message = AgentMessageFactory.createHeartbeat("agent-a");

      await router.handleMessage(message);

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe("handleEncodedMessage", () => {
    it("should decode and handle encoded message", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      router.registerHandler(AgentMessageType.HEARTBEAT, handler);

      const originalMessage = AgentMessageFactory.createHeartbeat("agent-a");
      const encoded = protocol.encode(originalMessage);

      await router.handleEncodedMessage(encoded);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: originalMessage.id,
          type: originalMessage.type,
        })
      );
    });
  });
});
