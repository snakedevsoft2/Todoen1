import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { Staff, User } from "@prisma/client";
import { db } from "./db";
import { suspenderSiVencio } from "./pagos";
import { readSession } from "./session";
import { esEmpleadoDeAsistencia, esLavadorDeLavadero } from "./permisos";

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
export async function getCurrentUser(): Promise<User | null> {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

/**
 * Usuario obligatorio. Todas las consultas del panel filtran por este id,
 * asi que un usuario nunca puede leer ni editar datos de otro negocio.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  // Pasa por /salir y no derecho al login: si la cookie sigue firmada pero la
  // sesion ya no sirve, hay que borrarla o el middleware la devuelve al panel
  // y se arma un rebote infinito.
  if (!user) redirect("/salir");
  return user;
}

/**
 * Quien entro y a que negocio pertenece.
 *
 * `user` es SIEMPRE el dueno del negocio: todas las consultas siguen filtrando
 * por `user.id`, asi que un negocio nunca alcanza los datos de otro.
 * `staff` es la persona concreta que entro (el dueno o uno de los barberos).
 */
export type Session = { user: User; staff: Staff };

/** El dueno tambien es una persona que atiende, para poder medirlo. */
export async function ensureOwnerStaff(user: User): Promise<Staff> {
  const found = await db.staff.findFirst({
    where: { userId: user.id, role: "DUENO" },
    orderBy: { createdAt: "asc" },
  });
  if (found) return found;
  return db.staff.create({
    data: {
      userId: user.id,
      name: user.ownerName,
      role: "DUENO",
      color: user.brandColor,
    },
  });
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
async function marcarActividad(staff: Staff) {
  const corte = Date.now() - MINUTOS_ENTRE_ANOTACIONES * 60 * 1000;
  if (staff.lastSeenAt && staff.lastSeenAt.getTime() > corte) return;
  try {
    await db.staff.update({ where: { id: staff.id }, data: { lastSeenAt: new Date() } });
  } catch {
    // a proposito en silencio
  }
}

/** Sesion completa (negocio + persona) o null. No redirige. */
export async function getCurrentSession(): Promise<Session | null> {
  const session = await readSession();
  if (!session) return null;
  const user = await db.user.findUnique({ where: { id: session.uid } });
  if (!user) return null;

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
  const staff = await db.staff.findFirst({
    where: { id: session.sid, userId: user.id, active: true },
  });
  if (!staff) return null;

  // Misma idea que con el dueno, pero con la clave propia del empleado.
  if (session.sv !== undefined && session.sv !== staff.sessionVersion) return null;

  // Al empleado que le quitaron el usuario (y no tiene correo) se le cierra la sesion.
  if (staff.role !== "DUENO" && !staff.username && !staff.email) return null;

  await marcarActividad(staff);
  return { user, staff };
}

/**
 * Sesion obligatoria. Si no hay, manda al login.
 *
 * El menu del empleado de asistencia ya lo bloquea por pantalla
 * (panel/layout.tsx), pero eso no alcanza: una Server Action se puede invocar
 * directo sin pasar por esa pantalla. Por defecto esta funcion repite el
 * mismo bloqueo aqui, para que "solo puede ver 5 pantallas" tambien valga
 * para lo que esas pantallas pueden mandar a guardar. Las acciones que SI son
 * parte de esas 5 pantallas (marcar, novedades, informes, escaner, perfil, y
 * lo que es de la persona y no del negocio, como su propia clave) llaman
 * requireSession({ asistenciaOk: true }) para no quedar bloqueadas tambien.
 *
 * Mismo bloqueo, con el mismo motivo, para el lavador del lavadero: sus
 * pantallas son Mis lavados, Marcar y Perfil, y llama
 * requireSession({ lavadorOk: true }) desde las que sí son suyas.
 */
export async function requireSession(opts?: { asistenciaOk?: boolean; lavadorOk?: boolean }): Promise<Session> {
  const session = await getCurrentSession();
  if (!session) redirect("/salir");
  if (!opts?.asistenciaOk && esEmpleadoDeAsistencia(session.user, session.staff)) {
    redirect("/panel/marcar");
  }
  if (!opts?.lavadorOk && esLavadorDeLavadero(session.user, session.staff)) {
    redirect("/panel/mis-lavados");
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
