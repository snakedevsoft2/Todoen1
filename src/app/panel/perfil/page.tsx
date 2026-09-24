import { requireSession } from "@/lib/auth";
import { etiquetaDeRol, fotoPerfil } from "@/lib/staff";
import { Card, PageHeader } from "@/components/ui";
import { PerfilForm } from "@/components/PerfilForm";
import { PasswordForm } from "@/components/SettingsForms";
import { StaffPasswordForm } from "@/components/StaffForms";
import { PreguntaSeguridadForm } from "@/components/PreguntaSeguridadForm";

export const dynamic = "force-dynamic";

/** El perfil de quien entro: su foto, su nombre y su clave. Todos lo tienen. */
export default async function PerfilPage() {
  // Perfil tambien es una pantalla fija del empleado de asistencia y del
  // lavador (ver panel/layout.tsx): sin avisarle a requireSession(), los
  // mandaria de vuelta a su pantalla fija en vez de dejarlos verla.
  const { user, staff } = await requireSession({ asistenciaOk: true, lavadorOk: true });
  const esDueno = staff.role === "DUENO";

  return (
    <>
      <PageHeader title="Mi perfil" subtitle={etiquetaDeRol(staff.role, user.businessType) + " en " + user.businessName} />

      <div className="mx-auto grid w-full max-w-3xl gap-4 lg:grid-cols-2">
        <Card title="Tus datos" subtitle="Así te ve el resto del equipo" className="lg:col-span-2">
          <PerfilForm
            inicial={{
              name: staff.name,
              phone: staff.phone,
              email: esDueno ? user.email : staff.email,
              color: staff.color,
              fotoUrl: fotoPerfil(staff),
            }}
          />
        </Card>

        <Card title="Contraseña" subtitle="Cámbiala cuando quieras">
          {esDueno ? <PasswordForm /> : <StaffPasswordForm />}
        </Card>

        <Card title="Pregunta de seguridad" subtitle="Para recuperar tu contraseña sin depender del correo">
          <PreguntaSeguridadForm actual={esDueno ? user.securityQuestion : staff.securityQuestion} />
        </Card>
      </div>
    </>
  );
}
