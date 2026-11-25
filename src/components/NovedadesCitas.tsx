import Link from "next/link";
import { cuandoPaso, lineaDeNovedad, type NovedadReciente } from "@/lib/novedades-cita";
import { Card } from "./ui";
import { Icon } from "./Icon";

/** Icono y color de cada novedad. */
export const ESTILO_NOVEDAD = {
  LLEGO: { icon: "check", tono: "bg-good-soft text-good" },
  NO_LLEGO: { icon: "x", tono: "bg-bad-soft text-bad" },
  REPROGRAMADA: { icon: "clock", tono: "bg-warn-soft text-warn" },
} as const;

/**
 * Lo que marcaron las manicuristas de MB Nails (llegó, no llegó, cambió la
 * hora), para la dueña: en su inicio y en la Agenda. Ver lib/novedades-cita.ts.
 */
export function NovedadesCitas({
  novedades,
  hoy,
  zona,
  subtitulo,
  abrirAgenda = false,
  className,
}: {
  novedades: NovedadReciente[];
  hoy: string;
  zona: string;
  subtitulo: string;
  /** En el inicio: el boton para ir a la Agenda. */
  abrirAgenda?: boolean;
  className?: string;
}) {
  return (
    <Card
      title="Novedades de las manicuristas"
      subtitle={subtitulo}
      className={className}
      action={
        abrirAgenda ? (
          <Link href="/panel/turnos" className="btn-ghost btn-sm">
            Abrir agenda
          </Link>
        ) : undefined
      }
    >
      {novedades.length === 0 ? (
        <p className="text-sm text-muted">Cuando una manicurista marque que la clienta llegó, no llegó o le cambie la hora, aparece aquí y te llega al celular.</p>
      ) : (
        <ul className="space-y-2" data-novedades>
          {novedades.map((n) => {
            const estilo = ESTILO_NOVEDAD[n.kind];
            return (
              <li key={n.id} className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm" data-novedad={n.kind}>
                <span className={"mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full " + estilo.tono}>
                  <Icon name={estilo.icon} className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-strong">{lineaDeNovedad(n, hoy)}</p>
                  <p className="text-xs text-muted">
                    {n.serviceName} · {cuandoPaso(n.createdAt, zona, hoy)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
