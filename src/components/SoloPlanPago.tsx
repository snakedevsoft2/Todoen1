import { enlaceActivarPlan } from "@/lib/plan";
import { Icon } from "./Icon";

/**
 * Lo que se ve en lugar de una funcion que no esta activa en la cuenta.
 *
 * Dice que es lo que no esta activo y a quien escribir: un boton gris sin
 * explicacion solo parece que la aplicacion esta danada. No habla de cobros.
 */
export function SoloPlanPago({ que, negocio, className = "" }: { que: string; negocio: string; className?: string }) {
  return (
    <div data-funcion-inactiva className={"rounded-xl border border-dashed border-line-strong p-4 text-center " + className}>
      <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-warn-soft text-warn">
        <Icon name="lock" className="h-4 w-4" />
      </span>
      <p className="mt-2 text-sm font-bold text-strong">{que}: no está activo en tu cuenta</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted">Si lo necesitas, escríbenos y te ayudamos a activarlo.</p>
      <a
        href={enlaceActivarPlan(negocio)}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary btn-sm mt-3 inline-flex"
      >
        Escribir a soporte
      </a>
    </div>
  );
}
