import { money, shortDay } from "@/lib/format";
import { estadoPrestamo, etiquetaDe, ganancia, type Cuota, type Frecuencia } from "@/lib/prestamos";
import { Icon } from "./Icon";

/**
 * Como va un prestamo: el plan de cuotas y en cual va.
 *
 * Lo primero que se mira no es el plan completo sino dos numeros: cuanto debe
 * pagar hoy y cuanto lleva atrasado. El plan va debajo, plegado, para cuando
 * hay que revisar una fecha concreta.
 *
 * Cada cuota se marca contra lo abonado en total, no una por una: si alguien
 * abona de mas una semana esa plata le cubre la siguiente, que es como lo
 * entiende cualquiera que preste.
 */
export function PlanDePagos({
  plan,
  abonado,
  hoy,
  currency,
  principal,
  interestPct,
  frecuencia,
}: {
  plan: Cuota[];
  abonado: number;
  hoy: string;
  currency: string;
  principal: number | null;
  interestPct: number | null;
  frecuencia: Frecuencia;
}) {
  const est = estadoPrestamo(plan, abonado, hoy);
  const total = plan.reduce((s, c) => s + c.monto, 0);

  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold text-strong">
        <Icon name="handshake" className="h-4 w-4 text-brand-600" />
        El prestamo
      </h2>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato label="Le prestaste" valor={principal !== null ? money(principal, currency) : "-"} />
        <Dato label="Interes" valor={interestPct !== null ? interestPct + "%" : "-"} />
        <Dato
          label="Te ganas"
          valor={
            principal !== null && interestPct !== null
              ? money(ganancia(principal, interestPct), currency)
              : "-"
          }
        />
        <Dato label="Cuotas" valor={plan.length + " " + etiquetaDe(frecuencia).toLowerCase()} />
      </dl>

      {/* Los dos numeros con los que se trabaja. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div
          className={
            "rounded-xl border p-3 " +
            (est.atraso > 0 ? "border-bad/30 bg-bad-soft" : "border-line bg-good-soft")
          }
        >
          <p className="text-[11px] uppercase tracking-wide text-subtle">Atraso</p>
          <p className={"text-lg font-bold " + (est.atraso > 0 ? "text-bad" : "text-good")}>
            {est.atraso > 0 ? money(est.atraso, currency) : "Al dia"}
          </p>
          {est.atraso > 0 && (
            <p className="text-xs text-bad">
              {est.cuotasAtrasadas} {est.cuotasAtrasadas === 1 ? "cuota" : "cuotas"} sin pagar
            </p>
          )}
        </div>

        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-[11px] uppercase tracking-wide text-subtle">Proxima cuota</p>
          {est.proxima ? (
            <>
              <p className="text-lg font-bold text-strong">
                {money(est.proxima.monto, currency)}
              </p>
              <p className="text-xs text-muted">
                Cuota {est.proxima.n} de {plan.length} · {shortDay(est.proxima.day)}
              </p>
            </>
          ) : (
            <p className="text-lg font-bold text-good">Pago todo</p>
          )}
        </div>
      </div>

      <details className="mt-3 rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer px-3 py-2.5 text-sm font-bold text-strong">
          Ver el plan completo
          <span className="ml-2 text-xs font-normal text-muted">
            {est.cuotasPagadas} de {plan.length} cubiertas · {money(total, currency)}
          </span>
        </summary>

        <div className="max-h-80 overflow-y-auto border-t border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-left text-[11px] uppercase tracking-wide text-subtle">
                <th className="px-3 py-2">Cuota</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((c) => {
                const cubierta = c.n <= est.cuotasPagadas;
                const vencida = !cubierta && c.day <= hoy;
                return (
                  <tr key={c.n} className="border-t border-line">
                    <td className="px-3 py-2 text-muted">{c.n}</td>
                    <td className="px-3 py-2 text-body">{shortDay(c.day)}</td>
                    <td className="px-3 py-2 text-right font-bold text-strong">
                      {money(c.monto, currency)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {cubierta ? (
                        <span className="text-xs font-bold text-good">Pagada</span>
                      ) : vencida ? (
                        <span className="text-xs font-bold text-bad">Vencida</span>
                      ) : (
                        <span className="text-xs text-muted">Pendiente</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="text-sm font-bold text-strong">{valor}</dd>
    </div>
  );
}

/** Los datos de quien responde si el deudor no paga. */
export function FichaFiador({
  nombre,
  cedula,
  telefono,
  direccion,
}: {
  nombre: string;
  cedula: string | null;
  telefono: string | null;
  direccion: string | null;
}) {
  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold text-strong">
        <Icon name="users" className="h-4 w-4 text-muted" />
        Fiador
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <Dato label="Nombre" valor={nombre} />
        <Dato label="Cedula" valor={cedula ?? "-"} />
        <Dato label="Telefono" valor={telefono ?? "-"} />
        <Dato label="Direccion" valor={direccion ?? "-"} />
      </dl>
    </section>
  );
}
