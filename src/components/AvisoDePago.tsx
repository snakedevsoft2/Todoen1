import { estadoDePago, fechaLarga } from "@/lib/pagos";
import { SUPPORT_WHATSAPP } from "@/lib/support";

/**
 * El aviso al dueño cuando su plan esta por vencer o ya vencio.
 *
 * Solo al dueño: el empleado no tiene como pagar y el aviso solo le
 * preocuparia. Lleva el WhatsApp de soporte con el mensaje ya escrito.
 */
export function AvisoDePago({ paidUntil, businessName }: { paidUntil: Date | null; businessName: string }) {
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
