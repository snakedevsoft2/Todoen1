import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Dancing_Script, Great_Vibes } from "next/font/google";
import { db } from "@/lib/db";
import { logoUrl } from "@/lib/nav";
import { negocioTieneLogo } from "@/lib/imagenes";
import { fechaFirma, solicitudPorToken } from "@/lib/firmas";
import { toInternational, waLink } from "@/lib/whatsapp";
import { Icon } from "@/components/Icon";
import { FirmarDocumentos } from "@/components/firmas/FirmarDocumentos";

export const dynamic = "force-dynamic";

// Los documentos son de una persona: que no salgan en buscadores.
export const metadata: Metadata = { title: "Documentos para firmar", robots: { index: false, follow: false } };

// next/font exige una llamada literal por letra.
const greatVibes = Great_Vibes({ subsets: ["latin"], weight: "400", display: "swap" });
const dancing = Dancing_Script({ subsets: ["latin"], weight: "600", display: "swap" });
const FUENTES = [
  { etiqueta: "Clásica", familia: greatVibes.style.fontFamily },
  { etiqueta: "Manuscrita", familia: dancing.style.fontFamily },
];

function peso(bytes: number): string {
  return bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + " KB" : (bytes / 1024 / 1024).toFixed(1) + " MB";
}

/**
 * Lo que abre el enlace que el negocio le manda al cliente. Publico y sin
 * sesion, como el ticket del parqueadero: se busca por el token, que no se
 * puede adivinar. Antes de firmar muestra los documentos para firmarlos;
 * despues, las copias firmadas para descargarlas.
 */
export default async function FirmarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: crudo } = await params;
  const token = String(crudo ?? "").slice(0, 60);
  const sol = await solicitudPorToken(token);
  if (!sol) notFound();

  const shop = sol.user;
  if (!sol.viewedAt && sol.status === "PENDIENTE") {
    // La primera vez que lo abren: el negocio ve "Lo abrió".
    await db.signRequest.update({ where: { id: sol.id }, data: { viewedAt: new Date() } }).catch(() => {});
  }
  const logo = logoUrl(shop.slug, await negocioTieneLogo(sol.userId), shop.updatedAt);
  const whatsapp = waLink(
    toInternational(shop.whatsappNumber || shop.phone, shop.whatsappNumber, shop.timezone),
    sol.status === "FIRMADO"
      ? "Hola, ya firmé los documentos de «" + sol.title + "»."
      : "Hola, tengo una pregunta sobre los documentos de «" + sol.title + "»."
  );

  return (
    <div className="min-h-dvh bg-surface">
      <header className="border-b border-line bg-panel/95 px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
          ) : null}
          <div className="min-w-0">
            <p className="truncate font-display text-base text-strong">{shop.businessName}</p>
            <p className="text-xs text-muted">Firma de documentos</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        <section>
          <h1 className="font-display text-2xl leading-tight text-strong [overflow-wrap:anywhere]">{sol.title}</h1>
          {sol.status === "PENDIENTE" && (
            <p className="mt-1 text-sm text-muted">
              Hola {sol.signerName}, {shop.businessName} te envió{" "}
              {sol.documents.length === 1 ? "un documento" : sol.documents.length + " documentos"} para firmar desde tu celular.
            </p>
          )}
          {sol.message && sol.status === "PENDIENTE" && (
            <p className="mt-3 whitespace-pre-line rounded-xl border border-line bg-panel p-3 text-sm text-body [overflow-wrap:anywhere]">
              {sol.message}
            </p>
          )}
        </section>

        {sol.status === "ANULADO" && (
          <section className="rounded-2xl border border-bad-line bg-bad-soft p-4 text-center text-sm text-bad">
            {shop.businessName} canceló esta solicitud de firma. Si crees que es un error, comunícate con ellos.
          </section>
        )}

        {sol.status === "PENDIENTE" && sol.documents.length === 0 && (
          <section className="card text-center text-sm text-muted">
            Todavía no hay documentos para firmar. Vuelve a abrir el enlace en un rato.
          </section>
        )}

        {sol.status === "PENDIENTE" && sol.documents.length > 0 && (
          <FirmarDocumentos
            token={token}
            nombre={sol.signerName}
            fuentes={FUENTES}
            documentos={sol.documents.map((d) => ({ id: d.id, name: d.name, pages: d.pages, spots: d.spots }))}
          />
        )}

        {sol.status === "FIRMADO" && (
          <>
            <section className="rounded-2xl border border-good-line bg-good-soft p-4 text-center">
              <Icon name="check" className="mx-auto h-8 w-8 text-good" />
              <p className="mt-1 font-display text-lg text-strong">Documentos firmados</p>
              <p className="mt-1 text-sm text-body">
                Firmó {sol.signedName}
                {sol.signedAt ? " el " + fechaFirma(sol.signedAt, shop.timezone) : ""}. {shop.businessName} ya los recibió.
              </p>
            </section>
            <section className="card">
              <h2 className="font-display text-[15px] text-strong">Tus copias firmadas</h2>
              <p className="mt-1 text-[13px] text-muted">Guárdalas: cada una lleva al final la constancia de la firma.</p>
              <ul className="mt-3 space-y-2" data-firmados>
                {sol.documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
                    <Icon name="file" className="h-5 w-5 shrink-0 text-bad" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-strong">{d.name}</span>
                    <a
                      href={"/firmar/" + token + "/pdf/" + d.id + "?firmado=1"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost btn-sm"
                    >
                      <Icon name="eye" className="h-4 w-4" /> Ver
                    </a>
                    <a href={"/firmar/" + token + "/pdf/" + d.id + "?firmado=1&descargar=1"} className="btn-primary btn-sm">
                      <Icon name="download" className="h-4 w-4" /> Descargar
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {whatsapp && sol.status !== "ANULADO" && (
          <div className="flex justify-center">
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn-success btn-sm">
              <Icon name="whatsapp" className="h-4 w-4" />
              Escribir a {shop.businessName}
            </a>
          </div>
        )}

        {sol.status === "PENDIENTE" && sol.documents.length > 0 && (
          <p className="pb-4 text-center text-xs text-subtle">
            {sol.documents.map((d) => d.name + " (" + d.pages + (d.pages === 1 ? " pág., " : " págs., ") + peso(d.size) + ")").join(" · ")}
          </p>
        )}
      </main>
    </div>
  );
}
