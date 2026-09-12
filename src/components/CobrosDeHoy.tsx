import Link from "next/link";
import { money } from "@/lib/format";
import { Icon } from "./Icon";

/**
 * El tablero del prestamista: a quien hay que cobrarle hoy y quien se atraso.
 *
 * Es la primera pantalla del dia en un negocio de cartera. La lista completa
 * de deudas no sirve para eso: hay que recorrerla entera buscando fechas. Aqui
 * salen solo los dos grupos que importan, y los atrasados van primero porque
 * son los que se pierden si nadie los mira.
 *
 * Cada renglon trae el boton de WhatsApp con el cobro ya escrito: el trabajo
 * es cobrar, no redactar.
 */
export type Cobro = {
  id: string;
  clientName: string;
  /** "cuota 7 de 20", o null si es un fiado suelto sin cuotas. */
  detalle: string | null;
  monto: number;
  /** Cuantas cuotas lleva atrasadas. Cero si va al dia. */
  cuotasAtrasadas: number;
  enlaceWhatsapp: string | null;
};

function Fila({ cobro, currency, tono }: { cobro: Cobro; currency: string; tono: "bad" | "brand" }) {
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-line py-2.5 last:border-0">
      <Link href={"/panel/cartera/" + cobro.id} className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-strong">{cobro.clientName}</span>
        <span className="block text-xs text-muted">
          {cobro.detalle ?? "Sin cuotas pactadas"}
          {cobro.cuotasAtrasadas > 0 && (
            <span className="text-bad">
              {" · "}
              {cobro.cuotasAtrasadas} {cobro.cuotasAtrasadas === 1 ? "cuota" : "cuotas"} atrasada
              {cobro.cuotasAtrasadas === 1 ? "" : "s"}
            </span>
          )}
        </span>
      </Link>

      <span className={"text-sm font-bold " + (tono === "bad" ? "text-bad" : "text-strong")}>
        {money(cobro.monto, currency)}
      </span>

      {cobro.enlaceWhatsapp && (
        <a
          href={cobro.enlaceWhatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-success btn-sm"
          aria-label={"Cobrarle a " + cobro.clientName + " por WhatsApp"}
        >
          <Icon name="whatsapp" className="h-4 w-4" />
          Cobrar
        </a>
      )}
    </li>
  );
}

export function CobrosDeHoy({
  atrasados,
  deHoy,
  currency,
}: {
  atrasados: Cobro[];
  deHoy: Cobro[];
  currency: string;
}) {
  const totalAtrasado = atrasados.reduce((s, c) => s + c.monto, 0);
  const totalHoy = deHoy.reduce((s, c) => s + c.monto, 0);

  if (atrasados.length === 0 && deHoy.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-good-soft px-4 py-3 text-sm text-good">
        <Icon name="check" className="mr-2 inline h-4 w-4" />
        Hoy no le toca pagar a nadie y nadie esta atrasado. Dia tranquilo.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {atrasados.length > 0 && (
        <section className="rounded-xl border border-bad/30 bg-bad-soft p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-bad">
            <Icon name="alert" className="h-4 w-4" />
            Atrasados ({atrasados.length})
            <span className="ml-auto">{money(totalAtrasado, currency)}</span>
          </h2>
          <ul className="mt-2">
            {atrasados.map((c) => (
              <Fila key={c.id} cobro={c} currency={currency} tono="bad" />
            ))}
          </ul>
        </section>
      )}

      {deHoy.length > 0 && (
        <section className="rounded-xl border border-line bg-panel p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-strong">
            <Icon name="calendar" className="h-4 w-4 text-brand-600" />
            Hoy le toca a {deHoy.length} {deHoy.length === 1 ? "persona" : "personas"}
            <span className="ml-auto">{money(totalHoy, currency)}</span>
          </h2>
          <ul className="mt-2">
            {deHoy.map((c) => (
              <Fila key={c.id} cobro={c} currency={currency} tono="brand" />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
