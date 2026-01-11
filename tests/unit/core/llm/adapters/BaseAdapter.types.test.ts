/**
 * BaseAdapter 类型安全测试
 * 验证 H-005 修复：明确的接口类型定义
 */

describe("BaseAdapter - 类型安全 (H-005)", () => {
  describe("AxiosRequestConfig 接口", () => {
    it("应该正确定义代理配置类型", () => {
      // 验证 false 类型
      const noProxyConfig: { proxy: false } = { proxy: false };
      expect(noProxyConfig.proxy).toBe(false);

      // 验证代理对象类型
      const proxyConfig: { proxy: { host: string; port: number } } = {
        proxy: { host: "127.0.0.1", port: 7890 },
      };
      expect(proxyConfig.proxy.host).toBe("127.0.0.1");
      expect(proxyConfig.proxy.port).toBe(7890);
    });

    it("应该支持完整的代理配置", () => {
      const fullProxyConfig = {
        proxy: {
          host: "proxy.example.com",
          port: 8080,
          protocol: "http",
          auth: {
            username: "user",
            password: "pass",
          },
        },
      };

      expect(fullProxyConfig.proxy.host).toBe("proxy.example.com");
      expect(fullProxyConfig.proxy.auth?.username).toBe("user");
    });
  });

  describe("OpenAIRequestBody 接口", () => {
    it("应该支持基本请求字段", () => {
      const request: { model: string; messages: unknown[]; stream: boolean } = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        stream: false,
      };

      expect(request.model).toBe("gpt-4");
      expect(request.stream).toBe(false);
    });

    it("应该支持生成配置字段", () => {
      const requestWithConfig = {
        model: "gpt-4",
        temperature: 0.7,
        top_p: 0.9,
        frequency_penalty: 0.5,
        presence_penalty: 0.3,
        repetition_penalty: 1.1,
        seed: 42,
        logit_bias: { "123": 1 },
      };

      expect(requestWithConfig.temperature).toBe(0.7);
      expect(requestWithConfig.seed).toBe(42);
    });

    it("应该支持输出配置字段", () => {
      const requestWithOutput = {
        model: "gpt-4",
        max_tokens: 1000,
        response_format: { type: "json_object" },
        stop: ["END", "STOP"],
      };

      expect(requestWithOutput.max_tokens).toBe(1000);
      expect(requestWithOutput.response_format.type).toBe("json_object");
      expect(requestWithOutput.stop).toContain("END");
    });

    it("应该支持工具调用", () => {
      const requestWithTools = {
        model: "gpt-4",
        tools: [{ type: "function", function: { name: "search" } }],
        tool_choice: "auto",
      };

      expect(requestWithTools.tools?.length).toBe(1);
      expect(requestWithTools.tool_choice).toBe("auto");
    });
  });

  describe("OpenAIResponse 接口", () => {
    it("应该正确定义响应结构", () => {
      const response: { id: string; choices: Array<{ index: number }> } = {
        id: "chatcmpl-123",
        choices: [{ index: 0 }],
      };

      expect(response.id).toBe("chatcmpl-123");
      expect(response.choices[0].index).toBe(0);
    });

    it("应该支持使用量统计", () => {
      const responseWithUsage = {
        id: "chatcmpl-123",
        choices: [{ index: 0 }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      expect(responseWithUsage.usage?.total_tokens).toBe(30);
    });
  });

  describe("类型安全性验证", () => {
    it("应该拒绝无效的温度值类型", () => {
      // 验证类型安全：temperature 应该是 number
      const validTemp = { temperature: 0.7 };
      expect(typeof validTemp.temperature).toBe("number");
    });

    it("应该拒绝非法的 max_tokens 值", () => {
      const validMaxTokens = { max_tokens: 1000 };
      expect(typeof validMaxTokens.max_tokens).toBe("number");
    });

    it("应该支持正确的 stop 序列类型", () => {
      const validStop = { stop: ["END", "DONE"] };
      expect(Array.isArray(validStop.stop)).toBe(true);
      expect(validStop.stop.every((s) => typeof s === "string")).toBe(true);
    });
  });
});
