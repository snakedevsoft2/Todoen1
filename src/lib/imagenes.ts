import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Saber que filas tienen foto, sin traerse las fotos.
 *
 * Las imagenes se guardan como data URL dentro de una columna de texto. Una
 * foto de producto achicada pesa entre 30 y 150 KB, asi que una pantalla de
 * catalogo con cien productos movia varios megas desde la base de datos en
 * cada visita... para terminar botando todos esos bytes, porque lo unico que
 * se hace con ellos es preguntar "hay foto?" y devolver la direccion
 * /foto/[id] (ver photoUrl en lib/nav.ts). El navegador nunca recibe el base64
 * por esta via: lo pide aparte, ya cacheado por la version.
 *
 * Esto lo resuelve con una segunda consulta que pide solo los ids de las filas
 * que si tienen foto. Se corre en paralelo con la consulta principal, asi que
 * no agrega espera, y mueve unos pocos bytes por fila en vez de la imagen
 * entera.
 *
 * Se hace asi y no con una columna "tieneFoto" guardada a proposito: una
 * bandera hay que acordarse de actualizarla en cada sitio que escriba la
 * imagen, y el dia que a alguien se le olvide, la foto desaparece de la
 * pantalla sin que nada avise. Esto no se puede desincronizar porque le
 * pregunta a la misma columna.
 *
 * El `where` tiene que ser el mismo de la consulta principal (o uno mas
 * amplio); si fuera mas angosto, a algunas filas les faltaria la foto.
 */
export async function serviciosConFoto(where: Prisma.ServiceWhereInput): Promise<Set<string>> {
  const filas = await db.service.findMany({
    where: { ...where, image: { not: null } },
    select: { id: true },
  });
  return new Set(filas.map((f) => f.id));
}

/** Lo mismo para el logo de un negocio: solo si lo tiene, no cual es. */
export async function negocioTieneLogo(userId: string): Promise<boolean> {
  const fila = await db.user.findFirst({
    where: { id: userId, logo: { not: null } },
    select: { id: true },
  });
  return fila !== null;
}

/** Y para la foto de perfil de una persona del equipo. */
export async function personaTieneFoto(staffId: string): Promise<boolean> {
  const fila = await db.staff.findFirst({
    where: { id: staffId, photo: { not: null } },
    select: { id: true },
  });
  return fila !== null;
}

/** Y para la portada del portafolio, que es la imagen mas grande de todas. */
export async function negocioTienePortada(userId: string): Promise<boolean> {
  const fila = await db.user.findFirst({
    where: { id: userId, publicCover: { not: null } },
    select: { id: true },
  });
  return fila !== null;
}
