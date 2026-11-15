import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiClient,
  getAccessToken,
  registerAuthStateSync,
  setAccessToken,
} from "./api";

describe("API Layer & 401 Refresh Interceptor", () => {
  let mockApiClient: MockAdapter;
  let mockAxios: MockAdapter;

  beforeEach(() => {
    mockApiClient = new MockAdapter(apiClient);
    mockAxios = new MockAdapter(axios);
    setAccessToken(null);
  });

  afterEach(() => {
    mockApiClient.restore();
    mockAxios.restore();
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  it("attaches Authorization header when accessToken is present in memory", async () => {
    setAccessToken("initial-test-token");

    mockApiClient.onGet("/test-endpoint").reply((config) => {
      expect(config.headers?.Authorization).toBe("Bearer initial-test-token");
      return [200, { success: true }];
    });

    const res = await apiClient.get("/test-endpoint");
    expect(res.data).toEqual({ success: true });
  });

  it("does not attach Authorization header when accessToken is null", async () => {
    setAccessToken(null);

    mockApiClient.onGet("/test-endpoint").reply((config) => {
      expect(config.headers?.Authorization).toBeUndefined();
      return [200, { ok: true }];
    });

    const res = await apiClient.get("/test-endpoint");
    expect(res.data).toEqual({ ok: true });
  });

  it("automatically refreshes token on 401 and retries the original request", async () => {
    setAccessToken("expired-token");

    // First attempt returns 401; second attempt (with new token) returns 200
    let callCount = 0;
    mockApiClient.onGet("/protected-resource").reply((config) => {
      callCount++;
      if (callCount === 1) {
        expect(config.headers?.Authorization).toBe("Bearer expired-token");
        return [401, { error: { code: "UNAUTHORIZED", message: "Token expired" } }];
      }
      expect(config.headers?.Authorization).toBe("Bearer new-refreshed-token");
      return [200, { data: "secret data" }];
    });

    // Mock refresh endpoint called by refreshAuthSession via axios.post
    mockAxios.onPost("/api/auth/refresh").reply(200, {
      accessToken: "new-refreshed-token",
      user: { id: "u1", email: "test@example.com", name: "Tester", role: "user" },
    });

    const res = await apiClient.get("/protected-resource");

    expect(res.data).toEqual({ data: "secret data" });
    expect(getAccessToken()).toBe("new-refreshed-token");
    expect(callCount).toBe(2);
  });

  it("executes a SINGLE in-flight refresh when multiple concurrent requests get 401", async () => {
    setAccessToken("expired-token");

    let refreshCallCount = 0;
    mockAxios.onPost("/api/auth/refresh").reply(() => {
      refreshCallCount++;
      return [
        200,
        {
          accessToken: "concurrent-new-token",
          user: { id: "u1", email: "test@example.com", name: "Tester", role: "user" },
        },
      ];
    });

    let resource1Count = 0;
    mockApiClient.onGet("/resource-1").reply((config) => {
      resource1Count++;
      if (resource1Count === 1) {
        return [401, { error: "unauthorized" }];
      }
      expect(config.headers?.Authorization).toBe("Bearer concurrent-new-token");
      return [200, { res: "one" }];
    });

    let resource2Count = 0;
    mockApiClient.onGet("/resource-2").reply((config) => {
      resource2Count++;
      if (resource2Count === 1) {
        return [401, { error: "unauthorized" }];
      }
      expect(config.headers?.Authorization).toBe("Bearer concurrent-new-token");
      return [200, { res: "two" }];
    });

    // Fire both requests simultaneously
    const [res1, res2] = await Promise.all([
      apiClient.get("/resource-1"),
      apiClient.get("/resource-2"),
    ]);

    expect(res1.data).toEqual({ res: "one" });
    expect(res2.data).toEqual({ res: "two" });
    // Crucial: Only one refresh call must occur!
    expect(refreshCallCount).toBe(1);
    expect(getAccessToken()).toBe("concurrent-new-token");
  });

  it("clears access token and notifies onSessionExpired when refresh itself fails with 401", async () => {
    setAccessToken("expired-token");

    mockApiClient.onGet("/protected-resource").reply(401, { error: "token expired" });
    mockAxios.onPost("/api/auth/refresh").reply(401, { error: "refresh token invalid" });

    const sessionExpiredSpy = vi.fn();
    registerAuthStateSync({ onSessionExpired: sessionExpiredSpy });

    await expect(apiClient.get("/protected-resource")).rejects.toThrow();

    expect(getAccessToken()).toBeNull();
    expect(sessionExpiredSpy).toHaveBeenCalled();
  });

  it("does not attempt refresh if the failed endpoint was an auth endpoint", async () => {
    mockApiClient.onPost("/auth/login").reply(401, {
      error: { code: "UNAUTHORIZED", message: "Invalid credentials" },
    });

    const refreshSpy = vi.fn();
    mockAxios.onPost("/api/auth/refresh").reply(() => {
      refreshSpy();
      return [200, { accessToken: "should-not-be-called" }];
    });

    await expect(apiClient.post("/auth/login", { email: "a@b.com", password: "wrong" }))
      .rejects.toThrow();

    expect(refreshSpy).not.toHaveBeenCalled();
  });
});
