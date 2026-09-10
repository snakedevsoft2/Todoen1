import { requireSession } from "@/lib/auth";
import { BUSINESS_LABEL, logoUrl, publicPath } from "@/lib/nav";
import { menuDe, modulosDe } from "@/lib/modules";
import { ROLE_LABEL } from "@/lib/staff";
import { Shell } from "@/components/Shell";
import { Icon } from "@/components/Icon";
import { logoutAction } from "@/actions/auth";
import { ThemeStyle } from "@/components/ThemeStyle";
import { RegistrarVisita } from "@/components/RegistrarVisita";
import { correoDeLaSesion, esAdmin } from "@/lib/admin";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const sesion = await requireSession();
  const { user, staff } = sesion;

  // El menu sale del catalogo en base de datos, filtrado por el oficio, por el
  // rol y por lo que esta persona decidio ver.
  const modulos = await modulosDe(sesion);

  // Direccion -> llave, para que el navegador solo tenga que mandar la llave
  // del apartado y nunca decida el nombre de lo que se anota.
  const rutas = Object.fromEntries(modulos.map((m) => [m.href, m.key]));

  const logout = (
    <form action={logoutAction}>
      <button type="submit" className="btn-ghost btn-sm w-full justify-start">
        <Icon name="logout" className="h-4 w-4" />
        Cerrar sesion
      </button>
    </form>
  );

  return (
    <>
      <ThemeStyle brandColor={user.brandColor} theme={user.theme} />
      <RegistrarVisita rutas={rutas} />
      <Shell
        nav={menuDe(modulos)}
        businessName={user.businessName}
        businessLabel={BUSINESS_LABEL[user.businessType]}
        ownerName={staff.name}
        roleLabel={ROLE_LABEL[staff.role] ?? "Barbero"}
        staffColor={staff.color}
        logo={logoUrl(user.slug, user.logo, user.updatedAt)}
        bookingUrl={publicPath(user.businessType, user.slug)}
        bookingLabel="Ver mi portafolio"
        admin={esAdmin(correoDeLaSesion(sesion))}
        logout={logout}
      >
        {children}
      </Shell>
    </>
  );
}
