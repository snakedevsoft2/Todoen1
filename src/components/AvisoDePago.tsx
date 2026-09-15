import { estadoDePago, fechaLarga } from "@/lib/pagos";
import { enlaceActivarPlan, planDeCuenta } from "@/lib/plan";
import { SUPPORT_WHATSAPP } from "@/lib/support";

/**
 * El aviso al dueño sobre su plan: la prueba gratis, la version gratis, o el
 * pago por vencer o vencido.
 *
 * Solo al dueño: el empleado no tiene como pagar y el aviso solo le
 * preocuparia. Lleva el WhatsApp de soporte con el mensaje ya escrito.
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

  if (plan.tipo === "prueba" || plan.tipo === "gratis") {
    const gratis = plan.tipo === "gratis";
    return (
      <div
        data-aviso-pago={plan.tipo}
        className={
          "mb-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-[13px] " +
          (gratis ? "border-warn-line bg-warn-soft text-warn" : "border-line bg-surface text-body")
        }
      >
        <span className="min-w-0 flex-1">
          {gratis
            ? "Estás en la versión gratis: se usa desde el navegador con internet, sin factura autorizada, ubicación del personal, carga masiva ni reportes, y las facturas salen con la marca de la versión gratis. Activa tu plan para tener todo e instalar la aplicación."
            : "Estás en la prueba gratis con todo incluido: " +
              (plan.dias <= 1 ? "hoy es tu último día" : "te quedan " + plan.dias + " días") +
              ". Después sigue la versión gratis, con menos funciones, hasta que actives tu plan."}
        </span>
        <a href={enlaceActivarPlan(businessName)} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">
          Activar mi plan
        </a>
      </div>
    );
  }

  const e = estadoDePago(paidUntil);
  if (e.estado !== "por-vencer" && e.estado !== "vencida") return null;

  const enlace =
    "https://wa.me/" + SUPPORT_WHATSAPP + "?text=" + encodeURIComponent("Hola, quiero renovar el plan de " + businessName + ".");
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
          ? "Tu pago venció el " + fechaLarga(e.vence) + ". La cuenta se suspende el " + fechaLarga(e.suspendeEl) + " si no se renueva."
          : "Tu plan vence el " + fechaLarga(e.vence) + (e.dias <= 1 ? " (mañana)" : " (en " + e.dias + " días)") + ". Renuévalo para no quedarte sin la aplicación."}
      </span>
      <a href={enlace} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">
        Renovar por WhatsApp
      </a>
    </div>
  );
}
