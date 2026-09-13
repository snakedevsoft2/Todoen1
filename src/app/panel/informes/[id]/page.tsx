import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, inicioDelDiaEn } from "@/lib/dates";
import { prettyDay } from "@/lib/format";
import { logoUrl } from "@/lib/nav";
import type { InformeDatos } from "@/lib/informe-pdf";
import { MAX_ADJUNTOS, puedeVerInforme } from "@/lib/informes";
import { AdjuntosInforme } from "@/components/AdjuntosInforme";
import { Card, PageHeader } from "@/components/ui";
import { FotosInforme } from "@/components/FotosInforme";
import { AccionesInforme } from "@/components/CompartirPdf";
import { SubmitButton } from "@/components/SubmitButton";
import { borrarInformeAction } from "@/actions/informes";

export const dynamic = "force-dynamic";

export default async function InformePage({ params }: { params: Promise<{ id: string }> }) {
  const { user, staff } = await requireSession();
  const { id } = await params;

  const informe = await db.visitReport.findFirst({
    where: { id, userId: user.id },
    include: {
      site: { select: { id: true, name: true, address: true } },
      // Sin la imagen: solo el id. La foto se pide aparte por su direccion, o
      // la pagina cargaria varios megas de texto.
      photos: { orderBy: { sort: "asc" }, select: { id: true, caption: true } },
      attachments: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, size: true } },
    },
  });
  // El empleado solo abre los suyos; un id ajeno responde como si no existiera.
  if (!informe || !puedeVerInforme(staff, informe)) notFound();

  // El administrador lo abrio: deja de salir como nuevo y el empleado ve que ya
  // se lo miraron.
  if (staff.role === "DUENO" && informe.sentAt && !informe.seenAt && informe.createdByStaffId !== staff.id) {
    await db.visitReport.update({ where: { id: informe.id }, data: { seenAt: new Date() } });
  }

  const tz = user.timezone;
  const hora = (d: Date) =>
    d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: tz });

  // Quien estuvo en el sitio ese dia, sacado de los marcajes: el reporte no se
  // lo inventa ni lo escribe a mano.
  const personal: InformeDatos["personal"] = [];
  if (informe.site) {
    const marcas = await db.attendance.findMany({
      where: {
        userId: user.id,
        siteId: informe.site.id,
        voidedAt: null,
        markedAt: {
          gte: inicioDelDiaEn(informe.day, tz),
          lt: inicioDelDiaEn(addDays(informe.day, 1), tz),
        },
      },
      orderBy: { markedAt: "asc" },
      select: { kind: true, markedAt: true, staff: { select: { id: true, name: true } } },
    });
    const porPersona = new Map<string, { name: string; entrada: Date | null; salida: Date | null }>();
    for (const m of marcas) {
      const p = porPersona.get(m.staff.id) ?? { name: m.staff.name, entrada: null, salida: null };
      if (m.kind === "ENTRADA" && !p.entrada) p.entrada = m.markedAt;
      if (m.kind === "SALIDA") p.salida = m.markedAt;
      porPersona.set(m.staff.id, p);
    }
    for (const p of porPersona.values()) {
      personal.push({
        name: p.name,
        entrada: p.entrada ? hora(p.entrada) : null,
        salida: p.salida ? hora(p.salida) : null,
      });
    }
  }

  const creador = informe.createdByStaffId
    ? await db.staff.findFirst({
        where: { id: informe.createdByStaffId, userId: user.id },
        select: { name: true },
      })
    : null;

  const esDueno = staff.role === "DUENO";
  const puedeBorrarFotos = esDueno || informe.createdByStaffId === staff.id;

  const datos: InformeDatos = {
    businessName: user.businessName,
    businessPhone: user.phone,
    businessAddress: user.address,
    logoUrl: logoUrl(user.slug, user.logo, user.updatedAt),
    title: informe.title,
    day: informe.day,
    siteName: informe.site?.name ?? null,
    siteAddress: informe.site?.address ?? null,
    clientName: informe.clientName,
    body: informe.body,
    createdBy: creador?.name ?? null,
    personal,
    fotos: informe.photos.map((f) => ({ url: "/foto-reporte/" + f.id, caption: f.caption })),
    observaciones: informe.observations,
    anexos: informe.attachments.map((a) => ({ url: "/adjunto-reporte/" + a.id, name: a.name })),
  };

  return (
    <>
      <PageHeader title={informe.title} subtitle={prettyDay(informe.day)}>
        <Link href="/panel/informes" className="btn-ghost btn-sm">
          Volver a reportes
        </Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Dato label="Sitio" valor={informe.site?.name ?? "Sin sitio"} />
              <Dato label="Cliente" valor={informe.clientName ?? "-"} />
              <Dato label="Elaborado por" valor={creador?.name ?? "-"} />
            </dl>
            {informe.body && (
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-body [overflow-wrap:anywhere]">
                {informe.body}
              </p>
            )}
            {informe.observations && (
              <div className="mt-4 rounded-xl bg-surface px-3.5 py-3">
                <p className="eyebrow">Observaciones y recomendaciones</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-body [overflow-wrap:anywhere]">
                  {informe.observations}
                </p>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="text-sm font-bold text-strong">Personal en el sitio</h2>
            {personal.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted">
                {informe.site
                  ? "Nadie marcó en este sitio ese día."
                  : "El reporte no tiene sitio, así que no se puede saber quién estuvo."}
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {personal.map((p) => (
                  <li key={p.name} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-bold text-strong">{p.name}</span>
                    <span className="num text-[13px] text-muted">
                      {p.entrada ?? "-"} → {p.salida ?? "-"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-bold text-strong">
              Fotos ({informe.photos.length})
            </h2>
            <FotosInforme
              reportId={informe.id}
              fotos={informe.photos}
              puedeBorrar={puedeBorrarFotos}
            />
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-bold text-strong">
              Evidencias en PDF ({informe.attachments.length})
            </h2>
            <AdjuntosInforme
              reportId={informe.id}
              adjuntos={informe.attachments}
              puedeEditar={puedeBorrarFotos}
              maximo={MAX_ADJUNTOS}
            />
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="text-sm font-bold text-strong">Compartir</h2>
            <p className="mb-3 mt-1 text-[13px] text-muted">
              El PDF lleva tu logo, lo que se hizo, el personal con sus horas, las fotos con su descripción, las
              observaciones y, al final, los PDF de evidencia.
            </p>
            {esDueno && !user.logo && (
              <p className="mb-3 text-[12px] text-muted">
                Todavía no tienes logo.{" "}
                <Link href="/panel/personalizar" className="font-semibold text-brand-700 underline">
                  Súbelo aquí
                </Link>{" "}
                para que salga en el encabezado.
              </p>
            )}
            <AccionesInforme datos={datos} telefono={informe.clientPhone} />
          </Card>

          {esDueno && (
            <form action={borrarInformeAction}>
              <input type="hidden" name="id" value={informe.id} />
              <SubmitButton className="btn-danger btn-sm w-full" pendingText="Borrando...">
                Borrar reporte
              </SubmitButton>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 text-sm font-bold text-strong [overflow-wrap:anywhere]">{valor}</dd>
    </div>
  );
}
