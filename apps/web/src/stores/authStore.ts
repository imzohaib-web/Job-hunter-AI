import { create } from "zustand";
import type { AuthUser } from "@jobpilot/shared";
import {
  getAccessToken,
  refreshAuthSession,
  registerAuthStateSync,
  setAccessToken,
} from "@/lib/api";

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  setAuth: (user: AuthUser, token: string) => void;
  clearAuth: () => void;
  initializeAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => {
  // Sync state with api layer refresh interceptor
  registerAuthStateSync({
    onRefreshed: (token, user) => {
      set({
        accessToken: token,
        user: user as AuthUser,
        isAuthenticated: true,
      });
    },
    onSessionExpired: () => {
      set({
        accessToken: null,
        user: null,
        isAuthenticated: false,
      });
    },
  });

  return {
    user: null,
    accessToken: getAccessToken(),
    isAuthenticated: false,
    isInitializing: true,

    setAuth: (user: AuthUser, token: string) => {
      setAccessToken(token);
      set({
        user,
        accessToken: token,
        isAuthenticated: true,
        isInitializing: false,
      });
    },

    clearAuth: () => {
      setAccessToken(null);
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isInitializing: false,
      });
    },

    initializeAuth: async () => {
      try {
        const { accessToken, user } = await refreshAuthSession();
        set({
          user: user as AuthUser,
          accessToken,
          isAuthenticated: true,
          isInitializing: false,
        });
      } catch {
        setAccessToken(null);
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
          isInitializing: false,
        });
      }
    },
  };
});
