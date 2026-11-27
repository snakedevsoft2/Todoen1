import { fechaLarga } from "@/lib/pagos";
import { SUPPORT_WHATSAPP } from "@/lib/support";
import { RefrescoAutomatico } from "./RefrescoAutomatico";

/**
 * La ventana fija de cuando el mes vencio y no se ha pagado.
 *
 * Tapa todo el panel, al dueno y a cada empleado, y no tiene como cerrarse: el
 * layout ni siquiera pinta el panel debajo. Se quita sola cuando se registra el
 * pago: la pantalla se vuelve a pedir cada minuto y, con la fecha nueva, ya no
 * sale. Solo deja escribir a soporte y cerrar sesion.
 */
export function PagoVencido({
  businessName,
  dueno,
  vence,
  suspendeEl,
  logout,
}: {
  businessName: string;
  /** Al dueno se le pide pagar; al empleado, que le avise al dueno. */
  dueno: boolean;
  vence: Date;
  suspendeEl: Date;
  logout: React.ReactNode;
}) {
  const pagar =
    "https://wa.me/" + SUPPORT_WHATSAPP + "?text=" + encodeURIComponent("Hola, quiero pagar la mensualidad de " + businessName + ".");

  return (
    <div
      data-pago-vencido={dueno ? "dueno" : "empleado"}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="pago-vencido-titulo"
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/75 px-4 py-6"
    >
      <RefrescoAutomatico segundos={60} />
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 text-center shadow-xl">
        <p id="pago-vencido-titulo" className="font-display text-lg text-strong">
          {dueno ? "Tu mes venció: debes realizar el pago" : "La cuenta del negocio venció"}
        </p>
        <p className="mt-2 text-sm text-body">
          La cuenta de <strong className="text-strong">{businessName}</strong> venció el {fechaLarga(vence)}.{" "}
          {dueno
            ? "Para que tú y tu equipo sigan usando la aplicación, realiza el pago."
            : "El propietario debe realizar el pago para que todos puedan seguir usando la aplicación. Avísale."}
        </p>
        <p className="mt-2 text-[13px] text-bad">Si no se paga, la cuenta se desactiva el {fechaLarga(suspendeEl)}.</p>
        {dueno && (
          <a href={pagar} target="_blank" rel="noopener noreferrer" className="btn-primary mt-4 inline-flex w-full justify-center">
            Pagar por WhatsApp
          </a>
        )}
        <div className="mt-3">{logout}</div>
        <p className="mt-3 text-xs text-muted">Esta ventana se quita sola cuando se registre el pago.</p>
      </div>
    </div>
  );
}
