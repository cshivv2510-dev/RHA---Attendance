import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastData {
  id: number;
  type: ToastType;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

let toastId = 0;
let addToastGlobal: ((type: ToastType, message: string, action?: { label: string; onAction: () => void }) => void) | null = null;

/**
 * Global function to show a toast from anywhere.
 * Auto-hides after 3s. Pass an action (e.g. Undo) to show a button.
 */
export function showToast(
  type: ToastType,
  message: string,
  action?: { label: string; onAction: () => void }
): void {
  addToastGlobal?.(type, message, action);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((type: ToastType, message: string, action?: { label: string; onAction: () => void }) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, type, message, actionLabel: action?.label, onAction: action?.onAction }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    addToastGlobal = addToast;
    return () => {
      addToastGlobal = null;
    };
  }, [addToast]);

  const icons: Record<ToastType, LucideIcon> = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
  };

  const colors = {
    success: { bg: '#ecfdf5', border: '#10b981', text: '#065f46', icon: '#059669' },
    error: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', icon: '#dc2626' },
    warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', icon: '#d97706' },
    info: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af', icon: '#2563eb' },
  };

  const darkColors = {
    success: { bg: 'rgba(16, 185, 129, 0.14)', border: '#10b981', text: '#6ee7b7', icon: '#34d399' },
    error: { bg: 'rgba(239, 68, 68, 0.14)', border: '#ef4444', text: '#fca5a5', icon: '#f87171' },
    warning: { bg: 'rgba(245, 158, 11, 0.14)', border: '#f59e0b', text: '#fcd34d', icon: '#fbbf24' },
    info: { bg: 'rgba(59, 130, 246, 0.14)', border: '#3b82f6', text: '#93c5fd', icon: '#60a5fa' },
  };

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none w-full max-w-sm px-4">
      {toasts.map(toast => {
        const c = isDark ? darkColors[toast.type] : colors[toast.type];
        const Icon = icons[toast.type];
        return (
          <div
            key={toast.id}
            className="pointer-events-auto animate-toast-in rounded-xl px-4 py-3 shadow-lg flex items-center gap-3 backdrop-blur-md w-full"
            style={{
              backgroundColor: c.bg,
              border: `1px solid ${c.border}55`,
              color: c.text,
            }}
          >
            <Icon size={18} style={{ color: c.icon }} className="flex-shrink-0" />
            <span className="text-sm font-medium flex-1">{toast.message}</span>
            {toast.actionLabel && toast.onAction && (
              <button
                onClick={() => {
                  toast.onAction?.();
                  setToasts(prev => prev.filter(t => t.id !== toast.id));
                }}
                className="text-sm font-bold px-2 py-1 rounded-lg flex-shrink-0"
                style={{ color: c.icon }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
