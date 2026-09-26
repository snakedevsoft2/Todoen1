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
import { headers } from "next/headers";
import { esUsuario, normalizarUsuario } from "@/lib/usuario";
import { destinoTrasEntrar } from "@/lib/permisos";
import {
  anotarIntentoDeLogin,
  anotarIntentoDeUsuario,
  demasiadosIntentosDeLogin,
  demasiadosIntentosDeUsuario,
} from "@/lib/seguridad";
import { OTRO_PAIS, esMonedaValida, esZonaValida, paisPorCodigo, zonaParaPais } from "@/lib/paises";

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
  "Tu cuenta no esta activa en este momento. Escribenos al " + SUPPORT_WHATSAPP_PRETTY + " para reactivarla.";

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
  // El pais pone la moneda y la zona; en "Otro pais" vienen elegidas a mano.
  const paisIn = String(formData.get("country") ?? "").trim();
  const pais = paisPorCodigo(paisIn);
  const monedaIn = String(formData.get("currency") ?? "").trim().toUpperCase();
  const zonaIn = String(formData.get("timezone") ?? "").trim();
  const country = pais ? pais.code : paisIn === OTRO_PAIS ? OTRO_PAIS : "CO";
  const currency = esMonedaValida(monedaIn) ? monedaIn : (pais?.moneda ?? "COP");
  const timezone = pais ? zonaParaPais(pais.code, zonaIn) : esZonaValida(zonaIn) ? zonaIn : "America/Bogota";

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
      country,
      currency,
      timezone,
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
          bookable: businessType === "BARBERIA" || businessType === "LAVADERO",
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
      uv: user.sessionVersion,
      sv: user.staff[0]?.sessionVersion,
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
  if (!email) return { error: "Escribe tu correo o tu usuario." };
  // Sin arroba es el usuario de un empleado: entra sin contraseña.
  if (esUsuario(email)) return entrarConUsuario(jar, email, remember);
  if (!password) return { error: "Escribe tu correo y contrasena." };

  // Freno de fuerza bruta por conexion: sin esto, alguien podia probar
  // contrasenas sin limite contra el correo de un dueno.
  const origen = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (await demasiadosIntentosDeLogin(origen)) {
    return { error: "Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo." };
  }

  const user = await db.user.findUnique({ where: { email }, omit: { logo: true, publicCover: true } });

  // 1. El dueno del negocio.
  if (user) {
    if (!checkPassword(password, user.passwordHash)) {
      await anotarIntentoDeLogin(origen);
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
        uv: user.sessionVersion,
        sv: owner.sessionVersion,
      }),
      remember
    );
    // Directo a Bienvenida si todavia no la ha visto, igual que con el
    // empleado de asistencia y el lavador: dos redirecciones seguidas desde
    // una Server Action (login -> /panel -> Bienvenida) tardan varios
    // segundos de mas en aparecer completas.
    redirect(owner.onboardingDoneAt ? "/panel" : "/panel/bienvenida");
  }

  // 2. Un barbero con usuario propio dentro de un negocio.
  const staff = await db.staff.findUnique({ where: { email }, include: { user: { omit: { logo: true, publicCover: true } } } });
  if (!staff || !staff.passwordHash || !checkPassword(password, staff.passwordHash)) {
    await anotarIntentoDeLogin(origen);
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
      uv: staff.user.sessionVersion,
      sv: staff.sessionVersion,
    }),
    remember
  );
  redirect(destinoTrasEntrar(staff.user, staff));
}

/**
 * El empleado que agrego el dueño entra solo con su usuario, sin contraseña.
 *
 * Para que no se puedan probar usuarios a ciegas, los intentos con usuarios
 * que no existen se cuentan por conexion y se frenan un rato. Por aqui solo
 * entra un empleado: el dueño entra con su correo y su contraseña.
 */
async function entrarConUsuario(
  jar: Awaited<ReturnType<typeof cookieJar>>,
  escrito: string,
  remember: boolean
): Promise<AuthState> {
  const origen = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (await demasiadosIntentosDeUsuario(origen)) {
    return { error: "Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo." };
  }
  const username = normalizarUsuario(escrito);
  const staff = await db.staff.findUnique({ where: { username }, include: { user: { omit: { logo: true, publicCover: true } } } });
  if (!staff || staff.role === "DUENO") {
    await anotarIntentoDeUsuario(origen);
    return { error: "No encontramos ese usuario. Escríbelo como te lo dio el dueño del negocio." };
  }
  if (!staff.active) return { error: "Tu usuario esta desactivado. Pidele al dueno que lo active." };
  if (staff.user.suspendedAt || (await suspenderSiVencio(staff.user))) return { error: mensajeSuspendida(staff.user) };

  writeSessionCookie(
    jar,
    await signSession({
      uid: staff.userId,
      email: "usuario:" + username,
      type: staff.user.businessType,
      sid: staff.id,
      role: staff.role,
      uv: staff.user.sessionVersion,
      sv: staff.sessionVersion,
    }),
    remember
  );
  redirect(destinoTrasEntrar(staff.user, staff));
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
