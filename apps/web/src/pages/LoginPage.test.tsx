import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { renderWithProviders } from "@/test/test-utils";
import { LoginPage } from "./LoginPage";

describe("LoginPage", () => {
  let mockApi: MockAdapter;

  beforeEach(() => {
    mockApi = new MockAdapter(apiClient);
    useAuthStore.getState().clearAuth();
  });

  afterEach(() => {
    mockApi.restore();
    useAuthStore.getState().clearAuth();
  });

  it("renders login form with email, password, and submit button", () => {
    renderWithProviders(<LoginPage />);

    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows validation error when submitted empty", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    const submitBtn = screen.getByRole("button", { name: /sign in/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });

  it("submits valid credentials and updates auth store on success", async () => {
    const user = userEvent.setup();

    mockApi.onPost("/auth/login").reply(200, {
      accessToken: "mocked-access-token",
      user: {
        id: "u-123",
        email: "alice@example.com",
        name: "Alice Smith",
        role: "user",
      },
    });

    renderWithProviders(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitBtn = screen.getByRole("button", { name: /sign in/i });

    await user.type(emailInput, "alice@example.com");
    await user.type(passwordInput, "secret12345");
    await user.click(submitBtn);

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().user?.email).toBe("alice@example.com");
      expect(useAuthStore.getState().accessToken).toBe("mocked-access-token");
    });
  });

  it("displays server error message when login fails with 401", async () => {
    const user = userEvent.setup();

    mockApi.onPost("/auth/login").reply(401, {
      error: { code: "UNAUTHORIZED", message: "Invalid email or password" },
    });

    renderWithProviders(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitBtn = screen.getByRole("button", { name: /sign in/i });

    await user.type(emailInput, "alice@example.com");
    await user.type(passwordInput, "wrongpassword");
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/invalid email or password/i);
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
