"use client";

import * as React from "react";

// Toast implementation based on shadcn/ui
export type ToastActionElement = React.ReactElement;

export interface Toast {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const ToastContext = React.createContext<{
  state: ToastState;
  addToast: (toast: Toast) => void;
  removeToast: (toastId: string) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ToastState>({ toasts: [] });

  const removeToast = React.useCallback((toastId: string) => {
    setState((current) => ({
      toasts: current.toasts.filter((toast) => toast.id !== toastId),
    }));
    const timeout = toastTimeouts.get(toastId);
    if (timeout) {
      clearTimeout(timeout);
    }
  }, []);

  const addToast = React.useCallback(
    (toast: Toast) => {
      setState((current) => ({ toasts: [...current.toasts, toast] }));
      if (toast.duration) {
        const timeout = setTimeout(() => removeToast(toast.id), toast.duration);
        toastTimeouts.set(toast.id, timeout);
      }
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ state, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  const { addToast, removeToast, state } = context;

  const toast = React.useCallback(
    (input: Omit<Toast, "id"> & { id?: string }) => {
      const id = input.id ?? crypto.randomUUID();
      addToast({ ...input, id });
      return {
        id,
        dismiss: () => removeToast(id),
      };
    },
    [addToast, removeToast]
  );

  return {
    toast,
    dismiss: removeToast,
    toasts: state.toasts,
  };
}