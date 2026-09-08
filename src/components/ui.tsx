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
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold text-white sm:text-lg">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
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
    default: "text-white",
    good: "text-emerald-300",
    bad: "text-rose-300",
    brand: "text-brand-300",
    amber: "text-amber-300",
  };
  return (
    <div className="card-tight">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={"mt-1 text-xl font-bold leading-tight sm:text-2xl " + tones[tone]}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
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
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const BADGE_TONES: Record<string, string> = {
  slate: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  blue: "border-brand-500/30 bg-brand-500/10 text-brand-300",
  green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  red: "border-rose-500/30 bg-rose-500/10 text-rose-300",
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
    <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Alert({ kind, children }: { kind: "error" | "ok" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-rose-500/30 bg-rose-500/10 text-rose-200",
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    info: "border-brand-500/30 bg-brand-500/10 text-brand-200",
  }[kind];
  return <p className={"rounded-xl border px-3 py-2.5 text-sm " + styles}>{children}</p>;
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
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-white sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
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
