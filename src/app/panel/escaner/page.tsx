import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dayIn, todayIn } from "@/lib/dates";
import { shortDay } from "@/lib/format";
import { borrarDocumentoAction } from "@/actions/documentos";
import { Card, Empty, PageHeader } from "@/components/ui";
import { Escaner } from "@/components/Escaner";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";
import { AccionesDocumento } from "@/components/CompartirPdf";

export const dynamic = "force-dynamic";

function peso(bytes: number): string {
  return bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + " KB" : (bytes / 1024 / 1024).toFixed(1) + " MB";
}

/**
 * Escanear documentos con el telefono y volverlos PDF o texto.
 *
 * El administrador ve los documentos que guardo todo el equipo; cada quien,
 * los suyos.
 */
export default async function EscanerPage() {
  // Escaner es una de las pantallas fijas del empleado de asistencia: sin
  // avisarle a requireSession(), lo mandaria de vuelta a Marcar en vez de
  // dejarlo verla.
  const { user, staff } = await requireSession({ asistenciaOk: true });
  const esDueno = staff.role === "DUENO";

  const [documentos, personas] = await Promise.all([
    db.scanDocument.findMany({
      where: { userId: user.id, ...(esDueno ? {} : { staffId: staff.id }) },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, title: true, pages: true, size: true, createdAt: true, staffId: true, text: true },
    }),
    esDueno ? db.staff.findMany({ where: { userId: user.id }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const nombres = new Map(personas.map((p) => [p.id, p.name]));

  return (
    <>
      <PageHeader title="Escáner" subtitle="Toma fotos de un documento y conviértelo en PDF o en texto" />

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card className="min-w-0">
          <Escaner hoy={todayIn(user.timezone)} cuenta={staff.id} />
        </Card>

        <Card title={esDueno ? "Documentos guardados" : "Mis documentos"} className="min-w-0">
          {documentos.length === 0 ? (
            <Empty title="Todavía no hay documentos" hint="Los que guardes aparecen aquí para abrirlos cuando los necesites." />
          ) : (
            <ul className="divide-y divide-line" data-documentos>
              {documentos.map((d) => (
                <li key={d.id} className="py-2.5">
                  <div className="flex items-center gap-2">
                    <Icon name="file" className="h-5 w-5 shrink-0 text-bad" />
                    <span className="min-w-0 flex-1">
                      <a
                        href={"/documento/" + d.id}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm font-semibold text-strong hover:underline"
                      >
                        {d.title}
                      </a>
                      <span className="block text-[11px] text-muted">
                        {d.pages} {d.pages === 1 ? "página" : "páginas"} · {peso(d.size)} · {shortDay(dayIn(d.createdAt, user.timezone))}
                        {esDueno && d.staffId && nombres.get(d.staffId) ? " · " + nombres.get(d.staffId) : ""}
                      </span>
                    </span>
                    {esDueno && (
                    <form action={borrarDocumentoAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <SubmitButton
                        className="btn-ghost btn-sm px-2 text-subtle hover:text-bad"
                        pendingText="..."
                        ariaLabel={"Borrar " + d.title}
                        confirm={"¿Borrar " + d.title + "?"}
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </SubmitButton>
                    </form>
                    )}
                  </div>
                  <div className="mt-1.5 pl-7">
                    <AccionesDocumento id={d.id} titulo={d.title} />
                  </div>

                  {d.text && (
                    <details className="mt-1.5 pl-7">
                      <summary className="cursor-pointer text-[12px] font-semibold text-brand-700">Ver texto</summary>
                      <p className="mt-1 max-h-48 overflow-auto whitespace-pre-line rounded-lg bg-surface p-2 text-[12px] text-body [overflow-wrap:anywhere]">
                        {d.text}
                      </p>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
