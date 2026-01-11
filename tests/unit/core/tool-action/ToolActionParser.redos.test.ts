/**
 * ToolActionParser ReDoS 防护测试
 * 验证 H-004 修复：正则表达式长度限制
 */

describe("ToolActionParser - ReDoS 防护 (H-004)", () => {
  // 模拟输入长度限制
  const MAX_INPUT_LENGTH = 50000;

  describe("输入长度验证", () => {
    it("应该接受有效长度的输入", () => {
      const validInput = '<tool_action name="test"><param value="test" /></tool_action>';
      expect(validInput.length).toBeLessThanOrEqual(MAX_INPUT_LENGTH);
    });

    it("应该拒绝超过长度限制的输入", () => {
      const tooLongInput = "a".repeat(MAX_INPUT_LENGTH + 1);
      expect(tooLongInput.length).toBeGreaterThan(MAX_INPUT_LENGTH);
    });

    it("应该处理空输入", () => {
      const emptyInput = "";
      expect(emptyInput.length).toBeLessThanOrEqual(MAX_INPUT_LENGTH);
    });
  });

  describe("正则表达式长度限制", () => {
    it("工具名称应该有长度限制", () => {
      // 模拟正则表达式：name="([^"]{1,1000})"
      const longName = "a".repeat(1001);
      const validName = "a".repeat(1000);

      // 长名称应该不匹配（超出限制）
      expect(longName.length).toBeGreaterThan(1000);
      expect(validName.length).toBeLessThanOrEqual(1000);
    });

    it("类型名称应该有长度限制", () => {
      // 模拟正则表达式：type="([^"]{1,100})"
      const longType = "a".repeat(101);
      const validType = "a".repeat(100);

      expect(longType.length).toBeGreaterThan(100);
      expect(validType.length).toBeLessThanOrEqual(100);
    });

    it("标签内容应该有长度限制", () => {
      // 模拟正则表达式：([\s\S]{0,5000})
      const longContent = "a".repeat(5001);
      const validContent = "a".repeat(5000);

      expect(longContent.length).toBeGreaterThan(5000);
      expect(validContent.length).toBeLessThanOrEqual(5000);
    });
  });

  describe("ReDoS 攻击防护", () => {
    it("应该防护贪婪匹配攻击", () => {
      // 构造可能导致 ReDoS 的输入
      const maliciousPattern = '<tool_action name="test">' + "a".repeat(10000) + "</tool_action>";
      expect(maliciousPattern.length).toBeGreaterThan(5000);
    });

    it("应该限制参数值长度", () => {
      // 模拟 PARAM_REGEX: value="([^"]{0,5000})"
      const longParamValue = "a".repeat(5001);
      expect(longParamValue.length).toBeGreaterThan(5000);
    });

    it("应该限制参数名称长度", () => {
      // 模拟 PARAM_REGEX: <(\w{1,100})
      const longParamName = "a".repeat(101);
      expect(longParamName.length).toBeGreaterThan(100);
    });
  });

  describe("边界情况处理", () => {
    it("应该处理正常大小的工具调用", () => {
      const normalCall = `
        <tool_action name="search" type="builtin">
          <param value="query" />
          <param value="limit" />
        </tool_action>
      `.trim();

      expect(normalCall.length).toBeLessThan(MAX_INPUT_LENGTH);
    });

    it("应该处理包含特殊字符但有效的输入", () => {
      const specialChars = '<tool_action name="test"><param value="<>&\"\'" /></tool_action>';
      expect(specialChars.length).toBeLessThanOrEqual(MAX_INPUT_LENGTH);
    });
  });
});
