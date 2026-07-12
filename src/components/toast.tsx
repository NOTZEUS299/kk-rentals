import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";

interface ToastItem {
  id: number;
  message: string;
  kind: "success" | "error";
}

const ToastContext = createContext<{
  toast: (message: string, kind?: "success" | "error") => void;
} | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx.toast;
}

/** Lightweight toast stack; auto-dismisses, no portals or deps. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const toast = useCallback(
    (message: string, kind: "success" | "error" = "success") => {
      const id = nextId.current++;
      setItems((cur) => [...cur, { id, message, kind }]);
      setTimeout(() => {
        setItems((cur) => cur.filter((t) => t.id !== id));
      }, 2500);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6 print:hidden"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`animate-[fade-in-up_0.2s_ease-out] rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg ${
              t.kind === "error" ? "bg-red-600" : "bg-foreground"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
