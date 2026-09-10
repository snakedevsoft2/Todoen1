import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { BUSINESS_LABEL } from "@/lib/nav";
import {
  SUPPORT_HOURS,
  SUPPORT_TOPICS,
  SUPPORT_WHATSAPP_PRETTY,
  supportLink,
} from "@/lib/support";
import { restartTourAction } from "@/actions/tour";
import { restartOnboardingAction } from "@/actions/onboarding";
import { Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";
import { CanalesOficiales } from "@/components/CanalesOficiales";
import { COMPANY_LOGO } from "@/lib/canales";

export const dynamic = "force-dynamic";

export default async function SoportePage() {
  const { user, staff } = await requireSession();
  const businessLabel = BUSINESS_LABEL[user.businessType];

  const link = (topic?: string) =>
    supportLink({
      businessName: user.businessName,
      businessLabel,
      personName: staff.name,
      topic,
    });

  return (
    <>
      <PageHeader
        title="Soporte tecnico"
        subtitle="Te respondemos por WhatsApp, en el mismo dia"
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-line bg-good-solid text-on-good shadow-soft">
                <Icon name="whatsapp" className="h-7 w-7" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[22px] leading-tight text-strong">
                  {SUPPORT_WHATSAPP_PRETTY}
                </p>
                <p className="mt-1 text-sm text-muted">{SUPPORT_HOURS}</p>
              </div>
            </div>

            <a
              href={link()}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-success mt-4 w-full justify-center"
            >
              <Icon name="whatsapp" className="h-5 w-5" />
              Escribir por WhatsApp
            </a>

            <p className="mt-3 text-xs text-subtle">
              El mensaje sale con el nombre de tu negocio y el tuyo, para no tener que explicarlo
              cada vez.
            </p>
          </Card>

          <Card
            title="De que se trata"
            subtitle="Toca el tema y el mensaje sale ya escrito"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {SUPPORT_TOPICS.map((topic) => (
                <a
                  key={topic.label}
                  href={link(topic.label)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 rounded-xl border border-line bg-panel px-3 py-2.5 text-left transition hover:bg-surface"
                >
                  <span className="mt-0.5 shrink-0 text-brand-600">
                    <Icon name={topic.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-strong">{topic.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-tight text-muted">
                      {topic.hint}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card
            title="Canales oficiales"
            subtitle="Los unicos por los que escribimos. Si te contactan por otro, no somos nosotros"
          >
            <div className="mb-4 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={COMPANY_LOGO} alt="" className="h-14 w-auto shrink-0 object-contain" />
              <p className="text-sm text-body">
                Aqui te respondemos y aqui publicamos lo nuevo de la aplicacion.
              </p>
            </div>
            <CanalesOficiales variant="lista" />
          </Card>

          <Card title="Vuelve a ver el instructivo" subtitle="El de bienvenida, paso a paso">
            <p className="mb-3 text-sm text-body">
              Si quieres repasar como se registra una venta, como se cierra la caja o donde queda
              cada cosa, lo abrimos otra vez en el resumen del dia.
            </p>
            <form action={restartTourAction}>
              <SubmitButton className="btn-ghost w-full" pendingText="Abriendo...">
                <Icon name="check" className="h-4 w-4" />
                Ver el instructivo otra vez
              </SubmitButton>
            </form>
          </Card>

          {/* Tres capas, de la mas guiada a la mas suelta: el asistente arma el
              menu, el instructivo explica pantalla por pantalla, y la guia
              responde una duda suelta cuando ya se esta trabajando. */}
          <Card title="Volver a armar tu menu" subtitle="El asistente de bienvenida">
            <p className="mb-3 text-sm text-body">
              Si te sobran o te faltan apartados, el asistente te vuelve a preguntar que necesitas
              y te deja el menu como lo quieras. No borra nada de lo que ya tienes cargado.
            </p>
            <form action={restartOnboardingAction}>
              <SubmitButton className="btn-ghost w-full" pendingText="Abriendo...">
                <Icon name="sliders" className="h-4 w-4" />
                Volver a armar mi menu
              </SubmitButton>
            </form>
          </Card>

          <Card title="Buscar una duda suelta" subtitle="La guia">
            <p className="mb-3 text-sm text-body">
              Escribes lo que quieres hacer y te decimos donde y como. Sirve para consultarla con
              el cliente enfrente.
            </p>
            <Link href="/panel/guia" className="btn-ghost w-full">
              <Icon name="book" className="h-4 w-4" />
              Abrir la guia
            </Link>
          </Card>

          <Card title="Antes de escribir">
            <ul className="space-y-2.5 text-sm text-body">
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                Cuentanos que pantalla estabas viendo y que tocaste.
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                Si puedes, mandanos una captura. Con eso se resuelve casi todo mas rapido.
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                Nunca te vamos a pedir tu contrasena. Si alguien te la pide, no es soporte.
              </li>
            </ul>

            <div className="mt-4 border-t border-line pt-4">
              <p className="text-xs text-subtle">
                Datos con los que escribes: <strong className="text-body">{user.businessName}</strong>{" "}
                ({businessLabel}), como {staff.name}.
              </p>
              <Link href="/panel/ajustes" className="link mt-1 inline-block text-xs">
                Cambiar los datos del negocio
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
