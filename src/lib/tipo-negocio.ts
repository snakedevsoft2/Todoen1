import type { BusinessType } from "@prisma/client";
import { db } from "./db";
import { BUSINESS_LABEL } from "./nav";

/**
 * Los tipos de negocio que se pueden elegir, y lo que trae cada uno al
 * empezar. Lo usan el registro y el cambio de tipo, para que los dos den
 * exactamente lo mismo.
 */

export const TIPOS_ELEGIBLES: BusinessType[] = [
  "BARBERIA",
  "RESTAURANTE",
  "COMIDAS_RAPIDAS",
  "ROPA",
  "CARTERA",
  "ASISTENCIA",
  "OTRO",
];

export function esTipoElegible(v: unknown): v is BusinessType {
  return TIPOS_ELEGIBLES.includes(v as BusinessType);
}

/** Cada tipo de negocio arranca con un color distinto. Se cambia en Personalizar. */
export const COLOR_POR_TIPO: Record<BusinessType, string> = {
  BARBERIA: "#4f46e5",
  RESTAURANTE: "#b91c1c",
  COMIDAS_RAPIDAS: "#ea580c",
  ROPA: "#0f766e",
  CARTERA: "#166534",
  ASISTENCIA: "#3730a3",
  OTRO: "#0369a1",
};

export const CATALOGO_POR_TIPO: Record<BusinessType, { name: string; price: number; durationMin: number; category: string }[]> = {
  BARBERIA: [
    { name: "Corte clasico", price: 20000, durationMin: 30, category: "Cortes" },
    { name: "Corte + barba", price: 30000, durationMin: 45, category: "Cortes" },
    { name: "Barba y perfilado", price: 15000, durationMin: 20, category: "Barba" },
    { name: "Cejas", price: 6000, durationMin: 15, category: "Extras" },
  ],
  RESTAURANTE: [
    { name: "Almuerzo del dia", price: 15000, durationMin: 0, category: "Platos" },
    { name: "Bandeja paisa", price: 28000, durationMin: 0, category: "Platos" },
    { name: "Gaseosa personal", price: 4000, durationMin: 0, category: "Bebidas" },
    { name: "Jugo natural", price: 6000, durationMin: 0, category: "Bebidas" },
  ],
  COMIDAS_RAPIDAS: [
    { name: "Hamburguesa sencilla", price: 14000, durationMin: 0, category: "Hamburguesas" },
    { name: "Perro caliente", price: 11000, durationMin: 0, category: "Perros" },
    { name: "Salchipapa", price: 13000, durationMin: 0, category: "Papas" },
    { name: "Gaseosa 400ml", price: 4000, durationMin: 0, category: "Bebidas" },
  ],
  ROPA: [
    { name: "Camiseta basica", price: 35000, durationMin: 0, category: "Camisetas" },
    { name: "Jean clasico", price: 89000, durationMin: 0, category: "Jeans" },
    { name: "Buzo con capota", price: 79000, durationMin: 0, category: "Buzos" },
    { name: "Vestido casual", price: 95000, durationMin: 0, category: "Vestidos" },
  ],
  // Quien presta plata no vende nada, asi que no hay catalogo que sembrar.
  // Dejarlo vacio es lo honesto: su trabajo empieza en Cuentas por cobrar.
  CARTERA: [],
  // Tampoco vende: administra personal. Empieza agregando a su gente.
  ASISTENCIA: [],
  // Aqui no podemos adivinar el oficio, asi que en vez de inventar productos
  // que no van a servirle a nadie, dejamos dos marcados como ejemplo para que
  // se vea de una que hay que cambiarlos.
  OTRO: [
    { name: "Mi primer producto (cambiame)", price: 10000, durationMin: 0, category: "General" },
    { name: "Mi primer servicio (cambiame)", price: 25000, durationMin: 30, category: "General" },
  ],
};

const PISTA_POR_TIPO: Record<BusinessType, string> = {
  BARBERIA: "Turnos, cortes y caja",
  RESTAURANTE: "Cuentas por mesa y caja",
  COMIDAS_RAPIDAS: "Venta al mostrador y caja",
  ROPA: "Inventario por talla y catálogo",
  CARTERA: "Préstamos por cuotas y cobros",
  ASISTENCIA: "Personal, marcaje con ubicación y reportes",
  OTRO: "Lo armas tú mismo",
};

/** Las opciones para el selector, ya con nombre y descripcion. */
export const OPCIONES_TIPO = TIPOS_ELEGIBLES.map((t) => ({ value: t, label: BUSINESS_LABEL[t], hint: PISTA_POR_TIPO[t] }));

/**
 * Cambia el tipo de negocio de una cuenta sin crear otra.
 *
 * Para quien se registro con el tipo equivocado. Lo que hace, todo junto o
 * nada:
 *   - cambia el tipo: el menu pasa a ser el del oficio nuevo;
 *   - borra la configuracion del menu de cada persona (tambien la guardada a
 *     la antigua en Staff), porque escondia y ordenaba apartados de otro
 *     oficio: arranca con lo de fabrica;
 *   - el equipo toma el rol del oficio nuevo (barbero o empleado). Usuarios y
 *     claves no se tocan;
 *   - el dueño vuelve a ver la bienvenida y la guia, para armar su menu;
 *   - si no tenia ningun producto, le deja los de ejemplo del oficio nuevo.
 *
 * No borra ningun dato: ventas, turnos, deudas o clientes que no apliquen al
 * tipo nuevo quedan guardados y reaparecen si vuelve al de antes.
 */
export async function cambiarTipoDeNegocio(
  userId: string,
  nuevo: string
): Promise<{ ok: true; cambio: boolean } | { ok: false; error: string }> {
  if (!esTipoElegible(nuevo)) return { ok: false, error: "Elige un tipo de negocio de la lista." };

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, businessType: true, _count: { select: { services: true } } },
  });
  if (!user) return { ok: false, error: "No encontramos esa cuenta." };
  if (user.businessType === nuevo) return { ok: true, cambio: false };

  const rolDelEquipo = nuevo === "BARBERIA" ? "BARBERO" : "VENDEDOR";
  const catalogo = user._count.services === 0 ? CATALOGO_POR_TIPO[nuevo] : [];

  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { businessType: nuevo } }),
    db.workspaceConfig.deleteMany({ where: { userId } }),
    db.staff.updateMany({ where: { userId }, data: { navHidden: null, navOrder: null } }),
    db.staff.updateMany({ where: { userId, role: { not: "DUENO" } }, data: { role: rolDelEquipo } }),
    db.staff.updateMany({
      where: { userId, role: "DUENO" },
      data: { onboardingDoneAt: null, onboardingStep: 0, tourDoneAt: null },
    }),
    ...(catalogo.length > 0
      ? [
          db.service.createMany({
            data: catalogo.map((s) => ({
              userId,
              name: s.name,
              price: s.price,
              durationMin: s.durationMin || 30,
              category: s.category,
              bookable: nuevo === "BARBERIA",
              trackStock: nuevo === "ROPA",
            })),
          }),
        ]
      : []),
  ]);

  return { ok: true, cambio: true };
}
