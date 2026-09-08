import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { BUSINESS_LABEL } from "@/lib/nav";
import { Card, PageHeader } from "@/components/ui";
import { BusinessSettingsForm, PasswordForm } from "@/components/SettingsForms";
import { CopyLink } from "@/components/CopyLink";
import { logoutAction } from "@/actions/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function AjustesPage() {
  const user = await requireUser();
  const isBarber = user.businessType === "BARBERIA";

  return (
    <>
      <PageHeader
        title="Ajustes"
        subtitle={"Tu cuenta de " + BUSINESS_LABEL[user.businessType].toLowerCase()}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Datos del negocio" subtitle="Nombre, horario y moneda" className="lg:col-span-2">
          <BusinessSettingsForm
            settings={{
              businessName: user.businessName,
              ownerName: user.ownerName,
              phone: user.phone,
              address: user.address,
              currency: user.currency,
              timezone: user.timezone,
              openHour: user.openHour,
              closeHour: user.closeHour,
              slotMinutes: user.slotMinutes,
              workDays: user.workDays,
              bookingOpen: user.bookingOpen,
              slug: user.slug,
            }}
            isBarber={isBarber}
          />
        </Card>

        {isBarber && (
          <Card title="Tu pagina de reservas" subtitle="El enlace que le mandas a los clientes">
            <p className="break-all rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-body">
              /reservar/{user.slug}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyLink path={"/reservar/" + user.slug} />
              <Link href={"/reservar/" + user.slug} target="_blank" className="btn-ghost btn-sm">
                <Icon name="link" className="h-4 w-4" />
                Abrir
              </Link>
            </div>
            <p className="mt-3 text-xs text-subtle">
              El cliente solo ve tus servicios marcados como reservables y las horas libres.
            </p>
          </Card>
        )}

        <Card title="Seguridad" subtitle="Cambia tu contrasena">
          <PasswordForm />
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-xs text-subtle">
              Tu correo de acceso es {user.email}. Cada cuenta ve unicamente sus propios datos.
            </p>
            <form action={logoutAction}>
              <SubmitButton className="btn-danger btn-sm" pendingText="Saliendo...">
                <Icon name="logout" className="h-4 w-4" />
                Cerrar sesion
              </SubmitButton>
            </form>
          </div>
        </Card>
      </div>
    </>
  );
}
