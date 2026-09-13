import { prettyDay } from "./format";

/**
 * PDF del reporte de visita y de la planilla de asistencia.
 *
 * Se arman en el navegador, igual que la factura: asi se comparten directo por
 * WhatsApp desde el celular sin que el archivo pase por el servidor ni quede
 * guardado en ninguna parte.
 */

export type InformeDatos = {
  businessName: string;
  businessPhone: string | null;
  businessAddress: string | null;
  logoUrl: string | null;
  title: string;
  day: string;
  siteName: string | null;
  siteAddress: string | null;
  clientName: string | null;
  body: string | null;
  createdBy: string | null;
  /** Quien marco en el sitio ese dia, con sus horas ya en la zona del negocio. */
  personal: { name: string; entrada: string | null; salida: string | null }[];
  fotos: { url: string; caption: string | null }[];
};

export type FilaPlanilla = {
  persona: string;
  dia: string;
  entradas: string;
  salidas: string;
  horas: string;
  sitio: string;
  lejos: boolean;
  raro: boolean;
};

export type PlanillaDatos = {
  businessName: string;
  rango: string;
  filas: FilaPlanilla[];
  totales: { persona: string; dias: number; horas: string }[];
  anulados: { persona: string; dia: string; hora: string; tipo: string; motivo: string }[];
};

type Imagen = { data: string; w: number; h: number };

/**
 * Carga una imagen y la vuelve JPEG.
 *
 * Las fotos llegan en WebP o JPEG segun lo que dio mas liviano en el telefono,
 * y no todas las versiones de jsPDF pintan WebP. Pasar todo por un lienzo
 * resuelve eso y de paso da el tamano real, que hace falta para no deformarla.
 */
async function cargarJpeg(url: string, maxLado = 1400): Promise<Imagen | null> {
  try {
    const r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) return null;
    const bmp = await createImageBitmap(await r.blob());
    const escala = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * escala));
    const h = Math.max(1, Math.round(bmp.height * escala));
    const lienzo = document.createElement("canvas");
    lienzo.width = w;
    lienzo.height = h;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    return { data: lienzo.toDataURL("image/jpeg", 0.82), w, h };
  } catch {
    return null;
  }
}

function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function piePaginas(doc: any, ancho: number, alto: number) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text("Página " + i + " de " + total, ancho / 2, alto - 8, { align: "center" });
  }
  doc.setTextColor(0);
}

export function nombreInforme(d: InformeDatos): string {
  return "reporte-" + (slug(d.title) || "visita") + "-" + d.day + ".pdf";
}

export function mensajeInforme(d: InformeDatos): string {
  return [
    "Hola" + (d.clientName ? " " + d.clientName : "") + ", te compartimos el reporte de " + d.businessName + ".",
    "",
    d.title,
    "Fecha: " + prettyDay(d.day),
    d.siteName ? "Sitio: " + d.siteName : "",
    d.fotos.length > 0 ? "Incluye " + d.fotos.length + (d.fotos.length === 1 ? " foto." : " fotos.") : "",
  ]
    .filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .trim();
}

export async function construirInformePdf(d: InformeDatos): Promise<File> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const ANCHO = 210;
  const ALTO = 297;
  const M = 16;
  const UTIL = ANCHO - M * 2;
  const PIE = ALTO - 18;
  let y = 20;

  const salto = (alto: number) => {
    if (y + alto > PIE) {
      doc.addPage();
      y = 20;
    }
  };

  // Encabezado del negocio.
  const logo = d.logoUrl ? await cargarJpeg(d.logoUrl, 300) : null;
  if (logo) {
    try {
      doc.addImage(logo.data, "JPEG", M, y - 6, 18, 18 * (logo.h / logo.w));
    } catch {
      // Sin logo sale igual.
    }
  }
  const x0 = logo ? M + 24 : M;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(d.businessName, x0, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  let sub = y + 5;
  if (d.businessAddress) {
    doc.text(d.businessAddress, x0, sub);
    sub += 4;
  }
  if (d.businessPhone) doc.text("Tel: " + d.businessPhone, x0, sub);

  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("REPORTE DE VISITA", ANCHO - M, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(prettyDay(d.day), ANCHO - M, y + 5, { align: "right" });
  doc.setTextColor(0);

  y = 44;
  doc.setDrawColor(220);
  doc.line(M, y - 6, ANCHO - M, y - 6);

  // Titulo.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  for (const linea of doc.splitTextToSize(d.title, UTIL) as string[]) {
    salto(7);
    doc.text(linea, M, y);
    y += 7;
  }
  y += 2;

  // Datos del trabajo.
  const datos: [string, string | null][] = [
    ["Sitio", d.siteName],
    ["Direccion", d.siteAddress],
    ["Cliente", d.clientName],
    ["Elaborado por", d.createdBy],
  ];
  for (const [label, valor] of datos) {
    if (!valor) continue;
    salto(6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(label, M, y);
    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.text(valor, M + 32, y);
    y += 6;
  }

  // Personal en el sitio.
  if (d.personal.length > 0) {
    y += 3;
    salto(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Personal en el sitio", M, y);
    y += 6;
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text("Nombre", M, y);
    doc.text("Entrada", M + 100, y);
    doc.text("Salida", M + 135, y);
    doc.setTextColor(0);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const p of d.personal) {
      salto(6);
      doc.text(p.name, M, y);
      doc.text(p.entrada ?? "-", M + 100, y);
      doc.text(p.salida ?? "-", M + 135, y);
      y += 6;
    }
  }

  // Trabajo realizado.
  if (d.body) {
    y += 3;
    salto(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Trabajo realizado", M, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const linea of doc.splitTextToSize(d.body, UTIL) as string[]) {
      salto(5);
      doc.text(linea, M, y);
      y += 5;
    }
  }

  // Registro fotografico, en dos columnas y sin deformar ninguna foto.
  if (d.fotos.length > 0) {
    y += 4;
    salto(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Registro fotografico (" + d.fotos.length + ")", M, y);
    y += 5;

    const GAP = 6;
    const COL = (UTIL - GAP) / 2;
    const MAX_ALTO = 80;

    const imagenes = await Promise.all(d.fotos.map((f) => cargarJpeg(f.url)));

    for (let i = 0; i < d.fotos.length; i += 2) {
      const par = [0, 1]
        .map((k) => i + k)
        .filter((k) => k < d.fotos.length)
        .map((k) => {
          const img = imagenes[k];
          let w = COL;
          let h = img ? COL * (img.h / img.w) : 50;
          if (h > MAX_ALTO) {
            w = w * (MAX_ALTO / h);
            h = MAX_ALTO;
          }
          return { img, w, h, caption: d.fotos[k].caption };
        });

      const altoFila = Math.max(...par.map((p) => p.h)) + (par.some((p) => p.caption) ? 7 : 3);
      salto(altoFila);

      par.forEach((p, k) => {
        const xCol = M + k * (COL + GAP);
        const x = xCol + (COL - p.w) / 2;
        if (p.img) {
          try {
            doc.addImage(p.img.data, "JPEG", x, y, p.w, p.h);
          } catch {
            doc.setDrawColor(200);
            doc.rect(x, y, p.w, p.h);
          }
        } else {
          doc.setDrawColor(200);
          doc.rect(xCol, y, COL, p.h);
          doc.setFontSize(9);
          doc.setTextColor(140);
          doc.text("Foto no disponible", xCol + COL / 2, y + p.h / 2, { align: "center" });
          doc.setTextColor(0);
        }
        if (p.caption) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(90);
          doc.text((doc.splitTextToSize(p.caption, COL) as string[])[0], xCol, y + p.h + 4);
          doc.setTextColor(0);
        }
      });
      y += altoFila + 3;
    }
  }

  piePaginas(doc, ANCHO, ALTO);
  return new File([doc.output("blob")], nombreInforme(d), { type: "application/pdf" });
}

export function nombrePlanilla(d: PlanillaDatos): string {
  return "planilla-" + (slug(d.rango) || "asistencia") + ".pdf";
}

export function mensajePlanilla(d: PlanillaDatos): string {
  return (
    "Planilla de asistencia de " +
    d.businessName +
    ".\n" +
    d.rango +
    "\n" +
    d.totales.length +
    (d.totales.length === 1 ? " persona." : " personas.")
  );
}

/**
 * La planilla en PDF, horizontal porque son seis columnas.
 *
 * Los marcajes anulados salen al final con su motivo. No se esconden: una
 * planilla que se entrega sin mostrar lo que se tacho es justo la que no sirve
 * de prueba.
 */
export async function construirPlanillaPdf(d: PlanillaDatos): Promise<File> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });

  const ANCHO = 297;
  const ALTO = 210;
  const M = 12;
  const PIE = ALTO - 16;
  let y = 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(d.businessName, M, y);
  doc.setFontSize(11);
  doc.text("PLANILLA DE ASISTENCIA", ANCHO - M, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(d.rango, ANCHO - M, y + 5, { align: "right" });
  doc.setTextColor(0);
  y += 14;

  type Col = { titulo: string; w: number };
  const tabla = (cols: Col[], filas: string[][], marcaRoja?: (i: number) => boolean) => {
    const cabecera = () => {
      doc.setFillColor(242, 242, 247);
      doc.rect(M, y - 5, ANCHO - M * 2, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      let x = M + 2;
      for (const c of cols) {
        doc.text(c.titulo, x, y);
        x += c.w;
      }
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
    };
    cabecera();
    filas.forEach((fila, i) => {
      if (y + 6 > PIE) {
        doc.addPage();
        y = 18;
        cabecera();
      }
      let x = M + 2;
      fila.forEach((valor, k) => {
        const rojo = marcaRoja?.(i) && k === fila.length - 1;
        if (rojo) doc.setTextColor(201, 33, 51);
        doc.text((doc.splitTextToSize(valor, cols[k].w - 3) as string[])[0] ?? "", x, y);
        if (rojo) doc.setTextColor(0);
        x += cols[k].w;
      });
      doc.setDrawColor(235);
      doc.line(M, y + 2, ANCHO - M, y + 2);
      y += 6.5;
    });
  };

  if (d.filas.length === 0) {
    doc.setFontSize(11);
    doc.text("No hay marcajes en este periodo.", M, y);
    y += 10;
  } else {
    tabla(
      [
        { titulo: "Persona", w: 58 },
        { titulo: "Día", w: 36 },
        { titulo: "Entradas", w: 42 },
        { titulo: "Salidas", w: 42 },
        { titulo: "Horas", w: 30 },
        { titulo: "Sitio", w: ANCHO - M * 2 - 208 },
      ],
      d.filas.map((f) => [
        f.persona,
        f.dia,
        f.entradas || "-",
        f.salidas || "-",
        f.horas + (f.raro ? " *" : ""),
        f.sitio + (f.lejos ? " (lejos)" : ""),
      ]),
      (i) => d.filas[i].lejos
    );
    if (d.filas.some((f) => f.raro)) {
      doc.setFontSize(8);
      doc.setTextColor(110);
      doc.text("* Hay un marcaje sin su pareja (entrada sin salida o al reves): esas horas no se cuentan.", M, y);
      doc.setTextColor(0);
      y += 6;
    }
  }

  if (d.totales.length > 0) {
    y += 6;
    if (y + 20 > PIE) {
      doc.addPage();
      y = 18;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Resumen por persona", M, y);
    y += 7;
    tabla(
      [
        { titulo: "Persona", w: 90 },
        { titulo: "Dias con marcaje", w: 50 },
        { titulo: "Horas trabajadas", w: 60 },
      ],
      d.totales.map((t) => [t.persona, String(t.dias), t.horas])
    );
  }

  if (d.anulados.length > 0) {
    y += 6;
    if (y + 20 > PIE) {
      doc.addPage();
      y = 18;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Marcajes anulados", M, y);
    y += 7;
    tabla(
      [
        { titulo: "Persona", w: 58 },
        { titulo: "Día", w: 36 },
        { titulo: "Hora", w: 26 },
        { titulo: "Tipo", w: 26 },
        { titulo: "Motivo", w: ANCHO - M * 2 - 146 },
      ],
      d.anulados.map((a) => [a.persona, a.dia, a.hora, a.tipo, a.motivo])
    );
  }

  piePaginas(doc, ANCHO, ALTO);
  return new File([doc.output("blob")], nombrePlanilla(d), { type: "application/pdf" });
}
