"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { addPaymentAction, createDebtAction, renewLoanAction, updateDueDayAction } from "@/actions/debts";
import type { Frecuencia, OpcionesPlan } from "@/lib/prestamos";
import { aCampo, money, pasoMoneda } from "@/lib/format";
import { SubmitButton } from "./SubmitButton";
import { CamposFiador, CamposPrestamo, CamposReferencias } from "./PrestamoFields";
import { ReceiptActions } from "./ReceiptActions";
import { Alert, Card, Field } from "./ui";
import { Icon } from "./Icon";
import { useAccionSinSenal } from "@/components/SinSenal";

/**
 * Anotar que alguien quedo debiendo.
 *
 * Tiene dos caras. En una tienda es un fiado: un monto y ya. En un negocio de
 * cartera es un prestamo: capital, interes y cuotas, y el total NO se escribe
 * a mano sino que sale de esas tres, para que no pueda quedar un total que no
 * cuadre con lo que se presto.
 */
export function NewDebtForm({
  today,
  currency,
  /** true en el negocio de cartera: pide capital, interes, cuotas y fiador. */
  prestamos = false,
  negocio,
  opciones,
}: {
  today: string;
  currency: string;
  prestamos?: boolean;
  /** Como reparte las fechas de las cuotas el negocio. */
  opciones?: OpcionesPlan;
  /** Para poder sacar la constancia del préstamo justo al anotarlo. */
  negocio?: {
    businessName: string;
    businessPhone: string | null;
    businessAddress: string | null;
    logoUrl: string | null;
    marcaGratis: boolean;
  };
}) {
  const [state, formAction] = useActionState(useAccionSinSenal("createDebtAction", createDebtAction), undefined);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="modo" value={prestamos ? "prestamo" : "fiado"} />
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      {state?.recibo && negocio && (
        <div className="rounded-xl border border-good-line bg-good-soft p-3">
          <p className="mb-2 text-xs font-semibold text-good">Constancia del préstamo</p>
          <ReceiptActions
            clientPhone={state.recibo.clientPhone}
            data={{
              kind: "prestamo",
              paymentId: state.recibo.debtId,
              receiptSeq: state.recibo.receiptSeq,
              businessName: negocio.businessName,
              businessPhone: negocio.businessPhone,
              businessAddress: negocio.businessAddress,
              logoUrl: negocio.logoUrl,
              currency,
              clientName: state.recibo.clientName,
              concept: state.recibo.concept,
              day: state.recibo.day,
              method: "EFECTIVO",
              amount: state.recibo.amount,
              total: state.recibo.amount,
              saldo: state.recibo.amount,
              historial: [],
              marcaGratis: negocio.marcaGratis,
            }}
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Quién debe">
          <input className="input" name="clientName" required placeholder="Ej: Ana Torres" />
        </Field>
        <Field
          label={prestamos ? "Celular" : "WhatsApp (opcional)"}
          hint={prestamos ? "Para poder cobrarle y ubicarlo." : "Sin el no se le puede cobrar por chat."}
        >
          <input
            className="input"
            name="clientPhone"
            inputMode="tel"
            required={prestamos}
            placeholder="300 000 0000"
          />
        </Field>
      </div>

      {prestamos && (
        <Field label="Dirección" hint="Para poder ubicarlo si hace falta.">
          <input className="input" name="clientAddress" placeholder="Ej: Calle 45 #12-30" />
        </Field>
      )}

      <Field label="Por que debe">
        <input className="input" name="concept" required placeholder="Ej: 2 camisas y un jean" />
      </Field>

      {prestamos ? (
        <CamposPrestamo today={today} currency={currency} opciones={opciones} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={"Cuanto debe (" + currency + ")"}>
            <input
              className="input"
              type="number"
              name="amount"
              min={0}
              step={pasoMoneda(currency)}
              required
              placeholder="0"
            />
          </Field>
          <Field label="Desde cuando">
            <input className="input" type="date" name="day" defaultValue={today} />
          </Field>
          <Field label="Vence el" hint="Opcional.">
            <input className="input" type="date" name="dueDay" />
          </Field>
        </div>
      )}

      {prestamos && <CamposFiador />}
      {prestamos && <CamposReferencias />}

      <Field label="Nota (opcional)">
        <input className="input" name="notes" placeholder="Ej: queda de pagar el viernes" />
      </Field>

      {/* Esta casilla decide si los abonos entran a la caja. Es la diferencia
          entre llevar bien las cuentas y contar la misma plata dos veces. */}
      <label className="flex items-start gap-2.5 rounded-xl border border-line bg-surface p-3 text-sm text-body">
        <input
          type="checkbox"
          name="alreadyInvoiced"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line bg-panel accent-brand-600"
        />
        <span>
          <span className="font-bold text-strong">Esta venta ya la registre en Ventas</span>
          <span className="mt-0.5 block text-xs text-muted">
            Marcala solo si ya la anotaste. Asi los abonos no se suman otra vez a la caja. Si no la
            marcas, cada abono entra como venta del dia en que lo recibes.
          </span>
        </span>
      </label>

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Guardando...">
        <Icon name="plus" className="h-4 w-4" />
        {prestamos ? "Anotar el prestamo" : "Anotar la deuda"}
      </SubmitButton>
    </form>
  );
}

/** Registrar un abono sobre una deuda. */
export function PaymentForm({
  debtId,
  today,
  pendiente,
  currency,
  entraACaja,
}: {
  debtId: string;
  today: string;
  pendiente: number;
  currency: string;
  /** true si este abono se suma a la caja del dia. */
  entraACaja: boolean;
}) {
  const [state, formAction] = useActionState(useAccionSinSenal("addPaymentAction", addPaymentAction), undefined);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="debtId" value={debtId} />
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cuanto abono" hint={"Falta " + money(pendiente, currency) + "."}>
          <input
            className="input"
            type="number"
            name="amount"
            min={0}
            max={aCampo(pendiente, currency)}
            step={pasoMoneda(currency)}
            required
            defaultValue={aCampo(pendiente, currency)}
          />
        </Field>
        <Field label="Como pago">
          <select className="input" name="method" defaultValue="EFECTIVO">
            <option value="EFECTIVO">Efectivo</option>
            <option value="TARJETA">Tarjeta</option>
            <option value="TRANSFERENCIA">Transferencia</option>
            <option value="OTRO">Otro</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Día del abono">
          <input className="input" type="date" name="day" defaultValue={today} />
        </Field>
        <Field label="Nota (opcional)">
          <input className="input" name="notes" placeholder="Ej: abono parcial" />
        </Field>
      </div>

      <p className="text-xs text-subtle">
        {entraACaja
          ? "Este abono se suma a las ventas del día, porque la venta no se había registrado."
          : "Este abono no se suma a las ventas: esa venta ya se conto cuando la registraste."}
      </p>

      <SubmitButton className="btn-success w-full" pendingText="Guardando...">
        <Icon name="check" className="h-4 w-4" />
        Registrar abono
      </SubmitButton>
    </form>
  );
}

/** Cambiar el plazo cuando se acuerda uno nuevo. */
export function DueDayForm({ debtId, dueDay }: { debtId: string; dueDay: string | null }) {
  const [state, formAction] = useActionState(useAccionSinSenal("updateDueDayAction", updateDueDayAction), undefined);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={debtId} />
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="flex flex-wrap items-end gap-2">
        <label className="block flex-1">
          <span className="label">Proximo vencimiento</span>
          <input className="input" type="date" name="dueDay" defaultValue={dueDay ?? ""} />
        </label>
        <SubmitButton className="btn-ghost" pendingText="...">
          Guardar plazo
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * Renovar un prestamo: uno nuevo al mismo cliente, descontando lo que debe
 * del anterior (lo pidio EM Inversiones, ver lib/em-inversiones.ts). Arranca
 * con el interes, las cuotas y la frecuencia del anterior; lo unico que hay
 * que escribir es cuanto se le presta ahora.
 *
 * Trae su propia tarjeta y la pantalla lo deja montado aunque el prestamo ya
 * se haya renovado: al renovar, la pantalla se vuelve a pintar con el
 * prestamo cerrado, y si la tarjeta desapareciera se llevaria el aviso y la
 * constancia del nuevo antes de que se alcancen a ver.
 */
export function RenovarForm({
  debtId,
  renovadoEn,
  today,
  currency,
  debe,
  concepto,
  inicial,
  opciones,
  negocio,
}: {
  debtId: string;
  /** El prestamo nuevo, si este ya se renovo. */
  renovadoEn: string | null;
  today: string;
  currency: string;
  /** Lo que todavia debe del anterior. */
  debe: number;
  concepto: string;
  inicial: { interes: number | null; cuotas: number | null; frecuencia: Frecuencia | null };
  opciones: OpcionesPlan;
  negocio: {
    businessName: string;
    businessPhone: string | null;
    businessAddress: string | null;
    logoUrl: string | null;
    marcaGratis: boolean;
  };
}) {
  const [state, formAction] = useActionState(useAccionSinSenal("renewLoanAction", renewLoanAction), undefined);

  // Ya renovado y no fue en esta visita: el aviso de arriba lo dice.
  if (renovadoEn && !state?.nuevaId) return null;

  const tarjeta = (cuerpo: ReactNode) => (
    <Card title="Renovar el préstamo" subtitle="Le prestas otra vez y lo que debe se descuenta del nuevo">
      {cuerpo}
    </Card>
  );

  if (state?.nuevaId && state.recibo) {
    return tarjeta(
      <div className="space-y-3">
        <Alert kind="ok">{state.ok}</Alert>
        <div className="rounded-xl border border-good-line bg-good-soft p-3">
          <p className="mb-2 text-xs font-semibold text-good">Constancia del préstamo nuevo</p>
          <ReceiptActions
            clientPhone={state.recibo.clientPhone}
            data={{
              kind: "prestamo",
              paymentId: state.recibo.debtId,
              receiptSeq: state.recibo.receiptSeq,
              businessName: negocio.businessName,
              businessPhone: negocio.businessPhone,
              businessAddress: negocio.businessAddress,
              logoUrl: negocio.logoUrl,
              currency,
              clientName: state.recibo.clientName,
              concept: state.recibo.concept,
              day: state.recibo.day,
              method: "EFECTIVO",
              amount: state.recibo.amount,
              total: state.recibo.amount,
              saldo: state.recibo.amount,
              historial: [],
              marcaGratis: negocio.marcaGratis,
            }}
          />
        </div>
        <Link href={"/panel/cartera/" + state.nuevaId} className="btn-primary w-full justify-center">
          Ver el préstamo nuevo
        </Link>
      </div>
    );
  }

  return tarjeta(
    <details>
      <summary className="cursor-pointer text-sm font-bold text-brand-600">
        {debe > 0 ? "Renovar (debe " + money(debe, currency) + ")" : "Hacerle un préstamo nuevo"}
      </summary>
      <form action={formAction} className="mt-3 space-y-3" data-renovar>
        <input type="hidden" name="debtId" value={debtId} />
        {state?.error && <Alert kind="error">{state.error}</Alert>}
        {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

        <p className="text-xs text-muted">
          {debe > 0
            ? "Todavía debe " + money(debe, currency) + ". Se le descuenta del préstamo nuevo y este queda pagado."
            : "Este ya está pagado. El nuevo sale con los mismos datos del cliente, el fiador y las referencias."}
        </p>

        <Field label="Concepto">
          <input className="input" name="concept" defaultValue={concepto} />
        </Field>

        <CamposPrestamo today={today} currency={currency} opciones={opciones} inicial={inicial} descuento={debe} />

        <Field label="Nota (opcional)">
          <input className="input" name="notes" placeholder="Ej: renueva por buen pago" />
        </Field>

        <SubmitButton className="btn-primary w-full" pendingText="Renovando...">
          <Icon name="handshake" className="h-4 w-4" />
          Renovar el préstamo
        </SubmitButton>
      </form>
    </details>
  );
}
