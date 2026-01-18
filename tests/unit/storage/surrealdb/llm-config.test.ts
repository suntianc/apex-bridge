import { SurrealDBClient } from "@/core/storage/surrealdb/client";
import { SurrealDBLLMConfigStorage } from "@/core/storage/surrealdb/llm-config";
import { LLMModelType } from "@/types/llm-models";

jest.mock("@/core/storage/surrealdb/client");

describe("SurrealDBLLMConfigStorage", () => {
  let storage: SurrealDBLLMConfigStorage;
  let client: jest.Mocked<SurrealDBClient>;

  beforeEach(() => {
    (SurrealDBClient.getInstance as unknown as jest.Mock).mockReturnValue({
      isConnected: jest.fn().mockReturnValue(true),
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
      select: jest.fn(),
      selectById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn(),
      withTransaction: jest.fn(async (fn: () => Promise<unknown>) => fn()),
      getConnectionInfo: jest.fn(),
    } as unknown as jest.Mocked<SurrealDBClient>);

    storage = new SurrealDBLLMConfigStorage();
    client = SurrealDBClient.getInstance() as unknown as jest.Mocked<SurrealDBClient>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should persist model_config and related fields in createProviderWithModels", async () => {
    const now = Date.now();

    const provider = {
      id: 123,
      provider: "openai",
      name: "OpenAI",
      baseConfig: { baseURL: "https://api.openai.com/v1" },
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };

    const models = [
      {
        id: 0,
        providerId: 123,
        modelKey: "gpt-4",
        modelName: "GPT-4",
        modelType: LLMModelType.NLP,
        modelConfig: { temperature: 0.7, maxTokens: 4096 },
        apiEndpointSuffix: "/v1/chat/completions",
        enabled: true,
        isDefault: true,
        displayOrder: 7,
        createdAt: now,
        updatedAt: now,
      },
    ];

    jest.spyOn(storage, "save").mockResolvedValue("123");

    await storage.createProviderWithModels(provider, models);

    expect(client.upsert).toHaveBeenCalledTimes(1);

    const [, modelRecord] = (client.upsert as jest.Mock).mock.calls[0];

    expect(modelRecord).toMatchObject({
      provider_id: "123",
      key: "gpt-4",
      name: "GPT-4",
      type: "nlp",
      model_config: { temperature: 0.7, maxTokens: 4096 },
      api_endpoint_suffix: "/v1/chat/completions",
      enabled: true,
      is_default: true,
      display_order: 7,
      created_at: now,
      updated_at: now,
    });
  });

  it("should parse model_config string if returned as JSON string", async () => {
    const now = Date.now();

    (client.query as jest.Mock).mockResolvedValue([
      [
        {
          id: "llm_models:1",
          provider_id: "123",
          key: "gpt-4",
          name: "GPT-4",
          type: "nlp",
          model_config: JSON.stringify({ temperature: 0.5 }),
          api_endpoint_suffix: null,
          enabled: false,
          is_default: false,
          display_order: 0,
          created_at: now,
          updated_at: now,
        },
      ],
    ]);

    const result = await storage.getModelsByProvider("123");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      providerId: 123,
      modelKey: "gpt-4",
      modelName: "GPT-4",
      modelType: LLMModelType.NLP,
      modelConfig: { temperature: 0.5 },
      enabled: false,
    });
  });
});
