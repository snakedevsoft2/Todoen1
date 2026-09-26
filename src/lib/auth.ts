import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import type { Staff, User } from "@prisma/client";
import { db } from "./db";
import { negocioTieneLogo, personaTieneFoto } from "./imagenes";
import { suspenderSiVencio } from "./pagos";
import { readSession } from "./session";
import {
  esEmpleadoDeAsistencia,
  esLavadorDeLavadero,
  rutaDeEmpleadoAsistencia,
  rutaDeLavador,
} from "./permisos";

/**
 * Usamos la version sincronica de bcrypt a proposito.
 * La version asincronica corta el contexto de la peticion en Next 15, y despues
 * de compararla ya no se puede escribir la cookie de sesion.
 */
export function hashPassword(plain: string) {
  return bcrypt.hashSync(plain, 10);
}

export function checkPassword(plain: string, hash: string) {
  return bcrypt.compareSync(plain, hash);
}

/**
 * Negocio de la sesion o null. No redirige.
 *
 * Pasa por getCurrentSession a proposito: asi un barbero desactivado pierde el
 * acceso en todas las paginas, no solo en las que miran su rol.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

/**
 * Usuario obligatorio. Todas las consultas del panel filtran por este id,
 * asi que un usuario nunca puede leer ni editar datos de otro negocio.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  // Pasa por /salir y no derecho al login: si la cookie sigue firmada pero la
  // sesion ya no sirve, hay que borrarla o el middleware la devuelve al panel
  // y se arma un rebote infinito.
  if (!user) redirect("/salir");
  return user;
}

/**
 * El negocio tal como lo ve el panel.
 *
 * Sin las dos columnas de imagen: `logo` y `publicCover` son data URL de
 * decenas o cientos de KB, y esta fila se lee en TODAS las peticiones. Lo
 * unico que el panel necesita saber es si hay logo (`hasLogo`), para armar la
 * direccion /logo/[slug]; los bytes los pide el navegador por su cuenta y los
 * cachea. Las dos pantallas que si editan la imagen (personalizar y
 * portafolio) la piden aparte, que es una sola pantalla y no todas.
 */
export type NegocioSinImagenes = Omit<User, "logo" | "publicCover">;
export type SessionUser = NegocioSinImagenes & { hasLogo: boolean };

/**
 * La persona que entro.
 *
 * La sesion de verdad la trae SIN la foto de perfil, por la misma razon que el
 * negocio va sin logo: la foto es un data URL y esta fila se lee en TODAS las
 * peticiones. Se sirve por /foto-perfil/[id], que el navegador cachea, y aqui
 * solo viaja `hasPhoto`.
 *
 * Los dos campos son opcionales porque tambien vale una fila completa de la
 * base (es lo que arman las pruebas). Para saber si hay foto no se mira
 * ninguno de los dos a mano: se llama `fotoPerfil()` de lib/staff.ts, que
 * entiende las dos formas.
 */
export type SessionStaff = Omit<Staff, "photo"> & {
  hasPhoto?: boolean;
  photo?: string | null;
};

/**
 * Quien entro y a que negocio pertenece.
 *
 * `user` es SIEMPRE el dueno del negocio: todas las consultas siguen filtrando
 * por `user.id`, asi que un negocio nunca alcanza los datos de otro.
 * `staff` es la persona concreta que entro (el dueno o uno de los barberos).
 */
export type Session = { user: SessionUser; staff: SessionStaff };

/** El dueno tambien es una persona que atiende, para poder medirlo. */
export async function ensureOwnerStaff(user: NegocioSinImagenes): Promise<SessionStaff> {
  const found = await db.staff.findFirst({
    where: { userId: user.id, role: "DUENO" },
    orderBy: { createdAt: "asc" },
    omit: { photo: true },
  });
  if (found) return { ...found, hasPhoto: await personaTieneFoto(found.id) };
  const creado = await db.staff.create({
    data: {
      userId: user.id,
      name: user.ownerName,
      role: "DUENO",
      color: user.brandColor,
    },
    omit: { photo: true },
  });
  // Recien creado: todavia no puede tener foto.
  return { ...creado, hasPhoto: false };
}

/**
 * Cada cuanto se vuelve a anotar que alguien sigue por ahi.
 *
 * Sin esto habria una escritura en cada pantalla que alguien abre. Con cinco
 * minutos alcanza de sobra para saber quien esta usando la aplicacion, que es
 * lo unico para lo que sirve el dato.
 */
const MINUTOS_ENTRE_ANOTACIONES = 5;

/**
 * Deja anotado que esta persona sigue activa.
 *
 * Si falla no importa: no vale la pena tumbar una pagina por no poder anotar
 * una marca de tiempo.
 */
async function marcarActividad(staff: SessionStaff) {
  const corte = Date.now() - MINUTOS_ENTRE_ANOTACIONES * 60 * 1000;
  if (staff.lastSeenAt && staff.lastSeenAt.getTime() > corte) return;
  try {
    await db.staff.update({ where: { id: staff.id }, data: { lastSeenAt: new Date() } });
  } catch {
    // a proposito en silencio
  }
}

/**
 * Sesion completa (negocio + persona) o null. No redirige.
 *
 * Envuelta en cache() de React: layout.tsx y cada page.tsx llaman a esto por
 * su cuenta, y sin esto cada uno repetia la misma consulta completa del
 * negocio (con el logo, que pesa) en una sola peticion. Con cache() la
 * consulta corre una sola vez por peticion sin importar cuantas veces se
 * llame esta funcion.
 */
export const getCurrentSession = cache(async (): Promise<Session | null> => {
  const session = await readSession();
  if (!session) return null;

  // Las dos consultas van juntas porque ninguna depende de la otra: la de
  // presencia del logo no agrega espera, solo evita arrastrar el data URL.
  const [fila, hasLogo] = await Promise.all([
    db.user.findUnique({
      where: { id: session.uid },
      omit: { logo: true, publicCover: true },
    }),
    negocioTieneLogo(session.uid),
  ]);
  if (!fila) return null;
  const user: SessionUser = { ...fila, hasLogo };

  // Cuenta suspendida por la plataforma: la sesion deja de valer en la
  // siguiente peticion, sin tener que esperar a que la cookie caduque.
  if (user.suspendedAt) return null;

  // Pago vencido y sin dias de gracia: se suspende aqui mismo, sin esperar al
  // envio diario.
  if (await suspenderSiVencio(user)) return null;

  // La cookie trae la version que tenia la clave del negocio al firmarse. Si
  // el dueno cambio su contrasena despues (desde este u otro aparato), todas
  // las cookies viejas quedan invalidas de una, sin esperar a que caduquen
  // solas. Sesiones firmadas antes de este campo (uv vacio) no se tocan.
  if (session.uv !== undefined && session.uv !== user.sessionVersion) return null;

  // Sesiones viejas (antes del equipo) no traen sid: eran del dueno.
  if (!session.sid) {
    const dueno = await ensureOwnerStaff(user);
    await marcarActividad(dueno);
    return { user, staff: dueno };
  }

  // Si el barbero fue borrado o desactivado, la sesion deja de valer.
  // Nunca caemos al dueno aqui: seria darle permisos que no tiene.
  const [filaStaff, hasPhoto] = await Promise.all([
    db.staff.findFirst({
      where: { id: session.sid, userId: user.id, active: true },
      omit: { photo: true },
    }),
    personaTieneFoto(session.sid),
  ]);
  if (!filaStaff) return null;
  const staff: SessionStaff = { ...filaStaff, hasPhoto };

  // Misma idea que con el dueno, pero con la clave propia del empleado.
  if (session.sv !== undefined && session.sv !== staff.sessionVersion) return null;

  // Al empleado que le quitaron el usuario (y no tiene correo) se le cierra la sesion.
  if (staff.role !== "DUENO" && !staff.username && !staff.email) return null;

  await marcarActividad(staff);
  return { user, staff };
});

/**
 * Sesion obligatoria. Si no hay, manda al login.
 *
 * El empleado de asistencia y el lavador tienen un menu fijo de pocas
 * pantallas (ver lib/permisos.ts). El middleware deja la direccion real
 * pedida en la cabecera x-ruta para cada GET, asi que aqui se compara contra
 * esa lista con precision: una pantalla que si es suya no se redirige (ni
 * siquiera a si misma), y una que no lo es manda a su pantalla fija.
 *
 * Una Server Action (POST) no trae esa cabecera -el middleware solo la pone
 * para GET-, asi que ahi manda lo que la propia accion diga a mano: las que
 * SI son parte de esas pantallas (marcar, novedades, informes, escaner,
 * perfil, y lo que es de la persona y no del negocio, como su propia clave)
 * llaman requireSession({ asistenciaOk: true }) o { lavadorOk: true }.
 *
 * Ojo con esto al agregar una pantalla nueva al menu fijo: si su Server
 * Action no avisa con el opt correspondiente, se comporta como si esa
 * pantalla no fuera suya. Antes esto tambien pasaba en GET (cada pantalla
 * tenia que acordarse de avisar), y una que se le olvido armo un redirect a
 * si misma sin fin -por eso ahora el caso de GET ya no depende de acordarse.
 */
export async function requireSession(opts?: { asistenciaOk?: boolean; lavadorOk?: boolean }): Promise<Session> {
  const session = await getCurrentSession();
  if (!session) redirect("/salir");

  const ruta = (await headers()).get("x-ruta");

  if (esEmpleadoDeAsistencia(session.user, session.staff)) {
    const permitido = ruta ? rutaDeEmpleadoAsistencia(ruta) : Boolean(opts?.asistenciaOk);
    if (!permitido) redirect("/panel/marcar");
  }
  if (esLavadorDeLavadero(session.user, session.staff)) {
    const permitido = ruta ? rutaDeLavador(ruta) : Boolean(opts?.lavadorOk);
    if (!permitido) redirect("/panel/mis-lavados");
  }
  return session;
}

/** Solo el dueno. Un barbero que intente entrar vuelve al resumen. */
export async function requireOwner(): Promise<Session> {
  const session = await requireSession();
  if (session.staff.role !== "DUENO") redirect("/panel");
  return session;
}

export function isOwner(staff: { role: string } | null | undefined) {
  return staff?.role === "DUENO";
}

export function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function uniqueSlug(base: string) {
  const root = slugify(base) || "negocio";
  let candidate = root;
  let i = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await db.user.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!exists) return candidate;
    i += 1;
    candidate = `${root}-${i}`;
  }
}
