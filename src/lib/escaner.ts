/**
 * Lo que convierte la foto de un documento en algo que parece escaneado.
 *
 * Sin base de datos ni pantalla, para poder probarlo solo. Trabaja sobre los
 * pixeles (RGBA) de un lienzo.
 */

export type Modo = "documento" | "gris" | "color";

export const MODOS: { key: Modo; label: string; hint: string }[] = [
  { key: "documento", label: "Documento", hint: "Papel blanco y letra negra, como escaneado" },
  { key: "gris", label: "Gris", hint: "Sin color, con los tonos de la foto" },
  { key: "color", label: "Color", hint: "La foto tal cual" },
];

/**
 * Aplica el modo a los pixeles, en el mismo arreglo.
 *
 * "Documento" pasa a gris y estira el contraste usando la propia foto: el 2 %
 * mas oscuro se vuelve negro (la tinta) y del 90 % para arriba, blanco (el
 * papel). Asi una hoja fotografiada con sombra o con luz amarilla queda
 * blanca. Si la foto no tiene contraste (una hoja en blanco), no se estira,
 * para no inventar manchas.
 */
export function aplicarModo(px: Uint8ClampedArray, modo: Modo): void {
  if (modo === "color") return;
  const n = px.length / 4;
  const gris = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    gris[i] = (px[o] * 299 + px[o + 1] * 587 + px[o + 2] * 114) / 1000;
  }

  let bajo = 0;
  let alto = 255;
  if (modo === "documento") {
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) hist[gris[i]]++;
    const p2 = n * 0.02;
    const p90 = n * 0.9;
    let acum = 0;
    bajo = 0;
    alto = 255;
    let bajoListo = false;
    for (let v = 0; v < 256; v++) {
      acum += hist[v];
      if (!bajoListo && acum >= p2) {
        bajo = v;
        bajoListo = true;
      }
      if (acum >= p90) {
        alto = v;
        break;
      }
    }
    if (alto - bajo < 30) {
      bajo = 0;
      alto = 255;
    }
  }

  const rango = Math.max(1, alto - bajo);
  for (let i = 0; i < n; i++) {
    let v = ((gris[i] - bajo) * 255) / rango;
    if (modo === "documento") {
      // Limpia: lo casi blanco queda blanco y lo casi negro, negro.
      if (v > 205) v = 255;
      else if (v < 50) v = 0;
    }
    const final = v < 0 ? 0 : v > 255 ? 255 : v;
    const o = i * 4;
    px[o] = final;
    px[o + 1] = final;
    px[o + 2] = final;
  }
}

/** Nombre de archivo a partir del titulo: sin tildes ni simbolos raros. */
export function nombreDocumento(titulo: string, extension: "pdf" | "txt"): string {
  const base = titulo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return (base || "documento") + "." + extension;
}
