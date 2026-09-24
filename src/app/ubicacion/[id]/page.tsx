import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { prettyDay } from "@/lib/format";
import { enlaceMapa } from "@/lib/geo";
import { logoUrl } from "@/lib/nav";
import { BrandMark } from "@/components/BrandMark";
import { ThemeStyle } from "@/components/ThemeStyle";
import { Icon } from "@/components/Icon";
import { CompartirUbicacionForm } from "@/components/CompartirUbicacionForm";

export const dynamic = "force-dynamic";

/**
 * Pantalla pública para que el deudor comparta su ubicación, si quiere.
 *
 * Sin cuenta ni clave: el enlace es el "token" (el id de la deuda no aparece
 * en ningún listado público, igual que el resto de enlaces de esta
 * aplicación). No pide nada más del crédito: ni el monto, ni el fiador, ni
 * las referencias. Solo lo necesario para que la persona sepa a quién le está
 * compartiendo su ubicación y pueda decidir.
 */
export default async function UbicacionDeudorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const deuda = await db.debt.findUnique({
    where: { id },
    select: {
      id: true,
      clientName: true,
      locationConsentAt: true,
      lastLat: true,
      lastLng: true,
      lastLocationAt: true,
      user: {
        select: { businessName: true, slug: true, logo: true, updatedAt: true, brandColor: true, theme: true },
      },
    },
  });
  if (!deuda) notFound();

  const { user: negocio } = deuda;
  const logo = logoUrl(negocio.slug, negocio.logo, negocio.updatedAt);
  const yaComparte = Boolean(deuda.locationConsentAt);
  const tieneUbicacion = deuda.lastLat !== null && deuda.lastLng !== null;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-8 sm:py-12">
      <ThemeStyle brandColor={negocio.brandColor} theme={negocio.theme} />

      <header className="text-center">
        <div className="mx-auto mb-3 flex justify-center">
          <BrandMark name={negocio.businessName} logo={logo} size="xl" />
        </div>
        <h1 className="text-xl font-bold text-strong">{negocio.businessName}</h1>
        <p className="mt-1 text-sm text-muted">Hola {deuda.clientName}</p>
      </header>

      <div className="card mt-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-strong">
          <Icon name="link" className="h-5 w-5 text-brand-600" />
          Compartir tu ubicación
        </h2>
        <p className="mt-2 text-sm text-body">
          {negocio.businessName} te pide compartir dónde estás ahora mismo, para tu crédito. Esto es
          completamente voluntario:
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-body">
          <li className="flex gap-2">
            <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
            Solo se comparte cuando tú tocas el botón, aquí mismo.
          </li>
          <li className="flex gap-2">
            <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
            No queda prendido después: no te siguen mientras cierras esta página.
          </li>
          <li className="flex gap-2">
            <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
            Puedes dejar de compartir cuando quieras, aquí mismo.
          </li>
        </ul>

        {tieneUbicacion && (
          <div className="mt-4 rounded-xl border border-line bg-surface p-3 text-sm">
            <p className="font-semibold text-strong">
              {yaComparte ? "Estás compartiendo tu ubicación" : "Última ubicación que compartiste"}
            </p>
            {deuda.lastLocationAt && (
              <p className="mt-0.5 text-xs text-muted">
                {prettyDay(deuda.lastLocationAt.toISOString().slice(0, 10))} a las{" "}
                {deuda.lastLocationAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: true })}
              </p>
            )}
            <a
              href={enlaceMapa(deuda.lastLat as number, deuda.lastLng as number)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost btn-sm mt-2"
            >
              <Icon name="link" className="h-4 w-4" />
              Ver en el mapa
            </a>
          </div>
        )}

        <div className="mt-4">
          <CompartirUbicacionForm debtId={deuda.id} yaComparte={yaComparte} />
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-subtle">
        Si no fuiste tú quien pidió este crédito, no compartas tu ubicación desde este enlace.
      </p>
    </div>
  );
}
