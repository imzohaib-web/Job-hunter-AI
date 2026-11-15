import { create } from "zustand";

export type ToastVariant = "default" | "destructive" | "success" | "info";

export interface ToastItem {
  id: string;
  title?: string;
  description: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastState {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, "id">) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = Math.random().toString(36).substring(2, 9);
    const duration = toast.duration ?? 4000;

    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));

    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }

    return id;
  },

  dismissToast: (id: string) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearToasts: () => {
    set({ toasts: [] });
  },
}));

export const toast = {
  default: (description: string, title?: string) =>
    useToastStore.getState().addToast({ description, title, variant: "default" }),
  success: (description: string, title?: string) =>
    useToastStore.getState().addToast({ description, title, variant: "success" }),
  error: (description: string, title?: string) =>
    useToastStore.getState().addToast({ description, title, variant: "destructive" }),
  info: (description: string, title?: string) =>
    useToastStore.getState().addToast({ description, title, variant: "info" }),
};
