import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { direccionBase } from "@/lib/reset";
import { MAX_DOCS_FIRMA, fechaFirma, puedeVerSolicitud, rutaDeFirma } from "@/lib/firmas";
import { estadoFirma } from "@/lib/firma-estado";
import { toInternational } from "@/lib/whatsapp";
import { anularFirmaAction, borrarFirmaAction, quitarDocumentoFirmaAction } from "@/actions/firmas";
import { Badge, Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { SubmitButton } from "@/components/SubmitButton";
import { CompartirFirma } from "@/components/firmas/CompartirFirma";
import { MarcarLugares } from "@/components/firmas/MarcarLugares";
import { AgregarDocumentosFirma } from "@/components/firmas/AgregarDocumentosFirma";

export const dynamic = "force-dynamic";

function peso(bytes: number): string {
  return bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + " KB" : (bytes / 1024 / 1024).toFixed(1) + " MB";
}

/**
 * Una solicitud de firma: mandar el enlace, marcar donde se firma en cada
 * documento y, cuando firmen, bajar los firmados y mandarselos al cliente.
 */
export default async function FirmaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { user, staff } = await requireSession({ asistenciaOk: true });
  const { id } = await params;

  const sol = await db.signRequest.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      title: true,
      message: true,
      signerName: true,
      signerPhone: true,
      signerEmail: true,
      token: true,
      status: true,
      viewedAt: true,
      signedAt: true,
      signedName: true,
      signedDocNumber: true,
      signerIp: true,
      signature: true,
      createdAt: true,
      createdByStaffId: true,
      documents: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, pages: true, size: true, spots: true, sha256: true, signedSha256: true },
      },
    },
  });
  if (!sol || !puedeVerSolicitud(staff, sol)) notFound();

  const esDueno = staff.role === "DUENO";
  const pendiente = sol.status === "PENDIENTE";
  const enlace = (await direccionBase()) + rutaDeFirma(sol.token);
  const numero = toInternational(sol.signerPhone, user.whatsappNumber || user.phone, user.timezone);
  const chat = (texto: string) => (numero ? "https://wa.me/" + numero : "https://wa.me/") + "?text=" + encodeURIComponent(texto);
  const docsTexto = sol.documents.length === 1 ? "el documento" : "los " + sol.documents.length + " documentos";

  const mensajePedir =
    "Hola " + sol.signerName + ", te comparto " + docsTexto + " de «" + sol.title + "» de " + user.businessName +
    " para que los firmes desde tu celular. Ábrelo aquí:\n" + enlace;
  const mensajeFirmados =
    "Hola " + sol.signerName + ", aquí puedes descargar tus copias firmadas de «" + sol.title + "» de " + user.businessName + ":\n" + enlace;
  const estado = estadoFirma(sol);

  return (
    <>
      <PageHeader title={sol.title} subtitle={"Para " + sol.signerName}>
        <Link href="/panel/firmas" className="btn-ghost btn-sm">
          Volver
        </Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="min-w-0 space-y-4">
          <Card title="Estado" action={<Badge tone={estado.tone}>{estado.label}</Badge>}>
            <dl className="space-y-1.5 text-[13px]">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Creada</dt>
                <dd className="text-right text-body">{fechaFirma(sol.createdAt, user.timezone).replace(/ \(.*\)$/, "")}</dd>
              </div>
              {sol.viewedAt && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">La abrió</dt>
                  <dd className="text-right text-body">{fechaFirma(sol.viewedAt, user.timezone).replace(/ \(.*\)$/, "")}</dd>
                </div>
              )}
              {sol.signedAt && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Firmó</dt>
                  <dd className="text-right font-semibold text-strong">{fechaFirma(sol.signedAt, user.timezone).replace(/ \(.*\)$/, "")}</dd>
                </div>
              )}
              {sol.signedName && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Nombre</dt>
                  <dd className="text-right text-body">
                    {sol.signedName}
                    {sol.signedDocNumber ? " · " + sol.signedDocNumber : ""}
                  </dd>
                </div>
              )}
              {sol.signerIp && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Desde</dt>
                  <dd className="text-right text-body">{sol.signerIp}</dd>
                </div>
              )}
              {(sol.signerPhone || sol.signerEmail) && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Contacto</dt>
                  <dd className="min-w-0 text-right text-body [overflow-wrap:anywhere]">
                    {[sol.signerPhone, sol.signerEmail].filter(Boolean).join(" · ")}
                  </dd>
                </div>
              )}
            </dl>
            {sol.signature && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sol.signature} alt={"Firma de " + sol.signedName} className="mt-3 h-20 max-w-full rounded-xl border border-line bg-white object-contain p-2" />
            )}
            {sol.message && <p className="mt-3 whitespace-pre-line rounded-xl bg-surface p-2.5 text-[13px] text-body">{sol.message}</p>}
          </Card>

          {pendiente && (
            <Card title="Enviar para firmar" subtitle="El cliente abre el enlace, firma con el dedo y te llegan los documentos firmados.">
              {sol.documents.length === 0 ? (
                <p className="text-[13px] text-muted">Agrega al menos un documento antes de mandar el enlace.</p>
              ) : (
                <CompartirFirma
                  enlace={enlace}
                  mensaje={mensajePedir}
                  asunto={"Documentos para firmar · " + user.businessName}
                  whatsapp={chat(mensajePedir)}
                  correo={sol.signerEmail}
                />
              )}
            </Card>
          )}

          {sol.status === "FIRMADO" && (
            <Card title="Devolver los firmados" subtitle="Mándale al cliente el enlace con sus copias firmadas.">
              <CompartirFirma
                enlace={enlace}
                mensaje={mensajeFirmados}
                asunto={"Tus documentos firmados · " + user.businessName}
                whatsapp={chat(mensajeFirmados)}
                correo={sol.signerEmail}
                firmarAqui={false}
              />
            </Card>
          )}

          {(pendiente || esDueno) && (
            <div className="flex flex-wrap gap-2">
              {pendiente && (
                <form action={anularFirmaAction}>
                  <input type="hidden" name="id" value={sol.id} />
                  <SubmitButton className="btn-ghost btn-sm" pendingText="..." confirm="¿Cancelar esta solicitud? El enlace dejará de servir.">
                    <Icon name="x" className="h-4 w-4" /> Cancelar solicitud
                  </SubmitButton>
                </form>
              )}
              {esDueno && (
                <form action={borrarFirmaAction}>
                  <input type="hidden" name="id" value={sol.id} />
                  <SubmitButton
                    className="btn-ghost btn-sm text-bad"
                    pendingText="..."
                    confirm={
                      sol.status === "FIRMADO"
                        ? "¿Borrar la solicitud y los documentos FIRMADOS? Descárgalos antes: no se pueden recuperar."
                        : "¿Borrar esta solicitud?"
                    }
                  >
                    <Icon name="trash" className="h-4 w-4" /> Borrar
                  </SubmitButton>
                </form>
              )}
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {sol.documents.map((d, i) => (
            <Card
              key={d.id}
              title={i + 1 + ". " + d.name}
              subtitle={d.pages + (d.pages === 1 ? " página" : " páginas") + " · " + peso(d.size)}
              className="min-w-0"
              action={
                <div className="flex flex-wrap gap-2">
                  {d.signedSha256 ? (
                    <>
                      <a href={"/api/firmas/documentos/" + d.id + "?firmado=1"} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">
                        <Icon name="eye" className="h-4 w-4" /> Ver firmado
                      </a>
                      <a href={"/api/firmas/documentos/" + d.id + "?firmado=1&descargar=1"} className="btn-primary btn-sm">
                        <Icon name="download" className="h-4 w-4" /> Descargar
                      </a>
                    </>
                  ) : (
                    <a href={"/api/firmas/documentos/" + d.id} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">
                      <Icon name="eye" className="h-4 w-4" /> Abrir PDF
                    </a>
                  )}
                  {pendiente && (
                    <form action={quitarDocumentoFirmaAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <SubmitButton
                        className="btn-ghost btn-sm px-2 text-subtle hover:text-bad"
                        pendingText="..."
                        ariaLabel={"Quitar " + d.name}
                        confirm={"¿Quitar " + d.name + " de la solicitud?"}
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </SubmitButton>
                    </form>
                  )}
                </div>
              }
            >
              {pendiente ? (
                <details open={i === 0}>
                  <summary className="mb-2 cursor-pointer text-[13px] font-semibold text-brand-700">Marcar dónde firma el cliente</summary>
                  <MarcarLugares docId={d.id} url={"/api/firmas/documentos/" + d.id} paginas={d.pages} spots={d.spots} editable />
                </details>
              ) : sol.status === "FIRMADO" ? (
                <p className="text-[12px] text-muted [overflow-wrap:anywhere]">
                  Huella del original: {d.sha256}
                  <br />
                  Huella del firmado: {d.signedSha256 ?? "—"}
                </p>
              ) : (
                <p className="text-[13px] text-muted">Solicitud cancelada.</p>
              )}
            </Card>
          ))}

          {pendiente && (
            <Card title="Agregar documentos" subtitle={"Hasta " + MAX_DOCS_FIRMA + " por solicitud, de 3 MB cada uno."}>
              <AgregarDocumentosFirma requestId={sol.id} faltan={MAX_DOCS_FIRMA - sol.documents.length} />
              {sol.documents.length >= MAX_DOCS_FIRMA && (
                <p className="text-[13px] text-muted">Esta solicitud ya tiene el máximo de documentos.</p>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
