"use server";

import { redirect } from "next/navigation";
import type { BusinessType } from "@prisma/client";
import { db } from "@/lib/db";
import { checkPassword, ensureOwnerStaff, hashPassword, uniqueSlug } from "@/lib/auth";
import { clearSessionCookie, cookieJar, signSession, writeSessionCookie } from "@/lib/session";
import { SUPPORT_WHATSAPP_PRETTY } from "@/lib/support";

export type AuthState = { error?: string } | undefined;

const VALID_TYPES: BusinessType[] = [
  "BARBERIA",
  "RESTAURANTE",
  "COMIDAS_RAPIDAS",
  "ROPA",
  "OTRO",
];

/**
 * Lo que se le dice a una cuenta suspendida.
 *
 * Se le da el telefono de soporte a proposito: quien queda por fuera tiene que
 * saber a quien reclamar, o solo va a pensar que la aplicacion se dano.
 */
const CUENTA_SUSPENDIDA =
  "Tu cuenta esta suspendida. Escribenos al " + SUPPORT_WHATSAPP_PRETTY + " para reactivarla.";

/** Cada tipo de negocio arranca con un color distinto. Se cambia en Personalizar. */
const DEFAULT_BRAND: Record<BusinessType, string> = {
  BARBERIA: "#4f46e5",
  RESTAURANTE: "#b91c1c",
  COMIDAS_RAPIDAS: "#ea580c",
  ROPA: "#0f766e",
  OTRO: "#0369a1",
};

const DEFAULT_CATALOG: Record<BusinessType, { name: string; price: number; durationMin: number; category: string }[]> = {
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
  // Aqui no podemos adivinar el oficio, asi que en vez de inventar productos
  // que no van a servirle a nadie, dejamos dos marcados como ejemplo para que
  // se vea de una que hay que cambiarlos.
  OTRO: [
    { name: "Mi primer producto (cambiame)", price: 10000, durationMin: 0, category: "General" },
    { name: "Mi primer servicio (cambiame)", price: 25000, durationMin: 30, category: "General" },
  ],
};

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  // Pedimos el almacen de cookies antes de tocar la base de datos.
  const jar = await cookieJar();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const ownerName = String(formData.get("ownerName") ?? "").trim();
  const businessName = String(formData.get("businessName") ?? "").trim();
  const businessType = String(formData.get("businessType") ?? "") as BusinessType;
  const phone = String(formData.get("phone") ?? "").trim();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Escribe un correo valido." };
  if (password.length < 6) return { error: "La contrasena debe tener al menos 6 caracteres." };
  if (!ownerName) return { error: "Escribe tu nombre." };
  if (!businessName) return { error: "Escribe el nombre del negocio." };
  if (!VALID_TYPES.includes(businessType)) return { error: "Elige el tipo de negocio." };

  const exists = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) return { error: "Ya existe una cuenta con ese correo." };

  const slug = await uniqueSlug(businessName);
  const user = await db.user.create({
    data: {
      email,
      passwordHash: hashPassword(password),
      ownerName,
      businessName,
      businessType,
      phone: phone || null,
      slug,
      brandColor: DEFAULT_BRAND[businessType],
      // El dueno queda registrado como la primera persona que atiende.
      staff: {
        create: {
          name: ownerName,
          role: "DUENO",
          color: DEFAULT_BRAND[businessType],
          phone: phone || null,
        },
      },
      services: {
        create: DEFAULT_CATALOG[businessType].map((s) => ({
          name: s.name,
          price: s.price,
          durationMin: s.durationMin || 30,
          category: s.category,
          bookable: businessType === "BARBERIA",
          // La ropa se vende por talla y descuenta inventario.
          trackStock: businessType === "ROPA",
        })),
      },
    },
    include: { staff: true },
  });

  writeSessionCookie(
    jar,
    await signSession({
      uid: user.id,
      email: user.email,
      type: user.businessType,
      sid: user.staff[0]?.id,
      role: "DUENO",
    })
  );
  redirect("/panel");
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const jar = await cookieJar();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  // Sin "Recordarme" la cookie muere al cerrar el navegador: es lo que se
  // espera en el computador del local, donde entra mas de una persona.
  const remember = formData.get("remember") === "on";
  if (!email || !password) return { error: "Escribe tu correo y contrasena." };

  const user = await db.user.findUnique({ where: { email } });

  // 1. El dueno del negocio.
  if (user) {
    if (!checkPassword(password, user.passwordHash)) {
      return { error: "Correo o contrasena incorrectos." };
    }
    // La cuenta suspendida se avisa despues de comprobar la contrasena, no
    // antes: si no, cualquiera podria averiguar que correos existen.
    if (user.suspendedAt) return { error: CUENTA_SUSPENDIDA };
    const owner = await ensureOwnerStaff(user);
    writeSessionCookie(
      jar,
      await signSession({
        uid: user.id,
        email: user.email,
        type: user.businessType,
        sid: owner.id,
        role: owner.role,
      }),
      remember
    );
    redirect("/panel");
  }

  // 2. Un barbero con usuario propio dentro de un negocio.
  const staff = await db.staff.findUnique({ where: { email }, include: { user: true } });
  if (!staff || !staff.passwordHash || !checkPassword(password, staff.passwordHash)) {
    return { error: "Correo o contrasena incorrectos." };
  }
  if (!staff.active) {
    return { error: "Tu usuario esta desactivado. Pidele al dueno que lo active." };
  }
  if (staff.user.suspendedAt) return { error: CUENTA_SUSPENDIDA };

  writeSessionCookie(
    jar,
    await signSession({
      uid: staff.userId,
      email,
      type: staff.user.businessType,
      sid: staff.id,
      role: staff.role,
    }),
    remember
  );
  redirect("/panel");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
