import { CheckCircle2, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = { id: number; kind: "success" | "error"; message: string };
const ToastContext = createContext<((kind: Toast["kind"], message: string) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: number) => setToasts((ts) => ts.filter((t) => t.id !== id));
  const push = useCallback((kind: Toast["kind"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-2), { id, kind, message }]);
    setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4000);
  }, []);
  return (
    <ToastContext value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.kind === "error" ? "alert" : "status"} className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-line bg-panel p-3 text-sm shadow-lg">
            {t.kind === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />}
            <p className="flex-1">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="text-ink-3 hover:text-ink" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
