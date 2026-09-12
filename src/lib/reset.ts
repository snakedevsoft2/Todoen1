import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import type { PasswordReset } from "@prisma/client";
import { db } from "./db";
import { APP_NAME } from "./brand";
import { SUPPORT_WHATSAPP_PRETTY } from "./support";

/**
 * Enlaces para reponer la contrasena olvidada.
 *
 * La regla que sostiene todo esto: la contrasena vieja no se puede recuperar
 * nunca, porque en la base solo vive su hash de bcrypt. Reponer es cambiarla
 * por una nueva, y para poder hacerlo hay que probar primero que el correo es
 * de uno. Esa prueba es el enlace: llega al buzon y sirve una sola vez.
 */

/** Cuanto dura el enlace. Una hora alcanza de sobra para ir al correo. */
export const MINUTOS_DE_VIDA = 60;

/** Minimo de la contrasena, el mismo de Ajustes y del registro. */
export const MINIMO_CLAVE = 6;

/**
 * Cuantos enlaces se le pueden pedir al mismo correo seguidos, y en cuanto
 * tiempo. Sin esto, cualquiera podria llenarle el buzon a otro desde la
 * pantalla publica.
 */
const MAX_POR_VENTANA = 3;
const MINUTOS_DE_VENTANA = 15;

/** La huella con la que buscamos el enlace en la base. */
export function huella(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Cuenta a la que le vamos a reponer la clave. */
export type Destino = {
  /** "negocio" es el dueno (User); "persona" es un barbero o empleado (Staff). */
  tipo: "negocio" | "persona";
  id: string;
  nombre: string;
  email: string;
};

/**
 * Busca a quien pertenece un correo.
 *
 * Mira primero el negocio y despues el personal, en el mismo orden que el
 * ingreso (src/actions/auth.ts), para que un correo no signifique una cuenta
 * al entrar y otra al recuperar.
 *
 * Devuelve null para el barbero desactivado a proposito: si no puede entrar,
 * tampoco tiene por que recibir un enlace que no le va a servir.
 */
export async function buscarCuenta(email: string): Promise<Destino | null> {
  const correo = email.trim().toLowerCase();
  if (!correo) return null;

  const negocio = await db.user.findUnique({
    where: { email: correo },
    select: { id: true, ownerName: true, email: true },
  });
  if (negocio) {
    return { tipo: "negocio", id: negocio.id, nombre: negocio.ownerName, email: negocio.email };
  }

  const persona = await db.staff.findUnique({
    where: { email: correo },
    select: { id: true, name: true, email: true, active: true, passwordHash: true },
  });
  // Sin passwordHash es alguien que esta en la agenda pero nunca tuvo usuario:
  // no hay clave que reponer.
  if (!persona || !persona.active || !persona.passwordHash || !persona.email) return null;

  return { tipo: "persona", id: persona.id, nombre: persona.name, email: persona.email };
}

/**
 * Cuantos enlaces se le han pedido a este correo en la ventana.
 *
 * Se cuenta por correo y no por cuenta para que tambien frene los intentos
 * contra correos que no existen.
 */
export async function pedidosRecientes(email: string): Promise<number> {
  const desde = new Date(Date.now() - MINUTOS_DE_VENTANA * 60 * 1000);
  return db.passwordReset.count({
    where: { email: email.trim().toLowerCase(), createdAt: { gte: desde } },
  });
}

export function excedioElLimite(pedidos: number): boolean {
  return pedidos >= MAX_POR_VENTANA;
}

/**
 * Crea el enlace y devuelve el token en claro.
 *
 * Es la unica vez que el token existe sin cifrar: se va derecho al correo y en
 * la base solo queda su huella.
 *
 * Los enlaces anteriores de esa misma cuenta se dan por usados: si alguien
 * pidio dos, solo debe servir el ultimo que le llego.
 */
export async function crearEnlace(destino: Destino): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const ahora = new Date();

  await db.passwordReset.updateMany({
    where:
      destino.tipo === "negocio"
        ? { userId: destino.id, usedAt: null }
        : { staffId: destino.id, usedAt: null },
    data: { usedAt: ahora },
  });

  await db.passwordReset.create({
    data: {
      tokenHash: huella(token),
      email: destino.email,
      userId: destino.tipo === "negocio" ? destino.id : null,
      staffId: destino.tipo === "persona" ? destino.id : null,
      expiresAt: new Date(ahora.getTime() + MINUTOS_DE_VIDA * 60 * 1000),
    },
  });

  return token;
}

/**
 * De donde cuelga el enlace que va en el correo.
 *
 * Se saca de la peticion como en el ingreso con Google (src/app/auth/google),
 * asi funciona igual en el computador y en Vercel sin tener que configurar
 * nada. APP_URL solo hace falta si algun dia la aplicacion queda detras de
 * algo que cambie el host.
 */
export async function direccionBase(): Promise<string> {
  const fijo = process.env.APP_URL?.trim();
  if (fijo) return fijo.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return protocolo + "://" + host;
}

/** Por que no sirve un enlace. Cada motivo se le explica distinto a la persona. */
export type MotivoInvalido = "inexistente" | "usado" | "vencido";

export type Revision = { ok: true; enlace: PasswordReset } | { ok: false; motivo: MotivoInvalido };

/** Mira si el enlace todavia sirve, sin gastarlo. */
export async function revisarEnlace(token: string): Promise<Revision> {
  if (!token) return { ok: false, motivo: "inexistente" };

  const enlace = await db.passwordReset.findUnique({ where: { tokenHash: huella(token) } });
  if (!enlace) return { ok: false, motivo: "inexistente" };
  if (enlace.usedAt) return { ok: false, motivo: "usado" };
  if (enlace.expiresAt.getTime() < Date.now()) return { ok: false, motivo: "vencido" };

  return { ok: true, enlace };
}

/** Lo que se le muestra a quien llega con un enlace que ya no sirve. */
export const TEXTO_INVALIDO: Record<MotivoInvalido, string> = {
  inexistente: "Este enlace no es válido. Pide uno nuevo desde la pantalla de ingreso.",
  usado: "Este enlace ya se usó. Si necesitas cambiarla otra vez, pide uno nuevo.",
  vencido:
    "Este enlace se venció. Los enlaces duran una hora por seguridad; pide uno nuevo y úsalo de una.",
};

/** El nombre entra al HTML del correo, asi que no puede traer etiquetas. */
function escapar(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * El correo que le llega a la persona, en HTML y en texto plano.
 *
 * `porSoporte` cambia el motivo: no es lo mismo "pediste cambiarla" que un
 * enlace que genero soporte desde el panel. Decirle "pediste" a quien no pidio
 * nada lo unico que logra es que crea que le entraron a la cuenta.
 */
export function correoDeEnlace({
  nombre,
  url,
  porSoporte = false,
}: {
  nombre: string;
  url: string;
  porSoporte?: boolean;
}) {
  const motivo = porSoporte
    ? "Generamos este enlace desde soporte de " + APP_NAME + " para que puedas volver a entrar."
    : "Pediste cambiar la contraseña de tu cuenta de " + APP_NAME + ".";

  const texto = [
    "Hola " + nombre + ",",
    "",
    motivo,
    "Entra aquí y escribe la nueva:",
    "",
    url,
    "",
    "El enlace sirve una sola vez y se vence en " + MINUTOS_DE_VIDA + " minutos.",
    "",
    porSoporte
      ? "Si no lo pediste, escríbenos antes de usarlo."
      : "Si no fuiste tú, no tienes que hacer nada: tu contraseña sigue igual.",
    "¿Dudas? Escríbenos al " + SUPPORT_WHATSAPP_PRETTY + ".",
  ].join("\n");

  // Correo en tabla y con estilos en linea a proposito: es lo unico que se ve
  // parejo en Gmail, Outlook y el correo del celular.
  const fuente =
    "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
  const html = [
    '<!doctype html><html lang="es"><body style="margin:0;background:#f1f5f9;padding:32px 16px;font-family:' +
      fuente +
      ';color:#0f172a">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;padding:32px"><tr><td>',
    '<p style="margin:0 0 20px;font-size:19px;font-weight:700">Cambiar tu contraseña</p>',
    '<p style="margin:0 0 14px;font-size:15px;line-height:1.6">Hola ' +
      escapar(nombre) +
      ", " +
      (porSoporte
        ? "generamos este enlace desde soporte de " + APP_NAME + " para que puedas volver a entrar."
        : "pediste cambiar la contraseña de tu cuenta de " + APP_NAME + ".") +
      "</p>",
    '<p style="margin:0 0 26px;font-size:15px;line-height:1.6">Toca el botón y escribe la nueva:</p>',
    '<p style="margin:0 0 26px"><a href="' +
      url +
      '" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 24px;border-radius:9px">Poner contraseña nueva</a></p>',
    '<p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#64748b">El enlace sirve una sola vez y se vence en ' +
      MINUTOS_DE_VIDA +
      ' minutos. Si el botón no abre, copia y pega esta dirección:<br><span style="word-break:break-all;color:#2563eb">' +
      url +
      "</span></p>",
    '<p style="margin:0;border-top:1px solid #e2e8f0;padding-top:20px;font-size:13px;line-height:1.6;color:#64748b">' +
      (porSoporte
        ? "Si no lo pediste, escríbenos antes de usarlo."
        : "Si no fuiste tú, no tienes que hacer nada: tu contraseña sigue igual.") +
      '<br>¿Dudas? Escríbenos al ' +
      SUPPORT_WHATSAPP_PRETTY +
      ".</p>",
    "</td></tr></table></body></html>",
  ].join("");

  return { subject: "Cambiar tu contraseña de " + APP_NAME, html, text: texto };
}
