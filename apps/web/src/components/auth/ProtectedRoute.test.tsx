import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Route, Routes } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { renderWithProviders } from "@/test/test-utils";
import { ProtectedRoute } from "./ProtectedRoute";

describe("ProtectedRoute", () => {
  it("renders protected content when user is authenticated", () => {
    useAuthStore.setState({
      isAuthenticated: true,
      isInitializing: false,
      user: { id: "u1", email: "auth@example.com", name: "Auth User", role: "user" },
    });

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>Protected Dashboard Content</div>} />
        </Route>
      </Routes>,
      { initialEntries: ["/dashboard"] },
    );

    expect(screen.getByText("Protected Dashboard Content")).toBeInTheDocument();
  });

  it("redirects unauthenticated user to /login", () => {
    useAuthStore.setState({
      isAuthenticated: false,
      isInitializing: false,
      user: null,
    });

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>Protected Dashboard Content</div>} />
        </Route>
        <Route path="/login" element={<div>Login Screen Destination</div>} />
      </Routes>,
      { initialEntries: ["/dashboard"] },
    );

    expect(screen.queryByText("Protected Dashboard Content")).not.toBeInTheDocument();
    expect(screen.getByText("Login Screen Destination")).toBeInTheDocument();
  });

  it("shows skeleton loaders while initializing", () => {
    useAuthStore.setState({
      isAuthenticated: false,
      isInitializing: true,
      user: null,
    });

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>Protected Content</div>} />
        </Route>
      </Routes>,
      { initialEntries: ["/dashboard"] },
    );

    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    // Skeleton elements are rendered
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });
});
