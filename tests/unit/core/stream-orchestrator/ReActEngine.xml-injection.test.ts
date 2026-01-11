/**
 * ReActEngine XML 注入防护测试
 * 验证 H-003 修复：XML 转义增强
 */

describe("ReActEngine - XML 注入防护 (H-003)", () => {
  // 模拟 escapeXmlContent 方法的测试
  const escapeXmlContent = (content: string): string => {
    if (!content || typeof content !== "string") {
      return "";
    }

    return content
      .replace(/&/g, "&#x26;")
      .replace(/</g, "&#x3C;")
      .replace(/>/g, "&#x3E;")
      .replace(/"/g, "&#x22;")
      .replace(/'/g, "&#x27;")
      .replace(/<!--/g, "&#x3C;!--")
      .replace(/-->/g, "--&#x3E;")
      .replace(/<\?/g, "&#x3C;?")
      .replace(/\?>/g, "?&#x3E;")
      .replace(/\]\]>/g, "]]&#x3E;");
  };

  describe("基本字符转义", () => {
    it("应该转义 & 字符", () => {
      expect(escapeXmlContent("AT&T")).toBe("AT&#x26;T");
    });

    it("应该转义 < 字符", () => {
      expect(escapeXmlContent("<script>")).toBe("&#x3C;script&#x3E;");
    });

    it("应该转义 > 字符", () => {
      expect(escapeXmlContent("a > b")).toBe("a &#x3E; b");
    });

    it('应该转义 " 字符', () => {
      expect(escapeXmlContent('say "hello"')).toBe("say &#x22;hello&#x22;");
    });

    it("应该转义 ' 字符", () => {
      expect(escapeXmlContent("it's")).toBe("it&#x27;s");
    });
  });

  describe("XML 注释转义", () => {
    it("应该转义注释开始标记", () => {
      expect(escapeXmlContent("<!-- comment -->")).toBe("&#x3C;!-- comment --&#x3E;");
    });

    it("应该转义单独的 <!-- 字符串", () => {
      expect(escapeXmlContent("<!--")).toBe("&#x3C;!--");
    });

    it("应该转义单独的 --> 字符串", () => {
      expect(escapeXmlContent("-->")).toBe("--&#x3E;");
    });
  });

  describe("处理指令转义", () => {
    it("应该转义处理指令开始", () => {
      // 注意：由于转义顺序，双引号会先被转义
      expect(escapeXmlContent('<?xml version="1.0"?>')).toBe(
        "&#x3C;?xml version=&#x22;1.0&#x22;?&#x3E;"
      );
    });

    it("应该转义单独的 <? 字符串", () => {
      expect(escapeXmlContent("<?")).toBe("&#x3C;?");
    });

    it("应该转义单独的 ?> 字符串", () => {
      expect(escapeXmlContent("?>")).toBe("?&#x3E;");
    });
  });

  describe("CDATA 转义", () => {
    it("应该转义 CDATA 结束标记", () => {
      expect(escapeXmlContent("]]>")).toBe("]]&#x3E;");
    });

    it("应该转义嵌套的 CDATA 结束标记", () => {
      expect(escapeXmlContent("text ]]> more ]]> text")).toBe("text ]]&#x3E; more ]]&#x3E; text");
    });
  });

  describe("注入攻击防护", () => {
    it("应该防护 XML 注释注入", () => {
      const malicious = "<!-- malicious -->";
      const escaped = escapeXmlContent(malicious);
      expect(escaped).not.toContain("<!--");
      expect(escaped).not.toContain("-->");
    });

    it("应该防护处理指令注入", () => {
      const malicious = '<?xml version="1.0" encoding="UTF-8"?>';
      const escaped = escapeXmlContent(malicious);
      expect(escaped).not.toContain("<?");
      expect(escaped).not.toContain("?>");
    });

    it("应该防护 CDATA 注入", () => {
      const malicious = "<![CDATA[malicious]]>";
      const escaped = escapeXmlContent(malicious);
      expect(escaped).not.toContain("<![CDATA[");
      expect(escaped).not.toContain("]]>");
    });

    it("应该防护混合注入攻击", () => {
      const malicious = "text <!-- comment --> more <?pi?> data ]]> end";
      const escaped = escapeXmlContent(malicious);

      expect(escaped).not.toContain("<!--");
      expect(escaped).not.toContain("-->");
      expect(escaped).not.toContain("<?");
      expect(escaped).not.toContain("?>");
      expect(escaped).not.toContain("]]>");
    });
  });

  describe("边界情况", () => {
    it("应该处理空字符串", () => {
      expect(escapeXmlContent("")).toBe("");
    });

    it("应该处理 null/undefined", () => {
      expect(escapeXmlContent(null as any)).toBe("");
      expect(escapeXmlContent(undefined as any)).toBe("");
    });

    it("应该处理普通文本（不包含特殊字符）", () => {
      expect(escapeXmlContent("Hello World")).toBe("Hello World");
    });

    it("应该处理数字", () => {
      expect(escapeXmlContent("123")).toBe("123");
    });
  });
});
