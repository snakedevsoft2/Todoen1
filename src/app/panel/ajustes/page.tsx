import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { BUSINESS_LABEL, publicPath } from "@/lib/nav";
import { Card, PageHeader } from "@/components/ui";
import { BusinessSettingsForm, PasswordForm } from "@/components/SettingsForms";
import { StaffPasswordForm } from "@/components/StaffForms";
import { CopyLink } from "@/components/CopyLink";
import { PreguntaSeguridadForm } from "@/components/PreguntaSeguridadForm";
import { logoutAction } from "@/actions/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function AjustesPage() {
  const { user, staff } = await requireSession();
  const isBarber = user.businessType === "BARBERIA";
  const isClothing = user.businessType === "ROPA";
  const isOwner = staff.role === "DUENO";
  const publicLink = publicPath(user.businessType, user.slug);

  return (
    <>
      <PageHeader
        title="Ajustes"
        subtitle={
          isOwner
            ? "Tu cuenta de " + BUSINESS_LABEL[user.businessType].toLowerCase()
            : "Tu usuario en " + user.businessName
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {isOwner && (
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
            isClothing={isClothing}
          />
        </Card>
        )}

        {!isOwner && (
          <Card title="Tus datos" subtitle="Así te ve el resto del equipo" className="lg:col-span-2">
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-sm text-body">
                <strong className="text-strong">{staff.name}</strong>
                {staff.email ? " · " + staff.email : ""}
              </p>
              <Link href="/panel/perfil" className="btn-ghost btn-sm">
                <Icon name="user" className="h-4 w-4" />
                Editar mi perfil y mi foto
              </Link>
            </div>
          </Card>
        )}

        {/* Para dueno y empleados por igual: es lo que les permite recuperar
            su clave solos si el correo no llega. */}
        <Card
          title="Pregunta de seguridad"
          subtitle="Para recuperar tu contraseña sin depender del correo"
        >
          <PreguntaSeguridadForm actual={isOwner ? user.securityQuestion : staff.securityQuestion} />
        </Card>

        {publicLink && (
          <Card
            title="Tu portafolio publico"
            subtitle="El enlace que le mandas a los clientes"
          >
            <p className="break-all rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-body">
              {publicLink}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyLink path={publicLink} />
              <Link href={publicLink} target="_blank" className="btn-ghost btn-sm">
                <Icon name="link" className="h-4 w-4" />
                Abrir
              </Link>
            </div>
            <p className="mt-3 text-xs text-subtle">
              El cliente ve lo que marcaste para tu portafolio, con foto y precio, y arma su pedido.
              Lo editas en <strong className="text-body">Mi portafolio</strong>, donde también está
              tu codigo QR.
            </p>
          </Card>
        )}

        <Card title="Seguridad" subtitle="Cambia tu contraseña">
          {isOwner ? <PasswordForm /> : <StaffPasswordForm />}
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-xs text-subtle">
              Tu correo de acceso es {isOwner ? user.email : staff.email}. Cada negocio ve unicamente
              sus propios datos.
            </p>
            <form action={logoutAction}>
              <SubmitButton className="btn-danger btn-sm" pendingText="Saliendo...">
                <Icon name="logout" className="h-4 w-4" />
                Cerrar sesión
              </SubmitButton>
            </form>
          </div>
        </Card>
      </div>
    </>
  );
}
