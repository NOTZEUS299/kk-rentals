import { useEffect, useRef, useState } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "danger";
}) {
  const styles = {
    primary:
      "bg-primary text-primary-foreground hover:opacity-90 active:opacity-80",
    outline:
      "border border-border bg-card text-foreground hover:bg-background",
    danger: "bg-red-600 text-white hover:bg-red-700",
  }[variant];
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-app px-4 text-sm font-medium transition disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  ref?: React.Ref<HTMLInputElement>;
}) {
  return (
    <input
      className={`min-h-11 w-full rounded-app border border-border bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`min-h-11 w-full rounded-app border border-border bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ${className}`}
      {...props}
    />
  );
}

export function Label({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
      {children}
    </label>
  );
}

export function Card({
  children,
  className = "",
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  const hover = interactive
    ? " transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    : "";
  return (
    <div
      className={`rounded-app border border-border bg-card p-[var(--card-pad)] shadow-sm${hover} ${className}`}
    >
      {children}
    </div>
  );
}

/** Rounded pill badge; pass color classes (bg/text) via className. */
export function Badge({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

/** Dashboard/report stat tile: big value, muted label, optional icon chip. */
export function StatCard({
  value,
  label,
  icon,
  className = "",
}: {
  value: ReactNode;
  label: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Card interactive className={`text-center ${className}`}>
      {icon && (
        <div className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary">
          {icon}
        </div>
      )}
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </Card>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 text-sm font-semibold text-muted">{children}</h2>
  );
}

export function PageHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">{title}</h1>
      {action}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-app border border-dashed border-border p-8 text-center text-sm text-muted">
      {message}
    </div>
  );
}

/**
 * Two-step destructive button: first tap arms it (label swaps to the
 * confirm text), second tap within 4s fires. No blocking dialogs.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  disabled,
  className = "",
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onClick = () => {
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 4000);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setArmed(false);
    onConfirm();
  };

  return (
    <Button
      type="button"
      variant={armed ? "danger" : "outline"}
      className={className}
      disabled={disabled}
      onClick={onClick}
    >
      {armed ? confirmLabel : label}
    </Button>
  );
}

/** Grey pulsing placeholder block for loading skeletons. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-app bg-border/60 ${className}`}
      aria-hidden
    />
  );
}

/**
 * Shared loading fallback: a page title bar plus a few card-shaped
 * rows. Rendered instantly on navigation while the route streams in.
 */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="rounded-app border border-border bg-card p-4 shadow-sm"
          >
            <Skeleton className="mb-2 h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
