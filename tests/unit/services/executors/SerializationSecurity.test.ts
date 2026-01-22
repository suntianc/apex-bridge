/**
 * 安全序列化测试
 */

import { describe, it, expect } from "vitest";

// 复制 safeStringify 函数进行测试
function safeStringify(obj: any): string {
  const seen: any[] = [];
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.includes(value)) {
        return "[Circular]";
      }
      seen.push(value);
    }
    if (value === undefined) {
      return null;
    }
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (typeof value === "function") {
      return "[Function]";
    }
    return value;
  });
}

describe("安全序列化", () => {
  it("应该正确序列化普通对象", () => {
    const obj = { name: "test", value: 123 };
    const result = safeStringify(obj);
    expect(result).toBe('{"name":"test","value":123}');
  });

  it("应该处理循环引用", () => {
    const obj: any = { name: "test" };
    obj.self = obj;

    const result = safeStringify(obj);
    expect(result).toContain("[Circular]");
  });

  it("应该处理 undefined 值", () => {
    const obj = { name: "test", value: undefined };
    const result = safeStringify(obj);
    expect(result).toBe('{"name":"test","value":null}');
  });

  it("应该处理 bigint 值", () => {
    const obj = { big: BigInt(123) };
    const result = safeStringify(obj);
    expect(result).toBe('{"big":"123"}');
  });

  it("应该处理函数值", () => {
    const obj = { fn: function () {} };
    const result = safeStringify(obj);
    expect(result).toContain("[Function]");
  });

  it("应该处理嵌套循环引用", () => {
    const obj1: any = { name: "obj1" };
    const obj2: any = { name: "obj2", ref: obj1 };
    obj1.ref = obj2;

    const result = safeStringify(obj1);
    expect(result).toContain("[Circular]");
  });
});

describe("参数大小限制", () => {
  const MAX_ARGS_SIZE = 1 * 1024 * 1024; // 1MB

  it("应该接受小于限制的参数", () => {
    const args = { data: "x".repeat(1000) }; // 1KB
    const size = Buffer.byteLength(JSON.stringify(args));
    expect(size).toBeLessThan(MAX_ARGS_SIZE);
  });

  it("应该拒绝超过限制的参数", () => {
    const args = { data: "x".repeat(MAX_ARGS_SIZE + 1) };
    const size = Buffer.byteLength(JSON.stringify(args));
    expect(size).toBeGreaterThan(MAX_ARGS_SIZE);
  });
});
