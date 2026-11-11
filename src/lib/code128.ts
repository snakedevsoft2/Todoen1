/**
 * Codigo de barras Code 128, el que lleva el RIDE del SRI con la clave de
 * acceso (49 digitos).
 *
 * Archivo puro: devuelve los anchos de barras y espacios, y quien dibuja (el
 * PDF) los pinta como quiera. Los digitos van de a dos (juego C), que es lo
 * que deja el codigo corto; si sobra uno al final, ese va en el juego B.
 */

/** Anchos (barra, espacio, barra...) de cada simbolo, en modulos. 106 es la parada. */
const PATRONES = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const INICIO_B = 104;
const INICIO_C = 105;
const A_B = 100; // Dentro del juego C: pasar al B.
const PARADA = 106;

/** Los valores de los simbolos (sin el de control ni la parada) para un texto de solo digitos. */
function valoresDigitos(digitos: string): number[] {
  const pares = digitos.length - (digitos.length % 2);
  const v = [INICIO_C];
  for (let i = 0; i < pares; i += 2) v.push(Number(digitos.slice(i, i + 2)));
  if (pares < digitos.length) v.push(A_B, digitos.charCodeAt(pares) - 32);
  return v;
}

/** Los valores para texto ASCII imprimible, todo en el juego B. */
function valoresTexto(texto: string): number[] {
  const v = [INICIO_B];
  for (const ch of texto) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) throw new Error("Code 128: caracter no permitido.");
    v.push(c - 32);
  }
  return v;
}

/** Los simbolos completos: inicio, datos, digito de control y parada. */
export function simbolosCode128(texto: string): number[] {
  if (!texto) throw new Error("Code 128: no hay nada que codificar.");
  const v = /^\d{2,}$/.test(texto) ? valoresDigitos(texto) : valoresTexto(texto);
  const control = v.reduce((s, x, i) => s + x * (i === 0 ? 1 : i), 0) % 103;
  return [...v, control, PARADA];
}

/**
 * Los anchos en modulos, alternando barra y espacio y empezando con barra.
 * Sumados dan el largo total (sin los margenes en blanco, que pone quien dibuja).
 */
export function barrasCode128(texto: string): number[] {
  return simbolosCode128(texto).flatMap((s) => PATRONES[s].split("").map(Number));
}
