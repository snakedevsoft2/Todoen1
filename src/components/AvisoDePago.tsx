import { estadoDePago, fechaLarga } from "@/lib/pagos";
import { enlaceActivarPlan, planDeCuenta } from "@/lib/plan";

/**
 * El aviso al dueño sobre el estado de su cuenta: los primeros dias con todo,
 * las funciones que no estan activas, o la cuenta por vencer o vencida.
 *
 * Los textos no hablan de cobros ni de planes: dicen que esta activo, hasta
 * cuando, y a quien escribir. Solo al dueño: el empleado no tiene que ver con
 * eso. Lleva el WhatsApp de soporte con el mensaje ya escrito.
 */
export function AvisoDePago({
  paidUntil,
  trialEndsAt,
  businessName,
}: {
  paidUntil: Date | null;
  trialEndsAt: Date | null;
  businessName: string;
}) {
  const plan = planDeCuenta({ paidUntil, trialEndsAt });
  const soporte = (
    <a href={enlaceActivarPlan(businessName)} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">
      Escribir a soporte
    </a>
  );

  if (plan.tipo === "prueba" || plan.tipo === "gratis") {
    const limitada = plan.tipo === "gratis";
    return (
      <div
        data-aviso-pago={limitada ? "limitada" : "prueba"}
        className={
          "mb-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-[13px] " +
          (limitada ? "border-warn-line bg-warn-soft text-warn" : "border-line bg-surface text-body")
        }
      >
        <span className="min-w-0 flex-1">
          {limitada
            ? "Algunas funciones no están activas en tu cuenta: la aplicación instalada, el uso sin internet, la factura autorizada, la ubicación del personal, la carga masiva y los reportes. Escríbenos si las necesitas."
            : "Tu cuenta tiene todas las funciones activas " +
              (plan.dias <= 1 ? "hasta hoy" : "por " + plan.dias + " días más") +
              ". Si tienes dudas, escríbenos."}
        </span>
        {soporte}
      </div>
    );
  }

  const e = estadoDePago(paidUntil);
  if (e.estado !== "por-vencer" && e.estado !== "vencida") return null;
  const vencida = e.estado === "vencida";

  return (
    <div
      data-aviso-pago={e.estado}
      className={
        "mb-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-[13px] " +
        (vencida ? "border-bad/30 bg-surface text-bad" : "border-warn-line bg-warn-soft text-warn")
      }
    >
      <span className="min-w-0 flex-1">
        {vencida
          ? "Tu cuenta venció el " + fechaLarga(e.vence) + " y se desactiva el " + fechaLarga(e.suspendeEl) + ". Escríbenos para mantenerla activa."
          : "Tu cuenta vence el " +
            fechaLarga(e.vence) +
            (e.dias <= 1 ? " (mañana)" : " (en " + e.dias + " días)") +
            ". Escríbenos para mantenerla activa."}
      </span>
      {soporte}
    </div>
  );
}
