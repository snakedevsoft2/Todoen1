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
  MENU_LAVADOR,
  esEmpleadoDeAsistencia,
  esLavadorDeLavadero,
  rutaDeEmpleadoAsistencia,
  rutaDeLavador,
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
import { SinPlanCompleto } from "@/components/SinPlanCompleto";
import { InstalarApp } from "@/components/InstalarApp";
import { enlaceActivarPlan, puedeInstalar } from "@/lib/plan";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  // El bloqueo por ruta exacta de cada menu fijo (empleado de asistencia,
  // lavador) lo hace este layout mismo, unas lineas mas abajo, mirando la
  // direccion real que se pidio. Si requireSession() hiciera tambien su propio
  // redirect a ciegas aqui, redirigiria incluso estando ya en esa pantalla
  // (p.ej. /panel/mis-lavados a /panel/mis-lavados), armando un ciclo que el
  // navegador termina mostrando en blanco.
  const sesion = await requireSession({ asistenciaOk: true, lavadorOk: true });
  const { user, staff } = sesion;

  // El empleado del gestor de asistencia solo tiene sus cuatro pantallas. Si
  // escribe otra direccion a mano, vuelve a Marcar.
  const empleado = esEmpleadoDeAsistencia(user, staff);
  if (empleado) {
    const ruta = (await headers()).get("x-ruta") ?? "";
    if (ruta && !rutaDeEmpleadoAsistencia(ruta)) redirect("/panel/marcar");
  }

  // El lavador del lavadero tampoco ve el negocio completo: solo sus
  // vehiculos asignados, marcar y su perfil.
  const lavador = esLavadorDeLavadero(user, staff);
  if (lavador) {
    const ruta = (await headers()).get("x-ruta") ?? "";
    if (ruta && !rutaDeLavador(ruta)) redirect("/panel/mis-lavados");
  }

  // El menu sale del catalogo en base de datos, filtrado por el oficio, por el
  // rol y por lo que esta persona decidio ver.
  const modulos = empleado || lavador ? [] : await modulosDe(sesion);

  // Direccion -> llave, para que el navegador solo tenga que mandar la llave
  // del apartado y nunca decida el nombre de lo que se anota.
  const rutas = Object.fromEntries(modulos.map((m) => [m.href, m.key]));

  const nav = empleado ? MENU_EMPLEADO_ASISTENCIA : lavador ? MENU_LAVADOR : menuDe(modulos);
  const logo = logoUrl(user.slug, user.logo, user.updatedAt);
  const foto = fotoPerfil(staff);

  // Solo la cuenta que pago instala la aplicacion y la usa sin senal (ver lib/plan.ts).
  const instalable = puedeInstalar(user);

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

  const conPagina = tienePaginaPublica(user.businessType) && !empleado && !lavador;

  // Los mensajes programados que ya llegaron a su hora salen cuando alguien usa
  // el panel, sin esperar al envio diario. Corre despues de responder: la
  // pagina no espera a WhatsApp ni al correo.
  after(() => enviarProgramados({ userId: user.id, limite: 20 }).then(() => undefined, () => undefined));

  return (
    <>
      <ThemeStyle brandColor={user.brandColor} theme={user.theme} />
      <RegistrarVisita rutas={rutas} />
      {instalable ? (
        <>
          {/* Sin este enlace el navegador no ofrece instalar la aplicacion. */}
          <link rel="manifest" href="/manifest.webmanifest" />
          {/* En iPhone se instala con Compartir y "Agregar a inicio": esto hace que abra como aplicacion. */}
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-title" content="Todoen1" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
          <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
          <PrepararSinConexion
            cuenta={staff.id}
            paginas={paginasSinConexion}
            archivos={[logo, foto].filter((x): x is string => Boolean(x))}
          />
        </>
      ) : (
        <SinPlanCompleto enlace={enlaceActivarPlan(user.businessName)} />
      )}
      <Shell
        nav={nav}
        businessName={user.businessName}
        businessLabel={BUSINESS_LABEL[user.businessType]}
        ownerName={staff.name}
        roleLabel={etiquetaDeRol(staff.role, user.businessType)}
        staffColor={staff.color}
        fotoPerfil={foto}
        menuPropio={staff.role === "DUENO"}
        instalar={instalable}
        logo={logo}
        bookingUrl={conPagina ? publicPath(user.businessType, user.slug) : undefined}
        bookingLabel="Ver mi portafolio"
        compartir={conPagina ? { ruta: publicPath(user.businessType, user.slug), qr: "/qr/" + user.slug, negocio: user.businessName } : undefined}
        admin={esAdmin(correoDeLaSesion(sesion))}
        logout={logout}
      >
        <AvisoSinConexion />
        {/* Solo al dueño: es quien puede renovar el plan. */}
        {!empleado && staff.role === "DUENO" && <AvisoDePago paidUntil={user.paidUntil} trialEndsAt={user.trialEndsAt} businessName={user.businessName} />}
        {instalable && <InstalarApp variante="aviso" />}
        <ProveedorSinSenal cuenta={staff.id} sinConexion={instalable} role={staff.role}>{children}</ProveedorSinSenal>
      </Shell>
      {/* La IA Snake flotante: solo si el servidor tiene la clave del modelo, y
          no para el empleado del gestor, que solo tiene sus pantallas. */}
      {aiEnabled() && !empleado && <AsistenteFlotante sugerencias={SUGERENCIAS_IA[user.businessType]} />}
    </>
  );
}
