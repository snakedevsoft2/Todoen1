import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { Staff, User } from "@prisma/client";
import { db } from "./db";
import { readSession } from "./session";

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

  await marcarActividad(staff);
  return { user, staff };
}

/** Sesion obligatoria. Si no hay, manda al login. */
export async function requireSession(): Promise<Session> {
  const session = await getCurrentSession();
  if (!session) redirect("/salir");
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
