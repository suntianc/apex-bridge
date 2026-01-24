import {
  createTestApp,
  createMockConfig,
  generateTestProvider,
  generateTestModel,
  generateTestChatRequest,
  expectSuccessResponse,
  expectUnauthorizedResponse,
  expectNotFoundResponse,
  expectBadRequestResponse,
  TEST_API_KEY,
} from "./api.test-setup";

describe("API Integration Tests", () => {
  describe("System API", () => {
    let testApp: ReturnType<typeof createTestApp>;

    beforeEach(() => {
      testApp = createTestApp(createMockConfig({ authEnabled: false }));
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    describe("GET /health", () => {
      it("should return 200 with status ok", async () => {
        const response = await testApp.request.get("/health");
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("status", "ok");
        expect(response.body).toHaveProperty("version");
        expect(response.body).toHaveProperty("uptime");
      });

      it("should include server metrics in response", async () => {
        const response = await testApp.request.get("/health");
        expect(response.body).toHaveProperty("plugins");
        expect(response.body).toHaveProperty("activeRequests");
      });
    });

    describe("GET /openapi.json", () => {
      it("should return 200 with OpenAPI spec", async () => {
        const response = await testApp.request.get("/openapi.json");
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("openapi");
        expect(response.body).toHaveProperty("paths");
      });
    });
  });

  describe("Chat API", () => {
    let testApp: ReturnType<typeof createTestApp>;

    beforeEach(() => {
      testApp = createTestApp();
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    describe("POST /v1/chat/completions", () => {
      it("should return 200 with valid chat request", async () => {
        const chatRequest = generateTestChatRequest();
        const response = await testApp.request
          .post("/v1/chat/completions")
          .set("Authorization", `Bearer ${TEST_API_KEY}`)
          .send(chatRequest);
        expectSuccessResponse(response);
      });

      it("should return 401 without authorization header", async () => {
        const chatRequest = generateTestChatRequest();
        const response = await testApp.request.post("/v1/chat/completions").send(chatRequest);
        expectUnauthorizedResponse(response);
      });

      it("should return 400 with invalid request body", async () => {
        const response = await testApp.request
          .post("/v1/chat/completions")
          .set("Authorization", `Bearer ${TEST_API_KEY}`)
          .send({});
        expectBadRequestResponse(response);
      });
    });

    describe("GET /v1/chat/sessions/active", () => {
      it("should return 200 with session list", async () => {
        const response = await testApp.request
          .get("/v1/chat/sessions/active")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectSuccessResponse(response);
        expect(response.body).toHaveProperty("sessions");
      });

      it("should return 401 without authorization", async () => {
        const response = await testApp.request.get("/v1/chat/sessions/active");
        expectUnauthorizedResponse(response);
      });
    });

    describe("GET /v1/chat/sessions/:conversationId", () => {
      it("should return 200 with valid conversationId", async () => {
        const response = await testApp.request
          .get("/v1/chat/sessions/test-conversation-id")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectSuccessResponse(response);
        expect(response.body).toHaveProperty("conversationId");
      });
    });

    describe("GET /v1/chat/sessions/:conversationId/messages", () => {
      it("should return 200 with messages", async () => {
        const response = await testApp.request
          .get("/v1/chat/sessions/test-conversation-id/messages")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectSuccessResponse(response);
        expect(response.body).toHaveProperty("messages");
      });
    });

    describe("DELETE /v1/chat/sessions/:conversationId", () => {
      it("should return 200 with valid conversationId", async () => {
        const response = await testApp.request
          .delete("/v1/chat/sessions/test-conversation-id")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectSuccessResponse(response);
        expect(response.body).toHaveProperty("success", true);
      });
    });
  });

  describe("Models API", () => {
    let testApp: ReturnType<typeof createTestApp>;

    beforeEach(() => {
      testApp = createTestApp();
    });

    describe("GET /v1/models", () => {
      it("should return 200 with model list", async () => {
        const response = await testApp.request
          .get("/v1/models")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectSuccessResponse(response);
        expect(response.body).toHaveProperty("object", "list");
      });

      it("should return 401 without authorization", async () => {
        const response = await testApp.request.get("/v1/models");
        expectUnauthorizedResponse(response);
      });
    });
  });

  describe("Interrupt API", () => {
    let testApp: ReturnType<typeof createTestApp>;

    beforeEach(() => {
      testApp = createTestApp();
    });

    describe("POST /v1/interrupt", () => {
      it("should return 200 with valid requestId", async () => {
        const response = await testApp.request
          .post("/v1/interrupt")
          .set("Authorization", `Bearer ${TEST_API_KEY}`)
          .send({ requestId: "test-request-id" });
        expectSuccessResponse(response);
        expect(response.body).toHaveProperty("requestId");
      });

      it("should return 400 with missing requestId", async () => {
        const response = await testApp.request
          .post("/v1/interrupt")
          .set("Authorization", `Bearer ${TEST_API_KEY}`)
          .send({});
        expectBadRequestResponse(response);
      });
    });
  });

  describe("Provider API", () => {
    let testApp: ReturnType<typeof createTestApp>;

    beforeEach(() => {
      testApp = createTestApp();
    });

    describe("GET /api/llm/providers", () => {
      it("should return 200 with provider list", async () => {
        const response = await testApp.request
          .get("/api/llm/providers")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectSuccessResponse(response);
        expect(response.body).toHaveProperty("providers");
      });

      it("should return 401 without authorization", async () => {
        const response = await testApp.request.get("/api/llm/providers");
        expectUnauthorizedResponse(response);
      });
    });

    describe("GET /api/llm/providers/adapters", () => {
      it("should return 200 with adapter list", async () => {
        const response = await testApp.request
          .get("/api/llm/providers/adapters")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectSuccessResponse(response);
        expect(response.body).toHaveProperty("adapters");
      });
    });

    describe("GET /api/llm/providers/:id", () => {
      it("should return 200 with valid provider id", async () => {
        const response = await testApp.request
          .get("/api/llm/providers/1")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectSuccessResponse(response);
        expect(response.body).toHaveProperty("provider");
      });

      it("should return 404 with non-existent provider", async () => {
        const response = await testApp.request
          .get("/api/llm/providers/99999")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectNotFoundResponse(response);
      });

      it("should return 400 with invalid provider id", async () => {
        const response = await testApp.request
          .get("/api/llm/providers/invalid")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectBadRequestResponse(response);
      });
    });

    describe("POST /api/llm/providers", () => {
      it("should return 201 with valid provider data", async () => {
        const provider = generateTestProvider();
        const response = await testApp.request
          .post("/api/llm/providers")
          .set("Authorization", `Bearer ${TEST_API_KEY}`)
          .send(provider);
        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty("provider");
      });

      it("should return 400 with missing required fields", async () => {
        const response = await testApp.request
          .post("/api/llm/providers")
          .set("Authorization", `Bearer ${TEST_API_KEY}`)
          .send({ name: "Test" });
        expectBadRequestResponse(response);
      });
    });

    describe("PUT /api/llm/providers/:id", () => {
      it("should return 200 with valid update", async () => {
        const response = await testApp.request
          .put("/api/llm/providers/1")
          .set("Authorization", `Bearer ${TEST_API_KEY}`)
          .send({ name: "Updated Provider" });
        expectSuccessResponse(response);
      });
    });

    describe("DELETE /api/llm/providers/:id", () => {
      it("should return 200 with valid provider id", async () => {
        const response = await testApp.request
          .delete("/api/llm/providers/1")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectSuccessResponse(response);
      });

      it("should return 404 with non-existent provider", async () => {
        const response = await testApp.request
          .delete("/api/llm/providers/99999")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectNotFoundResponse(response);
      });
    });

    describe("POST /api/llm/providers/test-connect", () => {
      it("should return 200 with valid connection", async () => {
        const provider = generateTestProvider();
        const response = await testApp.request
          .post("/api/llm/providers/test-connect")
          .set("Authorization", `Bearer ${TEST_API_KEY}`)
          .send(provider);
        expectSuccessResponse(response);
        expect(response.body).toHaveProperty("latency");
      });
    });
  });

  describe("Model API", () => {
    let testApp: ReturnType<typeof createTestApp>;

    beforeEach(() => {
      testApp = createTestApp();
    });

    describe("GET /api/llm/models", () => {
      it("should return 200 with model list", async () => {
        const response = await testApp.request
          .get("/api/llm/models")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectSuccessResponse(response);
        expect(response.body).toHaveProperty("models");
      });
    });

    describe("GET /api/llm/models/default", () => {
      it("should return 200 with default model", async () => {
        const response = await testApp.request
          .get("/api/llm/models/default")
          .query({ type: "nlp" })
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectSuccessResponse(response);
        expect(response.body).toHaveProperty("model");
      });

      it("should return 400 without type parameter", async () => {
        const response = await testApp.request
          .get("/api/llm/models/default")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectBadRequestResponse(response);
      });
    });

    describe("GET /api/llm/providers/:providerId/models", () => {
      it("should return 200 with model list", async () => {
        const response = await testApp.request
          .get("/api/llm/providers/1/models")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectSuccessResponse(response);
        expect(response.body).toHaveProperty("models");
      });
    });

    describe("POST /api/llm/providers/:providerId/models", () => {
      it("should return 201 with valid model data", async () => {
        const model = generateTestModel();
        const response = await testApp.request
          .post("/api/llm/providers/1/models")
          .set("Authorization", `Bearer ${TEST_API_KEY}`)
          .send(model);
        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty("id");
      });
    });

    describe("DELETE /api/llm/providers/:providerId/models/:modelId", () => {
      it("should return 200 with valid model id", async () => {
        const response = await testApp.request
          .delete("/api/llm/providers/1/models/1")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectSuccessResponse(response);
      });
    });
  });

  describe("Skills API", () => {
    let testApp: ReturnType<typeof createTestApp>;

    beforeEach(() => {
      testApp = createTestApp();
    });

    describe("GET /api/skills", () => {
      it("should return 200 with skill list", async () => {
        const response = await testApp.request
          .get("/api/skills")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectSuccessResponse(response);
        expect(response.body).toHaveProperty("skills");
      });
    });

    describe("GET /api/skills/:name", () => {
      it("should return 200 with valid skill name", async () => {
        const response = await testApp.request
          .get("/api/skills/test-skill")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectSuccessResponse(response);
      });

      it("should return 404 with non-existent skill", async () => {
        const response = await testApp.request
          .get("/api/skills/non-existent-skill")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectNotFoundResponse(response);
      });
    });

    describe("GET /api/skills/stats", () => {
      it("should return 200 with skill statistics", async () => {
        const response = await testApp.request
          .get("/api/skills/stats")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectSuccessResponse(response);
        expect(response.body).toHaveProperty("totalSkills");
      });
    });

    describe("POST /api/skills/reindex", () => {
      it("should return 200 with success message", async () => {
        const response = await testApp.request
          .post("/api/skills/reindex")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectSuccessResponse(response);
      });
    });

    describe("DELETE /api/skills/:name", () => {
      it("should return 200 with valid skill name", async () => {
        const response = await testApp.request
          .delete("/api/skills/test-skill")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expectSuccessResponse(response);
      });
    });

    describe("PUT /api/skills/:name/description", () => {
      it("should return 200 with valid update", async () => {
        const response = await testApp.request
          .put("/api/skills/test-skill/description")
          .set("Authorization", `Bearer ${TEST_API_KEY}`)
          .send({ description: "Updated description" });
        expectSuccessResponse(response);
      });
    });
  });

  describe("MCP API", () => {
    let testApp: ReturnType<typeof createTestApp>;

    beforeEach(() => {
      testApp = createTestApp(createMockConfig({ authEnabled: false }));
    });

    describe("GET /api/mcp/servers", () => {
      it("should return 200 with server list", async () => {
        const response = await testApp.request.get("/api/mcp/servers");
        expectSuccessResponse(response);
        expect(response.body).toHaveProperty("servers");
      });
    });

    describe("GET /api/mcp/servers/:serverId", () => {
      it("should return 200 with valid server", async () => {
        const response = await testApp.request.get("/api/mcp/servers/test-server");
        expectSuccessResponse(response);
        expect(response.body).toHaveProperty("server");
      });

      it("should return 404 with non-existent server", async () => {
        const response = await testApp.request.get("/api/mcp/servers/non-existent");
        expectNotFoundResponse(response);
      });
    });

    describe("POST /api/mcp/servers", () => {
      it("should return 201 with valid server config", async () => {
        const server = { id: "new-server", type: "stdio", command: "echo", args: ["test"] };
        const response = await testApp.request.post("/api/mcp/servers").send(server);
        expect(response.status).toBe(201);
      });

      it("should return 400 with missing required fields", async () => {
        const response = await testApp.request.post("/api/mcp/servers").send({ name: "Test" });
        expectBadRequestResponse(response);
      });
    });

    describe("DELETE /api/mcp/servers/:serverId", () => {
      it("should return 200 with valid server", async () => {
        const response = await testApp.request.delete("/api/mcp/servers/test-server");
        expectSuccessResponse(response);
      });
    });

    describe("POST /api/mcp/servers/:serverId/restart", () => {
      it("should return 200 with valid server", async () => {
        const response = await testApp.request.post("/api/mcp/servers/test-server/restart");
        expectSuccessResponse(response);
      });
    });

    describe("GET /api/mcp/statistics", () => {
      it("should return 200 with statistics", async () => {
        const response = await testApp.request.get("/api/mcp/statistics");
        expectSuccessResponse(response);
      });
    });

    describe("GET /api/mcp/health", () => {
      it("should return 200 with healthy status", async () => {
        const response = await testApp.request.get("/api/mcp/health");
        expectSuccessResponse(response);
      });
    });
  });

  describe("Error Handling", () => {
    let testApp: ReturnType<typeof createTestApp>;

    beforeEach(() => {
      testApp = createTestApp();
    });

    describe("Invalid Path", () => {
      it("should return 404 for unknown paths", async () => {
        const response = await testApp.request
          .get("/unknown/path")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expect(response.status).toBe(404);
      });
    });

    describe("Invalid ID Parameters", () => {
      it("should return 400 for non-numeric provider ID", async () => {
        const response = await testApp.request
          .get("/api/llm/providers/abc")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expect(response.status).toBe(400);
      });

      it("should return 400 for non-numeric model ID", async () => {
        const response = await testApp.request
          .get("/api/llm/providers/1/models/xyz")
          .set("Authorization", `Bearer ${TEST_API_KEY}`);
        expect(response.status).toBe(400);
      });
    });

    describe("Empty Body Validation", () => {
      it("should return 400 for empty provider update", async () => {
        const response = await testApp.request
          .put("/api/llm/providers/1")
          .set("Authorization", `Bearer ${TEST_API_KEY}`)
          .send({});
        expect(response.status).toBe(400);
      });

      it("should return 400 for empty model update", async () => {
        const response = await testApp.request
          .put("/api/llm/providers/1/models/1")
          .set("Authorization", `Bearer ${TEST_API_KEY}`)
          .send({});
        expect(response.status).toBe(400);
      });
    });
  });
});
