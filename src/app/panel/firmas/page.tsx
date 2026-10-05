import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dayIn } from "@/lib/dates";
import { shortDay } from "@/lib/format";
import { MAX_DOCS_FIRMA } from "@/lib/firmas";
import { estadoFirma } from "@/lib/firma-estado";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { NuevaSolicitudFirma } from "@/components/firmas/NuevaSolicitudFirma";

export const dynamic = "force-dynamic";

/**
 * Documentos para que un cliente los firme desde su celular.
 *
 * El administrador ve las solicitudes de todo el equipo; cada quien, las suyas.
 */
export default async function FirmasPage() {
  // Firmas es una de las pantallas fijas del empleado de asistencia.
  const { user, staff } = await requireSession({ asistenciaOk: true });
  const esDueno = staff.role === "DUENO";
  const propias = esDueno ? {} : { createdByStaffId: staff.id };

  const [solicitudes, escaneados, personas] = await Promise.all([
    db.signRequest.findMany({
      where: { userId: user.id, ...propias },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        signerName: true,
        status: true,
        viewedAt: true,
        signedAt: true,
        createdAt: true,
        createdByStaffId: true,
        _count: { select: { documents: true } },
      },
    }),
    db.scanDocument.findMany({
      where: { userId: user.id, ...(esDueno ? {} : { staffId: staff.id }) },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, title: true, pages: true },
    }),
    esDueno ? db.staff.findMany({ where: { userId: user.id }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const nombres = new Map(personas.map((p) => [p.id, p.name]));
  const pendientes = solicitudes.filter((s) => s.status === "PENDIENTE").length;

  return (
    <>
      <PageHeader
        title="Firmas"
        subtitle="Manda documentos para que tu cliente los firme desde su celular y te lleguen firmados"
      />

      <div className="grid gap-4 lg:grid-cols-[400px_1fr]">
        <Card title="Nueva solicitud de firma" className="min-w-0">
          <NuevaSolicitudFirma escaneados={escaneados} maximo={MAX_DOCS_FIRMA} />
        </Card>

        <Card
          title={esDueno ? "Solicitudes" : "Mis solicitudes"}
          subtitle={pendientes ? pendientes + " sin firmar" : undefined}
          className="min-w-0"
        >
          {solicitudes.length === 0 ? (
            <Empty
              title="Todavía no has mandado documentos a firmar"
              hint="Adjunta el PDF, marca dónde se firma y mándale el enlace al cliente por WhatsApp o correo."
            />
          ) : (
            <ul className="divide-y divide-line" data-solicitudes-firma>
              {solicitudes.map((s) => {
                const estado = estadoFirma(s);
                return (
                  <li key={s.id}>
                    <Link href={"/panel/firmas/" + s.id} className="flex items-center gap-3 py-3 hover:bg-surface">
                      <Icon name="pencil" className="h-5 w-5 shrink-0 text-brand-600" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-strong">{s.title}</span>
                        <span className="block truncate text-[12px] text-muted">
                          {s.signerName} · {s._count.documents} {s._count.documents === 1 ? "documento" : "documentos"} ·{" "}
                          {shortDay(dayIn(s.signedAt ?? s.createdAt, user.timezone))}
                          {esDueno && s.createdByStaffId && nombres.get(s.createdByStaffId) ? " · " + nombres.get(s.createdByStaffId) : ""}
                        </span>
                      </span>
                      <Badge tone={estado.tone}>{estado.label}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
