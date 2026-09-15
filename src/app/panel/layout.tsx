import { headers } from "next/headers";
import { after } from "next/server";
import { enviarProgramados } from "@/lib/envios-crm";
import { aiEnabled } from "@/lib/ai";
import { SUGERENCIAS_IA } from "@/lib/sugerencias-ia";
import { AsistenteFlotante } from "@/components/AsistenteFlotante";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { BUSINESS_LABEL, logoUrl, publicPath } from "@/lib/nav";
import { menuDe, modulosDe } from "@/lib/modules";
import { etiquetaDeRol, fotoPerfil } from "@/lib/staff";
import {
  MENU_EMPLEADO_ASISTENCIA,
  esEmpleadoDeAsistencia,
  rutaDeEmpleadoAsistencia,
  tienePaginaPublica,
} from "@/lib/permisos";
import { Shell } from "@/components/Shell";
import { Icon } from "@/components/Icon";
import { logoutAction } from "@/actions/auth";
import { ThemeStyle } from "@/components/ThemeStyle";
import { RegistrarVisita } from "@/components/RegistrarVisita";
import { PrepararSinConexion } from "@/components/PrepararSinConexion";
import { AvisoSinConexion } from "@/components/AvisoSinConexion";
import { AvisoDePago } from "@/components/AvisoDePago";
import { correoDeLaSesion, esAdmin } from "@/lib/admin";
import { ProveedorSinSenal } from "@/components/SinSenal";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const sesion = await requireSession();
  const { user, staff } = sesion;

  // El empleado del gestor de asistencia solo tiene sus cuatro pantallas. Si
  // escribe otra direccion a mano, vuelve a Marcar.
  const empleado = esEmpleadoDeAsistencia(user, staff);
  if (empleado) {
    const ruta = (await headers()).get("x-ruta") ?? "";
    if (ruta && !rutaDeEmpleadoAsistencia(ruta)) redirect("/panel/marcar");
  }

  // El menu sale del catalogo en base de datos, filtrado por el oficio, por el
  // rol y por lo que esta persona decidio ver.
  const modulos = empleado ? [] : await modulosDe(sesion);

  // Direccion -> llave, para que el navegador solo tenga que mandar la llave
  // del apartado y nunca decida el nombre de lo que se anota.
  const rutas = Object.fromEntries(modulos.map((m) => [m.href, m.key]));

  const nav = empleado ? MENU_EMPLEADO_ASISTENCIA : menuDe(modulos);
  const logo = logoUrl(user.slug, user.logo, user.updatedAt);
  const foto = fotoPerfil(staff);

  // Las pantallas del menu quedan guardadas en el telefono para usarlas sin senal.
  const paginasSinConexion = Array.from(new Set(["/panel", ...nav.map((i) => i.href)])).filter(
    (h) => h === "/panel" || h.startsWith("/panel/")
  );

  const logout = (
    <form action={logoutAction}>
      <button type="submit" className="btn-ghost btn-sm w-full justify-start">
        <Icon name="logout" className="h-4 w-4" />
        Cerrar sesión
      </button>
    </form>
  );

  const conPagina = tienePaginaPublica(user.businessType) && !empleado;

  // Los mensajes programados que ya llegaron a su hora salen cuando alguien usa
  // el panel, sin esperar al envio diario. Corre despues de responder: la
  // pagina no espera a WhatsApp ni al correo.
  after(() => enviarProgramados({ userId: user.id, limite: 20 }).then(() => undefined, () => undefined));

  return (
    <>
      <ThemeStyle brandColor={user.brandColor} theme={user.theme} />
      <RegistrarVisita rutas={rutas} />
      <PrepararSinConexion
        cuenta={staff.id}
        paginas={paginasSinConexion}
        archivos={[logo, foto].filter((x): x is string => Boolean(x))}
      />
      <Shell
        nav={nav}
        businessName={user.businessName}
        businessLabel={BUSINESS_LABEL[user.businessType]}
        ownerName={staff.name}
        roleLabel={etiquetaDeRol(staff.role, user.businessType)}
        staffColor={staff.color}
        fotoPerfil={foto}
        menuPropio={!empleado}
        logo={logo}
        bookingUrl={conPagina ? publicPath(user.businessType, user.slug) : undefined}
        bookingLabel="Ver mi portafolio"
        admin={esAdmin(correoDeLaSesion(sesion))}
        logout={logout}
      >
        <AvisoSinConexion />
        {/* Solo al dueño: es quien puede renovar el plan. */}
        {!empleado && staff.role === "DUENO" && <AvisoDePago paidUntil={user.paidUntil} businessName={user.businessName} />}
        <ProveedorSinSenal cuenta={staff.id}>{children}</ProveedorSinSenal>
      </Shell>
      {/* La IA Snake flotante: solo si el servidor tiene la clave del modelo, y
          no para el empleado del gestor, que solo tiene sus pantallas. */}
      {aiEnabled() && !empleado && <AsistenteFlotante sugerencias={SUGERENCIAS_IA[user.businessType]} />}
    </>
  );
}
