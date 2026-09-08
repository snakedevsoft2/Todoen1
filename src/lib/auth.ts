import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
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

/** Usuario de la sesion o null. No redirige. */
export async function getCurrentUser(): Promise<User | null> {
  const session = await readSession();
  if (!session) return null;
  const user = await db.user.findUnique({ where: { id: session.uid } });
  return user ?? null;
}

/**
 * Usuario obligatorio. Todas las consultas del panel filtran por este id,
 * asi que un usuario nunca puede leer ni editar datos de otro negocio.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
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
