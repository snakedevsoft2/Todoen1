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
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
          <div>
            {title && <h2 className="font-display text-[16px] leading-tight text-strong">{title}</h2>}
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
  /*
    El color de una cifra tiene que significar algo: verde lo que entra, rojo
    lo que sale, ambar lo que hay que mirar. El resto va en tinta normal.
    "brand" existia para pintar de azul cualquier cifra y con cuatro tarjetas
    seguidas la pantalla parecia un semaforo, asi que ahora es neutra.
  */
  const tones: Record<string, string> = {
    default: "text-strong",
    good: "text-good",
    bad: "text-bad",
    brand: "text-strong",
    amber: "text-warn",
  };
  // La cifra sigue siendo lo que la persona viene a ver, y por eso es lo unico
  // grande de la caja. La raya de color que iba debajo se fue: con cuatro
  // tarjetas seguidas eran cuatro subrayados peleando entre si.
  return (
    <div className="card-tight">
      <p className="eyebrow">{label}</p>
      <p className={"mt-2.5 stat-value " + tones[tone]}>{value}</p>
      {hint && <p className="mt-1.5 text-xs text-subtle">{hint}</p>}
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
  slate: "border-line bg-surface text-muted",
  blue: "border-brand-200 bg-brand-50 text-brand-700",
  green: "border-good-line bg-good-soft text-good",
  amber: "border-warn-line bg-warn-soft text-warn",
  red: "border-bad-line bg-bad-soft text-bad",
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
    <div className="rounded-xl border border-dashed border-line-strong px-4 py-10 text-center">
      <p className="font-display text-sm text-body">{title}</p>
      {hint && <p className="mx-auto mt-1.5 max-w-sm text-xs text-subtle">{hint}</p>}
    </div>
  );
}

export function Alert({ kind, children }: { kind: "error" | "ok" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-bad-line bg-bad-soft text-bad",
    ok: "border-good-line bg-good-soft text-good",
    info: "border-brand-200 bg-brand-50 text-brand-800",
  }[kind];
  return (
    <p className={"rounded-lg border px-3.5 py-2.5 text-sm font-medium " + styles}>{children}</p>
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
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
      {/*
        min-w-0 y break-words: sin los dos, un nombre de cliente sin espacios
        empuja el ancho de la pagina entera y aparece la barra horizontal. El
        titulo lo escribe el usuario, asi que puede ser cualquier cosa.
      */}
      <div className="min-w-0 flex-1 basis-72">
        <h1 className="font-display text-[22px] leading-tight tracking-tight text-strong [overflow-wrap:anywhere] sm:text-[26px]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-sm font-medium text-muted [overflow-wrap:anywhere]">{subtitle}</p>
        )}
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
