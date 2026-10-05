import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { MAX_BYTES_PDF, PDF_VALIDO, esPdfDeVerdad, falla, textoDe, type Resultado, type Sesion } from "./informes";
import { puedeVerDocumento } from "./documentos";
import { firmarPdf, imagenAPdf, revisarPdf, sha256 } from "./firma-pdf";
import { leerSpots, normalizarSpots, spotPorDefecto, type Spot } from "./firma-spots";
import { avisarAlAdministrador } from "./avisos-admin";
import { mailEnabled, sendMail } from "./mail";
import { direccionBase } from "./reset";

/**
 * Documentos para que un cliente los firme desde su telefono.
 *
 * El negocio arma la solicitud, le sube los PDF (o fotos, o lo que escaneo) y
 * le manda al cliente un enlace. El cliente abre el enlace sin cuenta, dibuja
 * o escribe su firma, la pone donde va y firma. Los PDF firmados los arma el
 * servidor y quedan para los dos.
 */

/** PDF por solicitud. Mas que esto ya es un paquete que nadie lee en el celular. */
export const MAX_DOCS_FIRMA = 5;
/** Paginas por documento: el telefono del cliente las tiene que dibujar todas. */
export const MAX_PAGINAS_FIRMA = 40;
/** Solicitudes guardadas por negocio, para que la base no crezca sin control. */
export const MAX_SOLICITUDES = 500;
/** La imagen de la firma: un PNG chico (una foto de firma con bordes suaves pesa mas que una dibujada). */
const MAX_LARGO_FIRMA = 900_000;
const FIRMA_VALIDA = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const FOTO_JPG_PNG = /^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function puedeVerSolicitud(staff: { id: string; role: string }, s: { createdByStaffId: string | null }): boolean {
  return staff.role === "DUENO" || s.createdByStaffId === staff.id;
}

export const rutaDeFirma = (token: string) => "/firmar/" + token;

const bytesDe = (dataUrl: string) => new Uint8Array(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
const aDataUrl = (bytes: Uint8Array) => "data:application/pdf;base64," + Buffer.from(bytes).toString("base64");

/** La solicitud del negocio, si quien pregunta la puede ver. */
async function solicitudPropia(s: Sesion, id: string) {
  const sol = await db.signRequest.findFirst({
    where: { id, userId: s.user.id },
    select: { id: true, status: true, createdByStaffId: true, _count: { select: { documents: true } } },
  });
  return sol && puedeVerSolicitud(s.staff, sol) ? sol : null;
}

export async function crearSolicitud(s: Sesion, d: Record<string, unknown>): Promise<Resultado<{ id: string }>> {
  const signerName = textoDe(d.signerName, 120);
  if (!signerName) return falla("Escribe el nombre de quien va a firmar.");
  const signerEmail = textoDe(d.signerEmail, 160).toLowerCase() || null;
  if (signerEmail && !CORREO.test(signerEmail)) return falla("El correo no es válido.");
  const signerPhone = textoDe(d.signerPhone, 30) || null;

  const cuantas = await db.signRequest.count({ where: { userId: s.user.id } });
  if (cuantas >= MAX_SOLICITUDES) return falla("Ya tienes " + MAX_SOLICITUDES + " solicitudes. Borra las que ya no necesites.");

  const sol = await db.signRequest.create({
    data: {
      userId: s.user.id,
      createdByStaffId: s.staff.id,
      title: textoDe(d.title, 160) || "Documentos para firmar",
      message: textoDe(d.message, 1000) || null,
      signerName,
      signerPhone,
      signerEmail,
      token: randomBytes(24).toString("base64url"),
    },
    select: { id: true },
  });
  return { ok: true, datos: { id: sol.id } };
}

/**
 * Agrega un documento: un PDF, una foto (que se vuelve PDF) o un documento
 * que ya estaba guardado en el Escaner.
 */
export async function agregarDocumento(
  s: Sesion,
  requestId: string,
  d: Record<string, unknown>
): Promise<Resultado<{ id: string }>> {
  const sol = await solicitudPropia(s, requestId);
  if (!sol) return falla("Esa solicitud no existe.", 404);
  if (sol.status !== "PENDIENTE") return falla("Esa solicitud ya no recibe documentos.");
  if (sol._count.documents >= MAX_DOCS_FIRMA) return falla("Una solicitud lleva máximo " + MAX_DOCS_FIRMA + " documentos.");

  let nombre = textoDe(d.name, 160).replace(/\.(pdf|jpe?g|png)$/i, "");
  let bytes: Uint8Array;

  const scanId = textoDe(d.scanId, 40);
  if (scanId) {
    const scan = await db.scanDocument.findFirst({
      where: { id: scanId, userId: s.user.id },
      select: { title: true, pdf: true, staffId: true },
    });
    if (!scan || !puedeVerDocumento(s.staff, scan)) return falla("Ese documento escaneado no existe.", 404);
    nombre = nombre || scan.title;
    bytes = bytesDe(scan.pdf);
  } else {
    const data = typeof d.data === "string" ? d.data : "";
    if (PDF_VALIDO.test(data)) {
      if (!esPdfDeVerdad(data)) return falla("Eso no es un PDF válido.");
      bytes = bytesDe(data);
    } else if (FOTO_JPG_PNG.test(data)) {
      try {
        bytes = await imagenAPdf(bytesDe(data), data.startsWith("data:image/png") ? "png" : "jpg");
      } catch {
        return falla("No se pudo leer esa foto.");
      }
    } else {
      return falla("Sube un PDF o una foto (JPG o PNG).");
    }
  }

  if (bytes.length > MAX_BYTES_PDF) return falla("El documento pesa más de 3 MB.");
  const revision = await revisarPdf(bytes);
  if (!revision.ok) return falla(revision.error);
  if (revision.paginas > MAX_PAGINAS_FIRMA) return falla("El documento tiene más de " + MAX_PAGINAS_FIRMA + " páginas.");

  const doc = await db.signDocument.create({
    data: {
      userId: s.user.id,
      requestId: sol.id,
      name: nombre || "Documento",
      pdf: aDataUrl(bytes),
      size: bytes.length,
      pages: revision.paginas,
      sha256: sha256(bytes),
      sortOrder: sol._count.documents,
    },
    select: { id: true },
  });
  return { ok: true, datos: { id: doc.id } };
}

/** Guarda donde tiene que firmar el cliente en un documento. */
export async function guardarLugares(s: Sesion, docId: string, valor: unknown): Promise<Resultado<{ spots: Spot[] }>> {
  const doc = await db.signDocument.findFirst({
    where: { id: docId, userId: s.user.id },
    select: { id: true, pages: true, request: { select: { status: true, createdByStaffId: true } } },
  });
  if (!doc || !puedeVerSolicitud(s.staff, doc.request)) return falla("Ese documento no existe.", 404);
  if (doc.request.status !== "PENDIENTE") return falla("Ese documento ya no se puede cambiar.");
  const spots = normalizarSpots(valor, doc.pages);
  await db.signDocument.update({ where: { id: doc.id }, data: { spots: spots.length ? JSON.stringify(spots) : null } });
  return { ok: true, datos: { spots } };
}

export async function quitarDocumento(s: Sesion, docId: string): Promise<string | null> {
  const doc = await db.signDocument.findFirst({
    where: { id: docId, userId: s.user.id },
    select: { id: true, requestId: true, request: { select: { status: true, createdByStaffId: true } } },
  });
  if (!doc || !puedeVerSolicitud(s.staff, doc.request) || doc.request.status !== "PENDIENTE") return null;
  await db.signDocument.delete({ where: { id: doc.id } });
  return doc.requestId;
}

export async function anularSolicitud(s: Sesion, id: string): Promise<boolean> {
  const sol = await solicitudPropia(s, id);
  if (!sol || sol.status !== "PENDIENTE") return false;
  await db.signRequest.update({ where: { id: sol.id }, data: { status: "ANULADO" } });
  return true;
}

/** Borrar es solo del dueño: lo firmado es una prueba y no lo borra cualquiera. */
export async function borrarSolicitud(s: Sesion, id: string): Promise<boolean> {
  if (s.staff.role !== "DUENO") return false;
  const r = await db.signRequest.deleteMany({ where: { id, userId: s.user.id } });
  return r.count > 0;
}

// -------------------------------------------------------- LADO DEL CLIENTE

const TOKEN_VALIDO = /^[A-Za-z0-9_-]{20,60}$/;

/** Lo que abre el enlace. Publico: se busca por el token, que no se puede adivinar. */
export async function solicitudPorToken(token: string) {
  if (!TOKEN_VALIDO.test(token)) return null;
  return db.signRequest.findUnique({
    where: { token },
    select: {
      id: true,
      userId: true,
      title: true,
      message: true,
      signerName: true,
      status: true,
      signedAt: true,
      signedName: true,
      viewedAt: true,
      createdAt: true,
      documents: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, pages: true, size: true, spots: true, signedSha256: true },
      },
      user: {
        select: {
          businessName: true,
          slug: true,
          updatedAt: true,
          timezone: true,
          phone: true,
          whatsappNumber: true,
          address: true,
        },
      },
    },
  });
}

export function fechaFirma(fecha: Date, zona: string): string {
  return (
    new Intl.DateTimeFormat("es-CO", { timeZone: zona, dateStyle: "long", timeStyle: "medium", hour12: true }).format(fecha) +
    " (" +
    zona +
    ")"
  );
}

/**
 * Firma la solicitud: pone la firma en cada documento y guarda los firmados.
 *
 * `lugares` trae, por documento, donde dejo el cliente su firma. Un documento
 * sin lugares se firma donde lo marco el negocio, o abajo de la ultima pagina:
 * ningun documento de la solicitud queda sin firmar.
 */
export async function firmarSolicitud(
  token: string,
  d: Record<string, unknown>,
  origen: { ip: string | null; navegador: string | null }
): Promise<Resultado<{ id: string }>> {
  const sol = await solicitudPorToken(token);
  if (!sol) return falla("Este enlace no existe.", 404);
  if (sol.status === "FIRMADO") return falla("Estos documentos ya están firmados.", 409);
  if (sol.status === "ANULADO") return falla("El negocio canceló esta solicitud.", 410);
  if (sol.documents.length === 0) return falla("Todavía no hay documentos para firmar.");

  const nombre = textoDe(d.name, 120);
  if (nombre.length < 3) return falla("Escribe tu nombre completo.");
  const identificacion = textoDe(d.docNumber, 40) || null;
  if (d.accept !== true) return falla("Tienes que aceptar firmar electrónicamente.");

  const firma = typeof d.signature === "string" ? d.signature : "";
  if (!FIRMA_VALIDA.test(firma) || firma.length > MAX_LARGO_FIRMA) return falla("Haz tu firma antes de enviar.");
  const png = bytesDe(firma);
  // Todo PNG empieza igual: que no sea otra cosa con la etiqueta cambiada.
  if (png[0] !== 0x89 || png[1] !== 0x50 || png[2] !== 0x4e || png[3] !== 0x47) return falla("La firma no es una imagen válida.");

  const lugares = d.lugares && typeof d.lugares === "object" ? (d.lugares as Record<string, unknown>) : {};
  const ahora = new Date();
  const fecha = fechaFirma(ahora, sol.user.timezone);

  const firmados: { id: string; pdf: string; huella: string }[] = [];
  for (const meta of sol.documents) {
    const doc = await db.signDocument.findUnique({ where: { id: meta.id }, select: { pdf: true, sha256: true } });
    if (!doc) continue;
    let spots = normalizarSpots(lugares[meta.id], meta.pages);
    if (spots.length === 0) spots = leerSpots(meta.spots, meta.pages);
    if (spots.length === 0) spots = [spotPorDefecto(meta.pages)];

    let bytes: Uint8Array;
    try {
      bytes = await firmarPdf(bytesDe(doc.pdf), png, spots, {
        negocio: sol.user.businessName,
        solicitud: sol.title,
        documento: meta.name,
        firmante: nombre,
        identificacion,
        contacto: null,
        fecha,
        ip: origen.ip,
        navegador: origen.navegador,
        huellaOriginal: doc.sha256,
        referencia: sol.id + " / " + meta.id,
      });
    } catch {
      return falla("No se pudo firmar " + meta.name + ". Avísale al negocio.", 500);
    }
    firmados.push({ id: meta.id, pdf: aDataUrl(bytes), huella: sha256(bytes) });
  }

  // Todo o nada, y solo si nadie firmo mientras tanto (dos pestañas abiertas).
  const listo = await db.$transaction(async (tx) => {
    const r = await tx.signRequest.updateMany({
      where: { id: sol.id, status: "PENDIENTE" },
      data: {
        status: "FIRMADO",
        signedAt: ahora,
        signedName: nombre,
        signedDocNumber: identificacion,
        signerIp: origen.ip?.slice(0, 80) ?? null,
        signerAgent: origen.navegador?.slice(0, 300) ?? null,
        signature: firma,
      },
    });
    if (r.count === 0) return false;
    for (const f of firmados) {
      await tx.signDocument.update({ where: { id: f.id }, data: { signedPdf: f.pdf, signedSha256: f.huella } });
    }
    return true;
  }, { timeout: 30_000 });
  if (!listo) return falla("Estos documentos ya están firmados.", 409);

  await avisarFirma(sol.id).catch(() => {});
  return { ok: true, datos: { id: sol.id } };
}

/** Le avisa al negocio que firmaron, y al cliente le manda sus copias si dejo correo. */
async function avisarFirma(id: string): Promise<void> {
  const sol = await db.signRequest.findUnique({
    where: { id },
    select: { title: true, token: true, signedName: true, signerEmail: true, userId: true, documents: { select: { name: true } } },
  });
  if (!sol) return;
  const user = await db.user.findUnique({ where: { id: sol.userId }, omit: { logo: true, publicCover: true } });
  if (!user) return;

  await avisarAlAdministrador(user, {
    asunto: "Firmaron: " + sol.title,
    texto: (sol.signedName ?? "El cliente") + " firmó " + sol.documents.map((d) => d.name).join(", ") + ".",
    ruta: "/panel/firmas/" + id,
  });

  if (sol.signerEmail && mailEnabled()) {
    let enlace = rutaDeFirma(sol.token);
    try {
      enlace = (await direccionBase()) + enlace;
    } catch {
      // Sin peticion no hay direccion: va la ruta sola.
    }
    const texto =
      "Hola " +
      (sol.signedName ?? "") +
      ", firmaste \"" +
      sol.title +
      "\" de " +
      user.businessName +
      ". Aquí puedes descargar tus copias firmadas:\n\n" +
      enlace;
    const html =
      "<p>" +
      texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>").replace(enlace, '<a href="' + enlace + '">' + enlace + "</a>") +
      "</p>";
    await sendMail({ to: sol.signerEmail, subject: "Tus documentos firmados · " + user.businessName, text: texto, html });
  }
}
