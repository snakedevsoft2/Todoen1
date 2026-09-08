import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { BrandingForm } from "@/components/BrandingForm";
import { WhatsappForm } from "@/components/WhatsappForm";
import { Icon } from "@/components/Icon";
import { prettyPhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export default async function PersonalizarPage() {
  const { user } = await requireOwner();
  const isBarber = user.businessType === "BARBERIA";

  const ultimos = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  return (
    <>
      <PageHeader
        title="Personalizar"
        subtitle="Ponle la cara de tu marca a la aplicacion"
      />

      <section className="space-y-4">
        <div>
          <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-strong">
            <Icon name="palette" className="h-5 w-5 text-brand-600" />
            Tu marca
          </h2>
          <p className="mb-3 text-sm text-muted">
            Color, tema y logo. Lo que elijas aqui se aplica a tu panel y a tu pagina publica, y no
            afecta a ningun otro negocio.
          </p>
          <BrandingForm
            businessName={user.businessName}
            initial={{
              brandColor: user.brandColor,
              theme: user.theme,
              tagline: user.tagline,
              logo: user.logo,
            }}
          />
        </div>

        <div className="pt-2">
          <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-strong">
            <Icon name="whatsapp" className="h-5 w-5 text-brand-600" />
            Avisos por WhatsApp
          </h2>
          <p className="mb-3 text-sm text-muted">
            {isBarber
              ? "Recibe un mensaje cada vez que un cliente separe un turno."
              : "Configura el numero de tu negocio para recibir avisos."}
          </p>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
            <Card>
              <WhatsappForm
                initial={{
                  whatsappNumber: user.whatsappNumber,
                  whatsappProvider: user.whatsappProvider,
                  whatsappApiKey: user.whatsappApiKey,
                  whatsappPhoneId: user.whatsappPhoneId,
                  notifyOnBooking: user.notifyOnBooking,
                }}
              />
            </Card>

            <Card
              title="Ultimos avisos"
              action={
                <Link href="/panel/avisos" className="btn-ghost btn-sm">
                  Ver todos
                </Link>
              }
            >
              {user.whatsappNumber ? (
                <p className="mb-3 text-sm text-body">
                  Los avisos llegan a{" "}
                  <span className="font-semibold text-strong">
                    {prettyPhone(user.whatsappNumber)}
                  </span>
                  .
                </p>
              ) : (
                <p className="mb-3 text-sm text-muted">
                  Todavia no has puesto el numero que recibe los avisos.
                </p>
              )}

              {ultimos.length === 0 ? (
                <p className="text-xs text-subtle">Aun no se ha enviado ningun aviso.</p>
              ) : (
                <ul className="space-y-2">
                  {ultimos.map((n) => (
                    <li key={n.id} className="surface-box p-2.5 text-xs">
                      <p className="font-semibold text-strong">
                        {n.status === "ENVIADO"
                          ? "Enviado"
                          : n.status === "FALLIDO"
                            ? "Fallo"
                            : "Listo para enviar a mano"}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-muted">{n.message.split("\n")[0]}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </section>
    </>
  );
}
