import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAccessToken, setAccessToken } from "@/lib/api";
import { useAuthStore } from "./authStore";

describe("useAuthStore", () => {
  let mockAxios: MockAdapter;

  beforeEach(() => {
    mockAxios = new MockAdapter(axios);
    useAuthStore.getState().clearAuth();
  });

  afterEach(() => {
    mockAxios.restore();
    useAuthStore.getState().clearAuth();
  });

  it("sets auth state and in-memory access token", () => {
    const testUser = {
      id: "u123",
      email: "test@example.com",
      name: "Jane Tester",
      role: "user" as const,
    };

    useAuthStore.getState().setAuth(testUser, "token-abc-123");

    expect(useAuthStore.getState().user).toEqual(testUser);
    expect(useAuthStore.getState().accessToken).toBe("token-abc-123");
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().isInitializing).toBe(false);
    expect(getAccessToken()).toBe("token-abc-123");
  });

  it("clears auth state and in-memory access token on logout", () => {
    useAuthStore.getState().setAuth(
      { id: "u123", email: "test@example.com", name: "Jane", role: "user" },
      "token-abc-123",
    );

    useAuthStore.getState().clearAuth();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(getAccessToken()).toBeNull();
  });

  it("restores session on page refresh when refresh cookie is valid", async () => {
    mockAxios.onPost("/api/auth/refresh").reply(200, {
      accessToken: "restored-token",
      user: {
        id: "u123",
        email: "restored@example.com",
        name: "Restored User",
        role: "user",
      },
    });

    await useAuthStore.getState().initializeAuth();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe("restored-token");
    expect(useAuthStore.getState().user?.email).toBe("restored@example.com");
    expect(useAuthStore.getState().isInitializing).toBe(false);
    expect(getAccessToken()).toBe("restored-token");
  });

  it("sets unauthenticated when refresh cookie is missing or invalid on initialize", async () => {
    setAccessToken(null);
    mockAxios.onPost("/api/auth/refresh").reply(401, {
      error: { code: "UNAUTHORIZED", message: "Refresh token missing" },
    });

    await useAuthStore.getState().initializeAuth();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isInitializing).toBe(false);
  });
});
