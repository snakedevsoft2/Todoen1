"use server";

import { redirect } from "next/navigation";
import type { BusinessType } from "@prisma/client";
import { db } from "@/lib/db";
import { checkPassword, ensureOwnerStaff, hashPassword, uniqueSlug } from "@/lib/auth";
import { clearSessionCookie, cookieJar, signSession, writeSessionCookie } from "@/lib/session";
import { SUPPORT_WHATSAPP_PRETTY } from "@/lib/support";
import { suspenderSiVencio } from "@/lib/pagos";
import { CATALOGO_POR_TIPO, COLOR_POR_TIPO, esTipoElegible } from "@/lib/tipo-negocio";
import { finDePrueba } from "@/lib/plan";

export type AuthState = { error?: string } | undefined;

/**
 * Lo que se le dice a una cuenta suspendida.
 *
 * Se le da el telefono de soporte a proposito: quien queda por fuera tiene que
 * saber a quien reclamar, o solo va a pensar que la aplicacion se dano.
 */
const CUENTA_SUSPENDIDA =
  "Tu cuenta esta suspendida. Escribenos al " + SUPPORT_WHATSAPP_PRETTY + " para reactivarla.";

/** Cuando la suspension fue por el pago, se dice eso: el cliente sabe que hacer. */
const CUENTA_VENCIDA =
  "Tu cuenta esta suspendida porque vencio el pago. Escribenos al " + SUPPORT_WHATSAPP_PRETTY + " para renovarla.";

function mensajeSuspendida(u: { suspendedAt: Date | null; suspendedForPayment: boolean }): string {
  // Sin suspendedAt es que se acaba de suspender por pago en este ingreso.
  return u.suspendedForPayment || !u.suspendedAt ? CUENTA_VENCIDA : CUENTA_SUSPENDIDA;
}

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
  if (!esTipoElegible(businessType)) return { error: "Elige el tipo de negocio." };

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
      brandColor: COLOR_POR_TIPO[businessType],
      // Unos dias con todo; despues, la version gratis hasta que pague.
      trialEndsAt: finDePrueba(),
      // El dueno queda registrado como la primera persona que atiende.
      staff: {
        create: {
          name: ownerName,
          role: "DUENO",
          color: COLOR_POR_TIPO[businessType],
          phone: phone || null,
        },
      },
      services: {
        create: CATALOGO_POR_TIPO[businessType].map((s) => ({
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
    if (user.suspendedAt || (await suspenderSiVencio(user))) return { error: mensajeSuspendida(user) };
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
  if (staff.user.suspendedAt || (await suspenderSiVencio(staff.user))) return { error: mensajeSuspendida(staff.user) };

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
