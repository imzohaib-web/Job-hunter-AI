import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToastStore, type ToastItem } from "@/stores/toastStore";

export function Toaster() {
  const { toasts, dismissToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2 w-full px-4 sm:px-0"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const isDestructive = toast.variant === "destructive";
  const isSuccess = toast.variant === "success";

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-lg transition-all animate-slide-in-right bg-card text-card-foreground",
        isDestructive && "border-destructive/40 bg-destructive/10 text-destructive dark:text-red-400",
        isSuccess && "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-300",
      )}
    >
      <div className="shrink-0 mt-0.5">
        {isSuccess ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        ) : isDestructive ? (
          <AlertCircle className="h-5 w-5 text-destructive" />
        ) : (
          <Info className="h-5 w-5 text-primary" />
        )}
      </div>

      <div className="flex-1 space-y-1">
        {toast.title && (
          <p className="text-sm font-semibold leading-tight">{toast.title}</p>
        )}
        <p className="text-sm leading-snug text-muted-foreground">{toast.description}</p>
      </div>

      <button
        type="button"
        aria-label="Dismiss toast"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
