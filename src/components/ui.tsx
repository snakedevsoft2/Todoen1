import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"card " + className}>
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b-2 border-edge pb-3">
          <div>
            {title && <h2 className="font-display text-[17px] leading-tight text-strong">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "bad" | "brand" | "amber";
}) {
  const tones: Record<string, string> = {
    default: "text-strong",
    good: "text-good",
    bad: "text-bad",
    brand: "text-brand-600",
    amber: "text-warn",
  };
  // La cifra es lo que la persona viene a ver: va en la negra, grande y
  // tabular, con una raya del color del tono debajo para leerla de lejos.
  const rules: Record<string, string> = {
    default: "bg-edge",
    good: "bg-good",
    bad: "bg-bad",
    brand: "bg-brand-600",
    amber: "bg-warn",
  };
  return (
    <div className="card-tight">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className={"mt-2 stat-value " + tones[tone]}>{value}</p>
      <span className={"mt-2 block h-[3px] w-8 rounded-full " + rules[tone]} />
      {hint && <p className="mt-2 text-xs font-medium text-subtle">{hint}</p>}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={"block " + className}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-subtle">{hint}</span>}
    </label>
  );
}

const BADGE_TONES: Record<string, string> = {
  slate: "border-edge bg-surface text-strong",
  blue: "border-edge bg-brand-100 text-brand-800",
  green: "border-edge bg-good-soft text-good",
  amber: "border-edge bg-warn-soft text-warn",
  red: "border-edge bg-bad-soft text-bad",
};

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
}) {
  return <span className={"badge " + BADGE_TONES[tone]}>{children}</span>;
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-line-strong px-4 py-10 text-center">
      <p className="font-display text-sm text-body">{title}</p>
      {hint && <p className="mx-auto mt-1.5 max-w-sm text-xs text-subtle">{hint}</p>}
    </div>
  );
}

export function Alert({ kind, children }: { kind: "error" | "ok" | "info"; children: ReactNode }) {
  const styles = {
    error: "bg-bad-soft text-bad",
    ok: "bg-good-soft text-good",
    info: "bg-brand-50 text-brand-800",
  }[kind];
  return (
    <p className={"rounded-xl border-2 border-edge px-3 py-2.5 text-sm font-semibold " + styles}>
      {children}
    </p>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-edge pb-4">
      <div>
        <h1 className="font-display text-[26px] leading-none tracking-tight text-strong sm:text-[32px]">
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-sm font-medium text-muted">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}

const STATUS_TONES: Record<string, keyof typeof BADGE_TONES> = {
  PENDIENTE: "amber",
  CONFIRMADO: "blue",
  ATENDIDO: "green",
  CANCELADO: "red",
  NO_ASISTIO: "slate",
  ABIERTA: "amber",
  PAGADA: "green",
  CANCELADA: "red",
};

const STATUS_LABELS: Record<string, string> = {
  PENDIENTE: "Pendiente",
  CONFIRMADO: "Confirmado",
  ATENDIDO: "Atendido",
  CANCELADO: "Cancelado",
  NO_ASISTIO: "No asistio",
  ABIERTA: "Abierta",
  PAGADA: "Pagada",
  CANCELADA: "Cancelada",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "slate"}>{STATUS_LABELS[status] ?? status}</Badge>;
}

export const PAYMENT_LABELS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro",
};
