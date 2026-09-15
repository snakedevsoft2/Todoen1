import { enlaceActivarPlan } from "@/lib/plan";
import { Icon } from "./Icon";

/**
 * Lo que ve la version gratis en lugar de un apartado del plan pago.
 *
 * Dice que es lo que falta y como activarlo: un boton gris sin explicacion
 * solo parece que la aplicacion esta danada.
 */
export function SoloPlanPago({ que, negocio, className = "" }: { que: string; negocio: string; className?: string }) {
  return (
    <div data-solo-plan-pago className={"rounded-xl border border-dashed border-line-strong p-4 text-center " + className}>
      <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-warn-soft text-warn">
        <Icon name="lock" className="h-4 w-4" />
      </span>
      <p className="mt-2 text-sm font-bold text-strong">{que}: disponible en el plan pago</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
        Estás usando la versión gratis. Con el plan pago tienes esto, instalas la aplicación en el celular y trabajas sin internet.
      </p>
      <a
        href={enlaceActivarPlan(negocio)}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary btn-sm mt-3 inline-flex"
      >
        Activar mi plan por WhatsApp
      </a>
    </div>
  );
}
