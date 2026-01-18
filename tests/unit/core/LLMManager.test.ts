import { LLMModelType } from "@/types/llm-models";

jest.mock("@/services/LLMConfigService", () => {
  return {
    LLMConfigService: {
      getInstance: jest.fn(),
    },
  };
});

jest.mock("@/services/ModelRegistry", () => {
  return {
    ModelRegistry: {
      getInstance: jest.fn(),
    },
  };
});

jest.mock("@/core/llm/adapters", () => {
  return {
    LLMAdapterFactory: {
      create: jest.fn(),
    },
  };
});

describe("LLMManager model selection", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("should select NLP model by provider+model when registry misses (stream)", async () => {
    const { LLMConfigService } = await import("@/services/LLMConfigService");
    const { ModelRegistry } = await import("@/services/ModelRegistry");
    const { LLMAdapterFactory } = await import("@/core/llm/adapters");

    const streamChat = async function* () {
      yield "chunk";
    };

    const adapter = {
      streamChat,
    };

    (LLMAdapterFactory.create as unknown as jest.Mock).mockReturnValue(adapter);

    const provider = {
      id: 1,
      provider: "deepseek",
      name: "DeepSeek",
      description: null,
      baseConfig: { apiKey: "k", baseURL: "https://api.deepseek.com/v1" },
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const model = {
      id: 1,
      providerId: 1,
      modelKey: "deepseek-chat",
      modelName: "DeepSeek Chat",
      modelType: LLMModelType.NLP,
      modelConfig: {},
      apiEndpointSuffix: null,
      enabled: true,
      isDefault: false,
      displayOrder: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    (LLMConfigService.getInstance as unknown as jest.Mock).mockReturnValue({
      listProviders: jest.fn().mockResolvedValue([]),
      getProviderByKey: jest.fn().mockResolvedValue(provider),
      getProviderModels: jest.fn().mockResolvedValue([model]),
      listModels: jest.fn().mockResolvedValue([]),
    });

    (ModelRegistry.getInstance as unknown as jest.Mock).mockReturnValue({
      findModel: jest.fn().mockReturnValue(null),
      getDefaultModel: jest.fn(),
    });

    const { LLMManager } = await import("@/core/LLMManager");
    const manager = new LLMManager();

    const chunks: string[] = [];
    for await (const c of manager.streamChat([{ role: "user", content: "hi" }], {
      provider: "deepseek",
      model: "deepseek-chat",
    })) {
      chunks.push(c);
    }

    expect(chunks).toEqual(["chunk"]);
  });
});
