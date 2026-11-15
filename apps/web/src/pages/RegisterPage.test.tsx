import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { renderWithProviders } from "@/test/test-utils";
import { RegisterPage } from "./RegisterPage";

describe("RegisterPage", () => {
  let mockApi: MockAdapter;

  beforeEach(() => {
    mockApi = new MockAdapter(apiClient);
    useAuthStore.getState().clearAuth();
  });

  afterEach(() => {
    mockApi.restore();
    useAuthStore.getState().clearAuth();
  });

  it("renders register form fields and create account button", () => {
    renderWithProviders(<RegisterPage />);

    expect(screen.getByRole("heading", { name: /create an account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("validates password length and confirmation mismatch", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    const nameInput = screen.getByLabelText(/full name/i);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password/i);
    const confirmInput = screen.getByLabelText(/confirm password/i);
    const submitBtn = screen.getByRole("button", { name: /create account/i });

    await user.type(nameInput, "Bob");
    await user.type(emailInput, "bob@example.com");
    await user.type(passwordInput, "short");
    await user.type(confirmInput, "different");
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    });
  });

  it("submits valid registration and sets auth state", async () => {
    const user = userEvent.setup();

    mockApi.onPost("/auth/register").reply(201, {
      accessToken: "registered-access-token",
      user: {
        id: "u-456",
        email: "bob@example.com",
        name: "Bob Jones",
        role: "user",
      },
    });

    renderWithProviders(<RegisterPage />);

    await user.type(screen.getByLabelText(/full name/i), "Bob Jones");
    await user.type(screen.getByLabelText(/email/i), "bob@example.com");
    await user.type(screen.getByLabelText(/^password/i), "supersecret123");
    await user.type(screen.getByLabelText(/confirm password/i), "supersecret123");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().user?.email).toBe("bob@example.com");
      expect(useAuthStore.getState().accessToken).toBe("registered-access-token");
    });
  });

  it("displays server error message when email is already registered", async () => {
    const user = userEvent.setup();

    mockApi.onPost("/auth/register").reply(409, {
      error: { code: "CONFLICT", message: "Email is already registered" },
    });

    renderWithProviders(<RegisterPage />);

    await user.type(screen.getByLabelText(/full name/i), "Bob Jones");
    await user.type(screen.getByLabelText(/email/i), "existing@example.com");
    await user.type(screen.getByLabelText(/^password/i), "supersecret123");
    await user.type(screen.getByLabelText(/confirm password/i), "supersecret123");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/email is already registered/i);
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
