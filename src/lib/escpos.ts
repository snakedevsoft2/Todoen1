import type { AnchoTirilla, Linea } from "./tirilla";

/**
 * El recibo en comandos ESC/POS, el idioma que entienden casi todas las
 * termicas (Epson, Xprinter, las de bolsillo por Bluetooth...).
 *
 * Esto es lo que se manda cuando la impresora no tiene driver: en vez de un
 * dibujo, la impresora recibe el texto y lo escribe con su propia letra. Por
 * eso el ancho se cuenta en letras y no en milimetros: 32 en 58mm y 48 en 80mm,
 * que es lo que traen de fabrica.
 */

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/**
 * Cuantas letras caben por renglon: 32 en 58mm y 48 en 80mm.
 *
 * Es el ancho del cabezal en puntos dividido por el ancho de la letra de
 * fabrica (la "fuente A", de 12 puntos): 384/12 y 576/12.
 *
 * OJO, LEER ANTES DE TOCAR: aqui no se le pide NUNCA otra letra a la
 * impresora. Se intento dos veces pedir la letra chica (la "fuente B", de 9
 * puntos) para gastar menos papel: primero con ESC M 1 y despues, como opcion
 * que se prendia en el menu de imprimir, con ESC ! 1. Los dos comandos piden
 * la MISMA fuente B, y con ella la termica del mostrador solto el papel EN
 * BLANCO, sin una sola letra. Como la opcion quedaba guardada en el telefono,
 * una vez prendida todas las facturas de ese equipo salian con esa letra.
 * Para gastar menos papel se acorta el contenido (ver invoiceTirilla), que
 * eso si funciona en cualquier impresora.
 */
export function columnasDe(ancho: AnchoTirilla): number {
  return ancho === 58 ? 32 : 48;
}

/**
 * Las letras del español en la tabla PC437, la que traen de fabrica casi todas
 * las termicas. Se pide esa tabla de forma explicita al empezar, para que la ñ
 * no salga como otro simbolo en la que venga configurada distinto.
 */
const PC437: Record<string, number> = {
  á: 0xa0,
  í: 0xa1,
  ó: 0xa2,
  ú: 0xa3,
  ñ: 0xa4,
  Ñ: 0xa5,
  "¿": 0xa8,
  "¡": 0xad,
  é: 0x82,
  É: 0x90,
  ü: 0x81,
  Ü: 0x9a,
  "°": 0xf8,
};

/** Texto de una sola linea, con los espacios raros (el del signo de pesos) ya normales. */
function limpio(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\u00a0\u2007\u202f\t]/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-");
}

/** Pasa texto a los bytes que la impresora sabe escribir. Lo que no tiene, lo cambia por la letra sin tilde. */
export function aBytes(s: string): number[] {
  const out: number[] = [];
  for (const ch of limpio(s)) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x20 && c < 0x7f) {
      out.push(c);
    } else if (PC437[ch] !== undefined) {
      out.push(PC437[ch]);
    } else {
      const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (base && /^[\x20-\x7e]+$/.test(base)) for (const b of base) out.push(b.charCodeAt(0));
      else if (c >= 0x20) out.push(0x3f);
    }
  }
  return out;
}

/** Parte un texto en renglones de `cols` letras sin cortar palabras, salvo las que no caben enteras. */
export function partir(texto: string, cols: number): string[] {
  const out: string[] = [];
  for (const parrafo of limpio(texto).split(/\r?\n/)) {
    let linea = "";
    for (let palabra of parrafo.split(/\s+/).filter(Boolean)) {
      while (palabra.length > cols) {
        if (linea) {
          out.push(linea);
          linea = "";
        }
        out.push(palabra.slice(0, cols));
        palabra = palabra.slice(cols);
      }
      if (!palabra) continue;
      if (!linea) linea = palabra;
      else if (linea.length + 1 + palabra.length <= cols) linea += " " + palabra;
      else {
        out.push(linea);
        linea = palabra;
      }
    }
    if (linea) out.push(linea);
  }
  return out;
}

/** Etiqueta a la izquierda y valor a la derecha. Si no caben juntos, el valor baja al renglon de abajo. */
export function par(label: string, value: string, cols: number): string[] {
  const l = limpio(label).trim();
  const v = limpio(value).trim();
  if (l.length + 1 + v.length <= cols) return [l + " ".repeat(cols - l.length - v.length) + v];
  return [...partir(l, cols), ...partir(v, cols).map((x) => x.padStart(cols))];
}

/**
 * QR con el comando propio de la impresora (GS ( k), que traen casi todas las
 * termicas de los ultimos anos: la impresora lo dibuja sola, sin mandarle una
 * imagen punto por punto. `modulo` es el tamano de cada cuadrito en puntos.
 */
function qrNativo(b: number[], texto: string, modulo: number) {
  const datos = aBytes(texto);
  const largo = datos.length + 3;
  b.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // Modelo 2.
  b.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, modulo); // Tamano del cuadrito.
  b.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31); // Correccion M.
  b.push(GS, 0x28, 0x6b, largo & 0xff, (largo >> 8) & 0xff, 0x31, 0x50, 0x30, ...datos);
  b.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30); // Imprimir.
}

export function tirillaEscPos(lineas: Linea[], ancho: AnchoTirilla): Uint8Array {
  const cols = columnasDe(ancho);
  const b: number[] = [];
  const renglon = (s: string) => {
    for (const x of aBytes(s)) b.push(x);
    b.push(LF);
  };
  const alinear = (n: 0 | 1 | 2) => b.push(ESC, 0x61, n);
  const negrita = (si: boolean) => b.push(ESC, 0x45, si ? 1 : 0);
  // Doble alto: resalta sin gastar ancho, que en 58mm es lo que falta.
  const dobleAlto = (si: boolean) => b.push(GS, 0x21, si ? 0x01 : 0x00);

  b.push(ESC, 0x40); // Deja la impresora como recien prendida.
  b.push(ESC, 0x74, 0); // Tabla PC437.
  // Sin pedir otra letra: ver columnasDe.

  for (const l of lineas) {
    switch (l.t) {
      case "titulo":
        alinear(1);
        negrita(true);
        dobleAlto(true);
        partir(l.text, cols).forEach(renglon);
        dobleAlto(false);
        negrita(false);
        alinear(0);
        break;
      case "centro":
        alinear(1);
        negrita(Boolean(l.fuerte));
        partir(l.text, cols).forEach(renglon);
        negrita(false);
        alinear(0);
        break;
      case "sep":
        renglon("-".repeat(cols));
        break;
      case "par":
        negrita(Boolean(l.fuerte));
        par(l.label, l.value, cols).forEach(renglon);
        negrita(false);
        break;
      case "texto":
        partir(l.text, cols).forEach(renglon);
        break;
      case "total":
        renglon("=".repeat(cols));
        negrita(true);
        dobleAlto(true);
        par(l.label, l.value, cols).forEach(renglon);
        dobleAlto(false);
        negrita(false);
        break;
      case "espacio":
        b.push(LF);
        break;
      case "qr":
        alinear(1);
        qrNativo(b, l.text, ancho === 58 ? 6 : 8);
        b.push(LF);
        alinear(0);
        break;
    }
  }

  // Papel de sobra para que el corte no muerda el texto, y el corte si tiene
  // cuchilla (la que no tiene, lo ignora).
  b.push(LF, LF, LF, LF, GS, 0x56, 0x42, 0x00);
  return Uint8Array.from(b);
}
