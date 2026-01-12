/**
 * AgentMessage 单元测试
 */

import {
  AgentMessage,
  AgentMessageType,
  AgentMessageFactory,
  AgentMessageValidator,
  TaskRequest,
  TaskResponse,
  TaskStatus,
  TaskAssignment,
  TaskPriority,
  StatusUpdate,
  AgentStatus,
} from "@/core/agent/AgentMessage";

describe("AgentMessage", () => {
  describe("AgentMessageFactory", () => {
    describe("createTaskRequest", () => {
      it("should create a valid task request message", () => {
        const taskRequest: TaskRequest = {
          taskId: "task-123",
          taskType: "analysis",
          description: "Analyze data",
          inputData: { key: "value" },
          expectedOutput: "Analysis result",
          constraints: ["time-limit"],
          timeoutSeconds: 60,
        };

        const message = AgentMessageFactory.createTaskRequest(
          "agent-a",
          "agent-b",
          taskRequest,
          "conv-123"
        );

        expect(message.id).toMatch(/^msg_/);
        expect(message.type).toBe(AgentMessageType.TASK_REQUEST);
        expect(message.from).toBe("agent-a");
        expect(message.to).toBe("agent-b");
        expect(message.payload).toEqual(taskRequest);
        expect(message.conversationId).toBe("conv-123");
        expect(message.correlationId).toBe("task-123");
        expect(typeof message.timestamp).toBe("number");
      });

      it("should create task request without conversation id", () => {
        const taskRequest: TaskRequest = {
          taskId: "task-456",
          taskType: "generation",
          description: "Generate content",
          inputData: {},
          expectedOutput: "Generated content",
          constraints: [],
          timeoutSeconds: 30,
        };

        const message = AgentMessageFactory.createTaskRequest("agent-a", "agent-b", taskRequest);

        expect(message.conversationId).toBeUndefined();
        expect(message.correlationId).toBe("task-456");
      });
    });

    describe("createTaskResponse", () => {
      it("should create a valid task response message", () => {
        const taskResponse: TaskResponse = {
          taskId: "task-123",
          status: TaskStatus.SUCCESS,
          result: { output: "result data" },
          evidence: ["source1", "source2"],
          confidence: 0.95,
        };

        const message = AgentMessageFactory.createTaskResponse(
          "agent-b",
          "agent-a",
          "original-msg-id",
          taskResponse
        );

        expect(message.type).toBe(AgentMessageType.TASK_RESPONSE);
        expect(message.from).toBe("agent-b");
        expect(message.to).toBe("agent-a");
        expect(message.correlationId).toBe("original-msg-id");
        expect(message.payload).toEqual(taskResponse);
      });

      it("should handle partial success response", () => {
        const taskResponse: TaskResponse = {
          taskId: "task-789",
          status: TaskStatus.PARTIAL,
          result: { partial: true },
          evidence: [],
          confidence: 0.5,
        };

        const message = AgentMessageFactory.createTaskResponse(
          "agent-b",
          "agent-a",
          "original-msg-id",
          taskResponse
        );

        const payload = message.payload as TaskResponse;
        expect(payload.status).toBe(TaskStatus.PARTIAL);
      });
    });

    describe("createError", () => {
      it("should create a valid error message", () => {
        const error = {
          code: "TIMEOUT",
          message: "Task timed out",
          details: { timeout: 60 },
        };

        const message = AgentMessageFactory.createError(
          "agent-b",
          "agent-a",
          "original-msg-id",
          error
        );

        expect(message.type).toBe(AgentMessageType.ERROR);
        expect(message.payload).toEqual(error);
        expect(message.correlationId).toBe("original-msg-id");
      });
    });

    describe("createHeartbeat", () => {
      it("should create a valid heartbeat message", () => {
        const message = AgentMessageFactory.createHeartbeat("agent-a", 0.5);

        expect(message.type).toBe(AgentMessageType.HEARTBEAT);
        expect(message.from).toBe("agent-a");
        expect(message.to).toBe("all");
        expect(message.payload).toHaveProperty("agentId", "agent-a");
        expect(message.payload).toHaveProperty("timestamp");
        expect(message.payload).toHaveProperty("load", 0.5);
      });

      it("should create heartbeat with default load", () => {
        const message = AgentMessageFactory.createHeartbeat("agent-a");

        expect((message.payload as { load: number }).load).toBe(0);
      });
    });

    describe("createStatusUpdate", () => {
      it("should create a valid status update message", () => {
        const statusUpdate: StatusUpdate = {
          agentId: "agent-a",
          status: AgentStatus.ACTIVE,
          currentTask: "task-123",
          progress: 50,
          metrics: { cpu: 30, memory: 40 },
        };

        const message = AgentMessageFactory.createStatusUpdate("agent-a", "manager", statusUpdate);

        expect(message.type).toBe(AgentMessageType.STATUS_UPDATE);
        expect(message.payload).toEqual(statusUpdate);
      });
    });

    describe("createTaskAssignment", () => {
      it("should create a valid task assignment message", () => {
        const assignment: TaskAssignment = {
          taskId: "task-123",
          assigneeAgentId: "agent-b",
          priority: TaskPriority.HIGH,
          deadline: new Date("2026-01-12"),
          dependencies: ["task-122"],
        };

        const message = AgentMessageFactory.createTaskAssignment("manager", "agent-b", assignment);

        expect(message.type).toBe(AgentMessageType.TASK_ASSIGN);
        expect(message.payload).toEqual(assignment);
        expect(message.correlationId).toBe("task-123");
      });
    });
  });

  describe("AgentMessageValidator", () => {
    describe("validateMessage", () => {
      it("should validate a correct message", () => {
        const message: AgentMessage = {
          id: "msg-123",
          type: AgentMessageType.TASK_REQUEST,
          from: "agent-a",
          to: "agent-b",
          payload: {},
          timestamp: Date.now(),
        };

        expect(AgentMessageValidator.validateMessage(message)).toBe(true);
      });

      it("should reject invalid message without id", () => {
        const message = {
          type: AgentMessageType.TASK_REQUEST,
          from: "agent-a",
          to: "agent-b",
          payload: {},
          timestamp: Date.now(),
        };

        expect(AgentMessageValidator.validateMessage(message)).toBe(false);
      });

      it("should reject invalid message type", () => {
        const message = {
          id: "msg-123",
          type: "invalid_type",
          from: "agent-a",
          to: "agent-b",
          payload: {},
          timestamp: Date.now(),
        };

        expect(AgentMessageValidator.validateMessage(message)).toBe(false);
      });

      it("should reject message without timestamp", () => {
        const message = {
          id: "msg-123",
          type: AgentMessageType.TASK_REQUEST,
          from: "agent-a",
          to: "agent-b",
          payload: {},
        };

        expect(AgentMessageValidator.validateMessage(message)).toBe(false);
      });

      it("should reject non-object message", () => {
        expect(AgentMessageValidator.validateMessage(null)).toBe(false);
        expect(AgentMessageValidator.validateMessage("string")).toBe(false);
        expect(AgentMessageValidator.validateMessage(123)).toBe(false);
      });
    });

    describe("validateTaskRequest", () => {
      it("should validate a correct task request", () => {
        const taskRequest: TaskRequest = {
          taskId: "task-123",
          taskType: "analysis",
          description: "Analyze data",
          inputData: {},
          expectedOutput: "Result",
          constraints: [],
          timeoutSeconds: 60,
        };

        expect(AgentMessageValidator.validateTaskRequest(taskRequest)).toBe(true);
      });

      it("should reject task request without taskId", () => {
        const taskRequest = {
          taskType: "analysis",
          description: "Analyze data",
          inputData: {},
          expectedOutput: "Result",
          constraints: [],
          timeoutSeconds: 60,
        };

        expect(AgentMessageValidator.validateTaskRequest(taskRequest)).toBe(false);
      });

      it("should reject task request without constraints array", () => {
        const taskRequest = {
          taskId: "task-123",
          taskType: "analysis",
          description: "Analyze data",
          inputData: {},
          expectedOutput: "Result",
          constraints: "not-array",
          timeoutSeconds: 60,
        };

        expect(AgentMessageValidator.validateTaskRequest(taskRequest)).toBe(false);
      });
    });

    describe("validateTaskResponse", () => {
      it("should validate a correct task response", () => {
        const taskResponse: TaskResponse = {
          taskId: "task-123",
          status: TaskStatus.SUCCESS,
          result: {},
          evidence: [],
          confidence: 0.9,
        };

        expect(AgentMessageValidator.validateTaskResponse(taskResponse)).toBe(true);
      });

      it("should reject task response with invalid status", () => {
        const taskResponse = {
          taskId: "task-123",
          status: "invalid_status",
          result: {},
          evidence: [],
          confidence: 0.9,
        };

        expect(AgentMessageValidator.validateTaskResponse(taskResponse)).toBe(false);
      });

      it("should reject task response without confidence", () => {
        const taskResponse = {
          taskId: "task-123",
          status: TaskStatus.SUCCESS,
          result: {},
          evidence: [],
        };

        expect(AgentMessageValidator.validateTaskResponse(taskResponse)).toBe(false);
      });
    });
  });
});
