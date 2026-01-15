jest.mock("surrealdb", () => {
  const SurrealMock = jest.fn();
  return {
    __esModule: true,
    default: SurrealMock,
  };
});

import type { SurrealDBConfig } from "@/core/storage/interfaces";

interface MockSurrealClient {
  connect: jest.Mock<Promise<unknown>, [string]>;
  signin: jest.Mock<Promise<unknown>, [{ username: string; password: string }]>;
  use: jest.Mock<Promise<unknown>, [{ namespace: string; database: string }]>;
  query: jest.Mock<Promise<unknown>, [string, (Record<string, unknown> | undefined)?]>;
  select: jest.Mock<Promise<unknown>, [string]>;
  create: jest.Mock<Promise<unknown>, [string, Record<string, unknown>]>;
  update: jest.Mock<Promise<unknown>, [string, Record<string, unknown>]>;
  delete: jest.Mock<Promise<unknown>, [string]>;
  close: jest.Mock<Promise<void>, []>;
}

function createMockSurrealClient(overrides: Partial<MockSurrealClient> = {}): MockSurrealClient {
  return {
    connect: jest.fn().mockResolvedValue(true),
    signin: jest.fn().mockResolvedValue({}),
    use: jest.fn().mockResolvedValue({}),
    query: jest.fn().mockResolvedValue([]),
    select: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue(true),
    close: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function getSurrealMock(): jest.Mock {
  const surrealdbModule = require("surrealdb") as { default: jest.Mock };
  return surrealdbModule.default;
}

describe("SurrealDBClient", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("throws a clear error when used before connect", async () => {
    const { SurrealDBClient } = await import("@/core/storage/surrealdb/client");
    const client = SurrealDBClient.getInstance();

    await expect(client.query("SELECT 1")).rejects.toThrow("Not connected");
  });

  it("retries connect with bounded attempts", async () => {
    jest.useFakeTimers();

    const originalRandom = Math.random;
    Math.random = () => 0;

    const SurrealMock = getSurrealMock();

    const attempt1 = createMockSurrealClient({
      connect: jest.fn().mockRejectedValue(new Error("connect failed")),
    });

    const attempt2 = createMockSurrealClient({
      connect: jest.fn().mockResolvedValue(true),
    });

    SurrealMock.mockImplementationOnce(() => attempt1);
    SurrealMock.mockImplementationOnce(() => attempt2);

    const { SurrealDBClient } = await import("@/core/storage/surrealdb/client");

    const client = SurrealDBClient.getInstance();
    const config: SurrealDBConfig = {
      url: "ws://localhost:8000",
      namespace: "ns",
      database: "db",
      username: "user",
      password: "pass",
      timeout: 10000,
      maxRetries: 1,
    };

    const promise = client.connect(config);

    await jest.advanceTimersByTimeAsync(1000);
    await promise;

    expect(attempt1.connect).toHaveBeenCalledTimes(1);
    expect(attempt2.connect).toHaveBeenCalledTimes(1);
    expect(SurrealMock).toHaveBeenCalledTimes(2);

    Math.random = originalRandom;
    jest.useRealTimers();
  });

  it("fails fast on timeout", async () => {
    jest.useFakeTimers();

    const SurrealMock = getSurrealMock();

    const attempt1 = createMockSurrealClient({
      connect: jest.fn().mockImplementation(() => new Promise(() => {})),
    });

    SurrealMock.mockImplementationOnce(() => attempt1);

    const { SurrealDBClient } = await import("@/core/storage/surrealdb/client");

    const client = SurrealDBClient.getInstance();
    const config: SurrealDBConfig = {
      url: "ws://localhost:8000",
      namespace: "ns",
      database: "db",
      username: "user",
      password: "pass",
      timeout: 10,
      maxRetries: 0,
    };

    const promise = client.connect(config);
    const expectation = expect(promise).rejects.toThrow("timed out");

    await jest.advanceTimersByTimeAsync(50);

    await expectation;

    jest.useRealTimers();
  });

  it("connect is idempotent while connecting", async () => {
    const SurrealMock = getSurrealMock();

    let resolveConnect: ((value: unknown) => void) | null = null;
    const connectPromise = new Promise<unknown>((resolve) => {
      resolveConnect = resolve;
    });

    const attempt1 = createMockSurrealClient({
      connect: jest.fn().mockImplementation(() => connectPromise),
    });

    SurrealMock.mockImplementationOnce(() => attempt1);

    const { SurrealDBClient } = await import("@/core/storage/surrealdb/client");

    const client = SurrealDBClient.getInstance();
    const config: SurrealDBConfig = {
      url: "ws://localhost:8000",
      namespace: "ns",
      database: "db",
      username: "user",
      password: "pass",
      timeout: 10000,
      maxRetries: 0,
    };

    const p1 = client.connect(config);
    const p2 = client.connect(config);

    expect(SurrealMock).toHaveBeenCalledTimes(1);
    expect(attempt1.connect).toHaveBeenCalledTimes(1);

    if (!resolveConnect) {
      throw new Error("resolveConnect not assigned");
    }

    resolveConnect(true);
    await Promise.all([p1, p2]);

    expect(client.connected).toBe(true);
  });
});
