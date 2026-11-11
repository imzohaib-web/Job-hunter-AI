import AxiosMockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";
import { createAiClient, shouldRetryAiRequest } from "../src/services/aiClient.js";
import axios, { AxiosError } from "axios";

describe("shouldRetryAiRequest", () => {
  it("retries network errors", () => {
    const error = new AxiosError("Network Error");
    expect(shouldRetryAiRequest(error)).toBe(true);
  });

  it("retries 5xx responses", () => {
    const error = new AxiosError("Server Error");
    error.response = {
      status: 503,
      data: {},
      statusText: "Service Unavailable",
      headers: {},
      config: { headers: new axios.AxiosHeaders() },
    };
    expect(shouldRetryAiRequest(error)).toBe(true);
  });

  it("does not retry 4xx responses", () => {
    const error = new AxiosError("Unauthorized");
    error.response = {
      status: 401,
      data: {},
      statusText: "Unauthorized",
      headers: {},
      config: { headers: new axios.AxiosHeaders() },
    };
    expect(shouldRetryAiRequest(error)).toBe(false);
  });
});

describe("createAiClient retry behaviour", () => {
  const clients: ReturnType<typeof createAiClient>[] = [];

  afterEach(() => {
    clients.length = 0;
  });

  it("retries 5xx up to 3 total tries then succeeds", async () => {
    const client = createAiClient({
      baseURL: "http://ai-service.test",
      serviceKey: "test-key",
      retries: 2,
    });
    clients.push(client);
    const mock = new AxiosMockAdapter(client);

    mock
      .onGet("/health")
      .replyOnce(503)
      .onGet("/health")
      .replyOnce(503)
      .onGet("/health")
      .reply(200, { status: "ok" });

    const res = await client.get("/health");
    expect(res.status).toBe(200);
    expect(mock.history.get).toHaveLength(3);
  });

  it("retries network errors then succeeds", async () => {
    const client = createAiClient({
      baseURL: "http://ai-service.test",
      serviceKey: "test-key",
      retries: 2,
    });
    clients.push(client);
    const mock = new AxiosMockAdapter(client);

    mock
      .onGet("/health")
      .networkErrorOnce()
      .onGet("/health")
      .networkErrorOnce()
      .onGet("/health")
      .reply(200, { status: "ok" });

    const res = await client.get("/health");
    expect(res.status).toBe(200);
    expect(mock.history.get).toHaveLength(3);
  });

  it("does not retry 4xx responses", async () => {
    const client = createAiClient({
      baseURL: "http://ai-service.test",
      serviceKey: "test-key",
      retries: 2,
    });
    clients.push(client);
    const mock = new AxiosMockAdapter(client);
    mock.onGet("/health").reply(401, { error: { code: "UNAUTHORIZED" } });

    await expect(client.get("/health")).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(mock.history.get).toHaveLength(1);
  });

  it("sets X-Service-Key header", async () => {
    const client = createAiClient({
      baseURL: "http://ai-service.test",
      serviceKey: "secret-key",
      retries: 0,
    });
    clients.push(client);
    const mock = new AxiosMockAdapter(client);
    mock.onGet("/health").reply(200, { status: "ok" });

    await client.get("/health");
    expect(mock.history.get[0]?.headers?.["X-Service-Key"]).toBe("secret-key");
  });
});
